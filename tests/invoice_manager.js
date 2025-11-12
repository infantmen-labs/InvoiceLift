const anchor = require('@coral-xyz/anchor')
const { BN, web3 } = anchor
const { SystemProgram, LAMPORTS_PER_SOL, PublicKey, Keypair } = require('@solana/web3.js')
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require('@solana/spl-token')
const assert = require('assert')

// This test runs with `anchor test` against a local validator.
// It covers mint -> create_escrow -> fund -> set_settled.

describe('invoice_manager program', () => {
  // Use Anchor's local provider and workspace wiring
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = anchor.workspace.invoice_manager || anchor.workspace.InvoiceManager || new anchor.Program(require('../target/idl/invoice_manager.json'), provider)

  const connection = provider.connection
  const payer = provider.wallet.payer // assumes local id.json
  const investor = Keypair.generate()

  let usdcMint
  let invoice
  let escrowAuthority
  let escrowToken
  let sellerAta
  let investorAta

  it('setup accounts and airdrops', async () => {
    // airdrop to investor
    const sig = await connection.requestAirdrop(investor.publicKey, LAMPORTS_PER_SOL)
    await connection.confirmTransaction(sig, 'confirmed')

    // create a 6-decimal USDC-like mint owned by payer
    usdcMint = await createMint(connection, payer, payer.publicKey, null, 6)

    // seller (payer) ATA for settlement
    sellerAta = (await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, payer.publicKey)).address

    // investor ATA and mint some tokens
    investorAta = (await getOrCreateAssociatedTokenAccount(connection, investor, usdcMint, investor.publicKey)).address
    await mintTo(connection, payer, usdcMint, investorAta, payer.publicKey, 1_000_000n) // 1 USDC (6 dp)
  })

  it('mints -> creates escrow -> funds -> settles', async () => {
    const amount = new BN(500_000) // 0.5 USDC
    const dueDate = new BN(Math.floor(Date.now() / 1000) + 3600)
    invoice = Keypair.generate()

    // mint_invoice
    await program.methods
      .mintInvoice('demo', amount, dueDate)
      .accounts({
        invoice: invoice.publicKey,
        seller: payer.publicKey,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([invoice])
      .rpc()

    let acct = await program.account.invoice.fetch(invoice.publicKey)
    assert.ok(acct.status.open !== undefined)

    // create_escrow
    const [pda] = PublicKey.findProgramAddressSync([
      Buffer.from('escrow'),
      invoice.publicKey.toBuffer(),
    ], program.programId)
    escrowAuthority = pda
    escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)

    await program.methods
      .createEscrow()
      .accounts({
        invoice: invoice.publicKey,
        seller: payer.publicKey,
        usdcMint,
        escrowAuthority,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    acct = await program.account.invoice.fetch(invoice.publicKey)
    assert.ok(acct.escrowBump !== 0)

    // fund_invoice
    await program.methods
      .fundInvoice(amount)
      .accounts({
        invoice: invoice.publicKey,
        investor: investor.publicKey,
        investorAta,
        escrowToken,
        escrowAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([investor])
      .rpc()

    acct = await program.account.invoice.fetch(invoice.publicKey)
    assert.ok(acct.status.funded !== undefined)
    assert.equal(new BN(acct.fundedAmount).toString(), amount.toString())
    assert.equal(acct.investor.toBase58(), investor.publicKey.toBase58())

    // set_settled
    await program.methods
      .setSettled(amount)
      .accounts({
        invoice: invoice.publicKey,
        operator: payer.publicKey,
        sellerAta,
        escrowToken,
        escrowAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()

    acct = await program.account.invoice.fetch(invoice.publicKey)
    assert.ok(acct.status.settled !== undefined)
  })
})
