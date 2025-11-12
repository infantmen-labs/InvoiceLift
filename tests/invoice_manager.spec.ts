import { expect } from 'chai'
import * as anchor from '@coral-xyz/anchor'
import { BN, web3 } from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  getMint,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

// End-to-end Anchor test on devnet
// Requires: `anchor test` (builds, deploys program, runs tests)
// Uses wallet from Anchor.toml (must have SOL and USDC on devnet)
describe('invoice_manager program', () => {
  let connection: Connection
  let payer: Keypair
  let investor: Keypair

  let provider: anchor.AnchorProvider
  let program: anchor.Program
  let usdcMint: PublicKey
  let invoice: Keypair
  let escrowAuthority: PublicKey
  let escrowToken: PublicKey
  let sellerAta: PublicKey
  let investorAta: PublicKey

  before(async () => {
    // Use provider from environment (Anchor.toml)
    provider = anchor.AnchorProvider.env()
    anchor.setProvider(provider)
    connection = provider.connection

    // Use wallet from provider as payer (seller)
    payer = (provider.wallet as anchor.Wallet).payer
    // Generate investor keypair (or reuse payer for testing)
    investor = payer // For simplicity, use same wallet as investor

    const idl = require('../target/idl/invoice_manager.json')
    program = new anchor.Program(idl, provider)

    // Create a USDC-like mint (6 decimals)
    usdcMint = await createMint(connection, payer, payer.publicKey, null, 6)

    // Seller ATA for settlement
    const sellerAtaAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      usdcMint,
      payer.publicKey
    )
    sellerAta = sellerAtaAcc.address

    // Investor ATA and mint some tokens to fund
    const investorAtaAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      investor,
      usdcMint,
      investor.publicKey
    )
    investorAta = investorAtaAcc.address

    await mintTo(connection, payer, usdcMint, investorAta, payer.publicKey, 1_000_000n) // 1 USDC
  })

  it('fractional: init shares and fund', async () => {
    const amount = new BN(200_000) // 0.2 USDC
    const dueDate = new BN(Math.floor(Date.now() / 1000) + 3600)
    const invoice2 = Keypair.generate()

    // mint_invoice for new invoice
    await (program.methods as any)
      .mintInvoice('demo2', amount, dueDate)
      .accounts({
        invoice: invoice2.publicKey,
        seller: payer.publicKey,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([invoice2])
      .rpc()

    // derive escrow PDA and token account
    const [escrowAuthority2] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), invoice2.publicKey.toBuffer()],
      program.programId
    )
    const escrowToken2 = await getAssociatedTokenAddress(usdcMint, escrowAuthority2, true)

    // create_escrow for invoice2
    await (program.methods as any)
      .createEscrow()
      .accounts({
        invoice: invoice2.publicKey,
        seller: payer.publicKey,
        usdcMint,
        escrowAuthority: escrowAuthority2,
        escrowToken: escrowToken2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    // init_shares for invoice2 with a new mint
    const sharesMintKp = Keypair.generate()
    await (program.methods as any)
      .initShares()
      .accounts({
        invoice: invoice2.publicKey,
        payer: payer.publicKey,
        escrowAuthority: escrowAuthority2,
        sharesMint: sharesMintKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([sharesMintKp])
      .rpc()

    // verify invoice.shares_mint and mint authority
    let acct2: any = await (program.account as any).invoice.fetch(invoice2.publicKey)
    expect((acct2.sharesMint as PublicKey).toBase58()).to.equal(sharesMintKp.publicKey.toBase58())
    const sharesMintInfo = await getMint(connection, sharesMintKp.publicKey)
    expect(sharesMintInfo.mintAuthority?.toBase58()).to.equal(escrowAuthority2.toBase58())

    // fund_invoice_fractional mints shares to investor
    const investorSharesAta2 = await getAssociatedTokenAddress(sharesMintKp.publicKey, investor.publicKey)

    await (program.methods as any)
      .fundInvoiceFractional(amount)
      .accounts({
        invoice: invoice2.publicKey,
        investor: investor.publicKey,
        investorAta,
        escrowToken: escrowToken2,
        escrowAuthority: escrowAuthority2,
        sharesMint: sharesMintKp.publicKey,
        investorSharesAta: investorSharesAta2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([investor])
      .rpc()

    // verify funded amount and shares balance
    acct2 = await (program.account as any).invoice.fetch(invoice2.publicKey)
    expect(acct2.status.funded).to.not.equal(undefined)
    expect(new BN(acct2.fundedAmount).toString()).to.equal(amount.toString())
    const bal = await connection.getTokenAccountBalance(investorSharesAta2)
    expect(bal.value.amount).to.equal(amount.toString())
  })

  it('mints → creates escrow → funds → settles', async () => {
    const amount = new BN(500_000) // 0.5 USDC
    const dueDate = new BN(Math.floor(Date.now() / 1000) + 3600)
    invoice = Keypair.generate()

    // mint_invoice
    await (program.methods as any)
      .mintInvoice('demo', amount, dueDate)
      .accounts({
        invoice: invoice.publicKey,
        seller: payer.publicKey,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([invoice])
      .rpc()

    let acct: any = await (program.account as any).invoice.fetch(invoice.publicKey)
    expect(acct.status.open).to.not.equal(undefined)

    // create_escrow
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), invoice.publicKey.toBuffer()],
      program.programId
    )
    escrowAuthority = pda
    escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)

    await (program.methods as any)
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

    acct = await (program.account as any).invoice.fetch(invoice.publicKey)
    expect(acct.escrowBump).to.not.equal(0)

    // fund_invoice
    await (program.methods as any)
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

    acct = await (program.account as any).invoice.fetch(invoice.publicKey)
    expect(acct.status.funded).to.not.equal(undefined)
    expect(new BN(acct.fundedAmount).toString()).to.equal(amount.toString())
    expect((acct.investor as PublicKey).toBase58()).to.equal(investor.publicKey.toBase58())

    // set_settled
    await (program.methods as any)
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

    acct = await (program.account as any).invoice.fetch(invoice.publicKey)
    expect(acct.status.settled).to.not.equal(undefined)
  })
})
