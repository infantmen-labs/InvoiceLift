import { AnchorProvider, Program, Wallet, web3, Idl, BN } from '@coral-xyz/anchor'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token'

const DEFAULT_COMMITMENT: web3.Commitment = 'confirmed'

function loadKeypair(path: string): web3.Keypair {
  const secret = JSON.parse(readFileSync(path, 'utf8')) as number[]
  return web3.Keypair.fromSecretKey(Uint8Array.from(secret))
}

function loadKeypairFromJson(json: string): web3.Keypair {
  const secret = JSON.parse(json) as number[]
  return web3.Keypair.fromSecretKey(Uint8Array.from(secret))
}

export async function buildCancelListingV2Tx(
  program: Program,
  invoicePk: web3.PublicKey,
  seller: web3.PublicKey,
){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const sharesMint = new web3.PublicKey(inv.sharesMint)
  const [listingPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), invoicePk.toBuffer(), seller.toBuffer()],
    program.programId,
  )
  const [marketAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), listingPda.toBuffer()],
    program.programId,
  )
  const sellerSharesAta = await getAssociatedTokenAddress(sharesMint, seller)
  const preIxs: web3.TransactionInstruction[] = []
  const conn = (program.provider as any).connection as web3.Connection
  if (!(await conn.getAccountInfo(sellerSharesAta))) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      seller,
      sellerSharesAta,
      seller,
      sharesMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }
  const tx = await (program.methods as any)
    .cancelListingV2()
    .accounts({
      invoice: invoicePk,
      seller,
      listing: listingPda,
      marketAuthority: marketAuthority,
      sellerSharesAta: sellerSharesAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions(preIxs)
    .transaction()
  return { tx, listingPda, marketAuthority }
}

export async function buildCreateListingV2Tx(
  program: Program,
  invoicePk: web3.PublicKey,
  seller: web3.PublicKey,
  qty: BN,
  price: BN,
){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const sharesMint = new web3.PublicKey(inv.sharesMint)
  const usdcMint = new web3.PublicKey(inv.usdcMint)
  const [listingPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), invoicePk.toBuffer(), seller.toBuffer()],
    program.programId,
  )
  const [marketAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), listingPda.toBuffer()],
    program.programId,
  )
  const tx = await (program.methods as any)
    .createListingV2(qty, price)
    .accounts({
      invoice: invoicePk,
      seller,
      sharesMint: sharesMint,
      usdcMint: usdcMint,
      listing: listingPda,
      marketAuthority: marketAuthority,
      systemProgram: web3.SystemProgram.programId,
    })
    .transaction()
  return { tx, listingPda, marketAuthority }
}

export function getConnection(): web3.Connection {
  const url = process.env.CLUSTER_URL || 'https://api.devnet.solana.com'
  return new web3.Connection(url, DEFAULT_COMMITMENT)
}

export function getProvider(): AnchorProvider {
  const kpJson = process.env.RELAYER_KEYPAIR_JSON
  let keypair: web3.Keypair
  if (kpJson && kpJson.trim().length > 0) {
    try {
      keypair = loadKeypairFromJson(kpJson)
    } catch (e: any) {
      throw new Error(`Failed to parse RELAYER_KEYPAIR_JSON: ${e?.message || e}`)
    }
  } else {
    const kpPath = process.env.RELAYER_KEYPAIR_PATH
    if (!kpPath) throw new Error('RELAYER_KEYPAIR_PATH or RELAYER_KEYPAIR_JSON must be set')
    keypair = loadKeypair(kpPath)
  }
  const wallet = new Wallet(keypair)
  return new AnchorProvider(getConnection(), wallet, { commitment: DEFAULT_COMMITMENT })
}

export function getProgram(): Program {
  const programIdStr = process.env.PROGRAM_ID
  if (!programIdStr) throw new Error('PROGRAM_ID not set')
  const programId = new web3.PublicKey(programIdStr)
  const envIdl = process.env.INVOICE_MANAGER_IDL_JSON
  const repoIdlPath = resolve(__dirname, '..', 'idl', 'invoice_manager.json')
  const targetIdlPath = resolve(process.cwd(), '..', 'target', 'idl', 'invoice_manager.json')
  try {
    let idl: Idl
    if (envIdl && envIdl.trim().length > 0) {
      idl = JSON.parse(envIdl) as Idl
    } else {
      try {
        idl = JSON.parse(readFileSync(repoIdlPath, 'utf8')) as Idl
      } catch {
        idl = JSON.parse(readFileSync(targetIdlPath, 'utf8')) as Idl
      }
    }
    const provider = getProvider()
    return new (Program as any)(idl, provider) as Program
  } catch (e: any) {
    const source = envIdl && envIdl.trim().length > 0
      ? 'INVOICE_MANAGER_IDL_JSON env var'
      : `file at ${repoIdlPath} or ${targetIdlPath}`
    throw new Error(`Failed to load program from ${source}: ${e?.message || e}`)
  }
}

export async function fetchInvoice(program: Program, invoicePk: web3.PublicKey){
  return await (program.account as any)['invoice'].fetch(invoicePk)
}

export async function mintInvoice(
  program: Program,
  params: { metadataHash: string; amount: BN; dueDate: BN; usdcMint: web3.PublicKey }
){
  const invoice = web3.Keypair.generate()
  const seller = (program.provider as AnchorProvider).wallet.publicKey
  const sig = await (program.methods as any)
    .mintInvoice(params.metadataHash, params.amount, params.dueDate)
    .accounts({
      invoice: invoice.publicKey,
      seller,
      usdcMint: params.usdcMint,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([invoice])
    .rpc()
  return { invoicePubkey: invoice.publicKey, tx: sig }
}

export async function createEscrow(program: Program, invoicePk: web3.PublicKey){
  const invoice = await fetchInvoice(program, invoicePk)
  const usdcMint = new web3.PublicKey((invoice as any).usdcMint)
  const seller = (program.provider as AnchorProvider).wallet.publicKey
  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )
  const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)

  const sig = await (program.methods as any)
    .createEscrow()
    .accounts({
      invoice: invoicePk,
      seller,
      usdcMint,
      escrowAuthority,
      escrowToken,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc()
  return sig
}

export async function settleInvoice(program: Program, invoicePk: web3.PublicKey, _amount: BN){
  // Always settle exactly the fundedAmount recorded on-chain, ignoring caller-provided amount
  const invoice: any = await fetchInvoice(program, invoicePk)
  const fundedAmount = new BN(invoice.fundedAmount?.toString?.() ?? String(invoice.fundedAmount ?? '0'))
  if (fundedAmount.isZero()) {
    throw new Error('cannot settle invoice with zero funded amount')
  }

  const usdcMint = new web3.PublicKey((invoice as any).usdcMint)
  const seller = new web3.PublicKey((invoice as any).seller)
  // Derive global admin config PDA
  const [configPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )

  const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)
  const sellerAta = await getAssociatedTokenAddress(usdcMint, seller)

  const txSig = await program.methods
    .setSettled(fundedAmount)
    .accounts({
      invoice: invoicePk,
      config: configPda,
      operator: (program.provider as AnchorProvider).wallet.publicKey,
      sellerAta,
      escrowToken,
      escrowAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()

  return txSig
}

// Marketplace (escrow-based) transaction builders
export async function buildCreateListingTx(
  program: Program,
  invoicePk: web3.PublicKey,
  seller: web3.PublicKey,
  qty: BN,
  price: BN,
){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const sharesMint = new web3.PublicKey(inv.sharesMint)
  const usdcMint = new web3.PublicKey(inv.usdcMint)
  const [listingPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), invoicePk.toBuffer(), seller.toBuffer()],
    program.programId,
  )
  const [marketAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), listingPda.toBuffer()],
    program.programId,
  )
  const sellerSharesAta = await getAssociatedTokenAddress(sharesMint, seller)
  const escrowSharesAta = await getAssociatedTokenAddress(sharesMint, marketAuthority, true)
  const preIxs: web3.TransactionInstruction[] = []
  // Ensure seller shares ATA exists; payer is the seller
  const conn = (program.provider as any).connection as web3.Connection
  const sellerAtaInfo = await conn.getAccountInfo(sellerSharesAta)
  if (!sellerAtaInfo) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      seller,
      sellerSharesAta,
      seller,
      sharesMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }

  const tx = await (program.methods as any)
    .createListing(qty, price)
    .accounts({
      invoice: invoicePk,
      seller,
      sharesMint: sharesMint,
      usdcMint: usdcMint,
      listing: listingPda,
      marketAuthority: marketAuthority,
      sellerSharesAta: sellerSharesAta,
      escrowSharesAta: escrowSharesAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .preInstructions(preIxs)
    .transaction()
  return { tx, listingPda, marketAuthority }
}

export async function buildFulfillListingV2Tx(
  program: Program,
  invoicePk: web3.PublicKey,
  seller: web3.PublicKey,
  buyer: web3.PublicKey,
  qty: BN,
){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const sharesMint = new web3.PublicKey(inv.sharesMint)
  const usdcMint = new web3.PublicKey(inv.usdcMint)
  const [listingPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), invoicePk.toBuffer(), seller.toBuffer()],
    program.programId,
  )
  const [marketAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), listingPda.toBuffer()],
    program.programId,
  )
  const buyerUsdcAta = await getAssociatedTokenAddress(usdcMint, buyer)
  const sellerUsdcAta = await getAssociatedTokenAddress(usdcMint, seller)
  const sellerSharesAta = await getAssociatedTokenAddress(sharesMint, seller)
  const buyerSharesAta = await getAssociatedTokenAddress(sharesMint, buyer)
  const preIxs: web3.TransactionInstruction[] = []
  const conn = (program.provider as any).connection as web3.Connection
  // Ensure buyer ATAs exist
  if (!(await conn.getAccountInfo(buyerUsdcAta))) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      buyer,
      buyerUsdcAta,
      buyer,
      usdcMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }
  if (!(await conn.getAccountInfo(buyerSharesAta))) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      buyer,
      buyerSharesAta,
      buyer,
      sharesMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }

  const tx = await (program.methods as any)
    .fulfillListingV2(qty)
    .accounts({
      invoice: invoicePk,
      buyer,
      listing: listingPda,
      marketAuthority: marketAuthority,
      buyerUsdcAta: buyerUsdcAta,
      sellerUsdcAta: sellerUsdcAta,
      sellerSharesAta: sellerSharesAta,
      buyerSharesAta: buyerSharesAta,
      sharesMint: sharesMint,
      usdcMint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .preInstructions(preIxs)
    .transaction()
  return { tx, listingPda, marketAuthority }
}

export async function buildFulfillListingTx(
  program: Program,
  invoicePk: web3.PublicKey,
  seller: web3.PublicKey,
  buyer: web3.PublicKey,
  qty: BN,
){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const sharesMint = new web3.PublicKey(inv.sharesMint)
  const usdcMint = new web3.PublicKey(inv.usdcMint)
  const [listingPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), invoicePk.toBuffer(), seller.toBuffer()],
    program.programId,
  )
  const [marketAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), listingPda.toBuffer()],
    program.programId,
  )
  const buyerUsdcAta = await getAssociatedTokenAddress(usdcMint, buyer)
  const sellerUsdcAta = await getAssociatedTokenAddress(usdcMint, seller)
  const escrowSharesAta = await getAssociatedTokenAddress(sharesMint, marketAuthority, true)
  const buyerSharesAta = await getAssociatedTokenAddress(sharesMint, buyer)
  const preIxs: web3.TransactionInstruction[] = []
  const conn = (program.provider as any).connection as web3.Connection
  // Ensure buyer and seller USDC ATAs exist
  if (!(await conn.getAccountInfo(buyerUsdcAta))) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      buyer,
      buyerUsdcAta,
      buyer,
      usdcMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }
  if (!(await conn.getAccountInfo(sellerUsdcAta))) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      buyer,
      sellerUsdcAta,
      seller,
      usdcMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }

  const tx = await (program.methods as any)
    .fulfillListing(qty)
    .accounts({
      invoice: invoicePk,
      buyer,
      listing: listingPda,
      marketAuthority: marketAuthority,
      buyerUsdcAta: buyerUsdcAta,
      sellerUsdcAta: sellerUsdcAta,
      escrowSharesAta: escrowSharesAta,
      buyerSharesAta: buyerSharesAta,
      sharesMint: sharesMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .transaction()
  return { tx, listingPda, marketAuthority }
}

export async function buildCancelListingTx(
  program: Program,
  invoicePk: web3.PublicKey,
  seller: web3.PublicKey,
){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const sharesMint = new web3.PublicKey(inv.sharesMint)
  const [listingPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), invoicePk.toBuffer(), seller.toBuffer()],
    program.programId,
  )
  const [marketAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), listingPda.toBuffer()],
    program.programId,
  )
  const escrowSharesAta = await getAssociatedTokenAddress(sharesMint, marketAuthority, true)
  const sellerSharesAta = await getAssociatedTokenAddress(sharesMint, seller)
  const preIxs: web3.TransactionInstruction[] = []
  const conn = (program.provider as any).connection as web3.Connection
  const sellerAtaInfo = await conn.getAccountInfo(sellerSharesAta)
  if (!sellerAtaInfo) {
    preIxs.push(createAssociatedTokenAccountInstruction(
      seller,
      sellerSharesAta,
      seller,
      sharesMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ))
  }

  const tx = await (program.methods as any)
    .cancelListing()
    .accounts({
      invoice: invoicePk,
      seller,
      listing: listingPda,
      marketAuthority: marketAuthority,
      escrowSharesAta: escrowSharesAta,
      sellerSharesAta: sellerSharesAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()
  return { tx, listingPda, marketAuthority }
}

// Phase 2B: initialize per-invoice shares mint with escrow PDA as authority
export async function initShares(program: Program, invoicePk: web3.PublicKey){
  const payer = (program.provider as AnchorProvider).wallet.publicKey
  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )
  const sharesMint = web3.Keypair.generate()

  const sig = await (program.methods as any)
    .initShares()
    .accounts({
      invoice: invoicePk,
      payer,
      escrowAuthority,
      sharesMint: sharesMint.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([sharesMint])
    .rpc()

  return { sharesMint: sharesMint.publicKey, tx: sig }
}

// Phase 2B: fractional funding using shares mint
export async function fundInvoiceFractional(program: Program, invoicePk: web3.PublicKey, amount: BN){
  const inv: any = await (program.account as any)['invoice'].fetch(invoicePk)
  const usdcMint = new web3.PublicKey(inv.usdcMint)
  const sharesMint = new web3.PublicKey(inv.sharesMint)

  const investor = (program.provider as AnchorProvider).wallet.publicKey
  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )

  const investorAta = await getAssociatedTokenAddress(usdcMint, investor)
  const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)
  const investorSharesAta = await getAssociatedTokenAddress(sharesMint, investor)

  const txSig = await (program.methods as any)
    .fundInvoiceFractional(amount)
    .accounts({
      invoice: invoicePk,
      investor,
      investorAta,
      escrowToken,
      escrowAuthority,
      sharesMint,
      investorSharesAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc()

  return txSig
}

export async function fundInvoice(program: Program, invoicePk: web3.PublicKey, amount: BN){
  const invoice = await fetchInvoice(program, invoicePk)
  const usdcMint = new web3.PublicKey((invoice as any).usdcMint)
  const investor = (program.provider as AnchorProvider).wallet.publicKey

  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )

  const investorAta = await getAssociatedTokenAddress(usdcMint, investor)
  const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)

  const txSig = await (program.methods as any)
    .fundInvoice(amount)
    .accounts({
      invoice: invoicePk,
      investor,
      investorAta,
      escrowToken,
      escrowAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()

  return txSig
}
