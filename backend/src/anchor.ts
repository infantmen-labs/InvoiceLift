import { AnchorProvider, Program, Wallet, web3, Idl, BN } from '@coral-xyz/anchor'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'

const DEFAULT_COMMITMENT: web3.Commitment = 'confirmed'

function loadKeypair(path: string): web3.Keypair {
  const secret = JSON.parse(readFileSync(path, 'utf8')) as number[]
  return web3.Keypair.fromSecretKey(Uint8Array.from(secret))
}

export function getConnection(): web3.Connection {
  const url = process.env.CLUSTER_URL || 'https://api.devnet.solana.com'
  return new web3.Connection(url, DEFAULT_COMMITMENT)
}

export function getProvider(): AnchorProvider {
  const kpPath = process.env.RELAYER_KEYPAIR_PATH
  if (!kpPath) throw new Error('RELAYER_KEYPAIR_PATH not set')
  const keypair = loadKeypair(kpPath)
  const wallet = new Wallet(keypair)
  return new AnchorProvider(getConnection(), wallet, { commitment: DEFAULT_COMMITMENT })
}

export function getProgram(): Program {
  const programIdStr = process.env.PROGRAM_ID
  if (!programIdStr) throw new Error('PROGRAM_ID not set')
  const programId = new web3.PublicKey(programIdStr)
  const idlPath = resolve(process.cwd(), '..', 'target', 'idl', 'invoice_manager.json')
  try {
    const idl = JSON.parse(readFileSync(idlPath, 'utf8')) as Idl
    const provider = getProvider()
    return new (Program as any)(idl, provider) as Program
  } catch (e: any) {
    throw new Error(`Failed to load program: ${e.message}. IDL path: ${idlPath}`)
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

export async function settleInvoice(program: Program, invoicePk: web3.PublicKey, amount: BN){
  const invoice = await fetchInvoice(program, invoicePk)
  const usdcMint = new web3.PublicKey((invoice as any).usdcMint)
  const seller = new web3.PublicKey((invoice as any).seller)

  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )

  const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)
  const sellerAta = await getAssociatedTokenAddress(usdcMint, seller)

  const txSig = await program.methods
    .setSettled(amount)
    .accounts({
      invoice: invoicePk,
      operator: (program.provider as AnchorProvider).wallet.publicKey,
      sellerAta,
      escrowToken,
      escrowAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()

  return txSig
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
