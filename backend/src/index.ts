import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { web3, BN } from '@coral-xyz/anchor';
import { getProgram, fetchInvoice, settleInvoice, fundInvoice, mintInvoice as mintIx, createEscrow as createEscrowIx, initShares as initSharesIx, fundInvoiceFractional as fundInvoiceFractionalIx, buildCreateListingTx, buildFulfillListingTx, buildCancelListingTx, buildFulfillListingV2Tx, buildCreateListingV2Tx, buildCancelListingV2Tx } from './anchor';
import cors from 'cors';
import { readFileSync } from 'fs';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getMint, createApproveCheckedInstruction, createRevokeInstruction, getAccount, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { resolve } from 'path';
import { initDb, upsertInvoiceFromChain, saveTxLog, getInvoiceRow, listInvoices, countInvoices, getInvoiceTotals, hasIdempotencyKey, recordWebhookEvent, markWebhookProcessed, getPositionsCache, setPositionsCache, clearPositionsCache, getPositionsHistory, listInvoicesWithSharesMint, createListing, getListing, listListingsByInvoice, listListingsBySeller, cancelListing, fillListingPartial, listOpenListings, upsertKycRecord, getKycRecord, insertDocHash, listDocHashes, upsertCreditScore, getCreditScore, insertWaitlistEntry, listWaitlistEntries } from './db';
import { logger } from './logger';
import { validateConfig } from './config';
import { KycSchema, DocSchema, ScoreSchema, WebhookPaymentSchema, ListingCreateSchema, ListingCancelSchema, ListingFillSchema } from './validation';
import { runIndexer } from './indexer';

const app = express();
app.use(bodyParser.json({
  verify: (req: any, _res, buf) => {
    try { req.rawBody = buf.toString('utf8'); } catch {}
  }
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use((req, _res, next) => { try { logger.info({ method: req.method, path: req.path }, 'req'); } catch {} next(); });

// Initialize SQLite database
initDb();
const conf = validateConfig();
logger.info({ env: conf.env, issues: conf.issues.length }, 'config validated');

// Admin gating for backend-mode endpoints
const ADMIN_WALLETS = String(process.env.ADMIN_WALLETS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
function isAdminReq(req: Request){
  const w = req.header('x-admin-wallet') || '';
  return !!w && ADMIN_WALLETS.includes(w);
}

const WAITLIST_ADMIN_KEY = String(process.env.WAITLIST_ADMIN_KEY || '').trim();

const LISTINGS_REQUIRE_SIG = process.env.LISTINGS_REQUIRE_SIG !== 'false';
const LISTING_SIG_TOL_SEC = Number(process.env.LISTING_SIG_TOL_SEC ?? '300');

function utf8(str: string){ return Buffer.from(str, 'utf8') }
function b64ToBytes(b64: string){ return Buffer.from(b64, 'base64') }
function withinTolerance(ts: number){ return Math.abs(Date.now() - ts) <= LISTING_SIG_TOL_SEC * 1000 }
function createMessage(invoicePk: string, seller: string, price: string, qty: string, ts: number){
  return `listing:create\ninvoicePk=${invoicePk}\nseller=${seller}\nprice=${price}\nqty=${qty}\nts=${ts}`
}
function cancelMessage(id: number, seller: string, ts: number){
  return `listing:cancel\nid=${id}\nseller=${seller}\nts=${ts}`
}
function fillMessage(id: number, buyer: string, qty: string, ts: number){
  return `listing:fill\nid=${id}\nbuyer=${buyer}\nqty=${qty}\nts=${ts}`
}
function verifySig(message: string, wallet: string, signatureB64: string){
  try {
    const pkBytes = bs58.decode(wallet);
    const sigBytes = b64ToBytes(signatureB64);
    return nacl.sign.detached.verify(utf8(message), sigBytes, pkBytes);
  } catch { return false }
}

async function setRecentBlockhashSafe(tx: web3.Transaction, conn: web3.Connection){
  try {
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
  } catch {
    tx.recentBlockhash = '11111111111111111111111111111111';
  }
}

async function computeInvoicePositions(invoicePkStr: string){
  const program = getProgram();
  const invoicePk = new web3.PublicKey(invoicePkStr);
  const data: any = await fetchInvoice(program, invoicePk);
  const DEFAULT_PK = '11111111111111111111111111111111';

  // If shares_mint exists, derive positions from SPL token balances
  const sharesMintStr: string = data.sharesMint && data.sharesMint.toBase58 ? data.sharesMint.toBase58() : String(data.sharesMint || '');
  if (sharesMintStr && sharesMintStr !== DEFAULT_PK) {
    // Try cache first
    const cached = getPositionsCache(invoicePkStr);
    const ttlMs = Number(process.env.POSITIONS_TTL_MS ?? '30000');
    if (cached && (Date.now() - cached.updatedAt) < ttlMs) {
      return cached.positions as Array<{ wallet: string; amount: string }>;
    }

    const conn = (program.provider as any).connection as web3.Connection;
    const resp = await conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: sharesMintStr } },
      ],
    });
    const byOwner = new Map<string, bigint>();
    for (const it of resp) {
      try {
        const info: any = (it.account as any).data?.parsed?.info;
        const owner: string = info?.owner || '';
        const amtStr: string = info?.tokenAmount?.amount ?? '0';
        const amt = BigInt(amtStr);
        if (owner && amt > 0n) {
          byOwner.set(owner, (byOwner.get(owner) ?? 0n) + amt);
        }
      } catch {}
    }
    const positions = Array.from(byOwner.entries()).map(([wallet, amount]) => ({ wallet, amount: amount.toString() }));
    try { setPositionsCache(invoicePkStr, positions); } catch {}
    return positions;
  }

  // Fallback (pre-fractional): single investor based on funded_amount
  const investor = (data.investor || '').toBase58 ? data.investor.toBase58() : String(data.investor || '');
  const fundedAmount = data.fundedAmount?.toString?.() ?? String(data.fundedAmount ?? '0');
  const positions: Array<{ wallet: string; amount: string }> = [];
  if (investor && investor !== DEFAULT_PK && BigInt(fundedAmount) > 0n) {
    positions.push({ wallet: investor, amount: fundedAmount });
  }
  return positions;
}

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.post('/api/waitlist', async (req: Request, res: Response) => {
  try {
    const { name, email, source } = req.body as { name?: string; email?: string; source?: string };
    const emailRaw = String(email || '').trim();
    if (!emailRaw || !emailRaw.includes('@')) {
      return res.status(400).json({ ok: false, error: 'invalid email' });
    }
    const entry = insertWaitlistEntry({
      name: name ? String(name).trim() : null,
      email: emailRaw,
      source: source ? String(source).trim() : null,
    });
    res.status(200).json({ ok: true, entry });
  } catch (e: any) {
    try { logger.error({ err: e?.message || String(e) }, 'waitlist insert failed'); } catch {}
    res.status(500).json({ ok: false, error: e?.message || 'failed to join waitlist' });
  }
});

app.get('/api/waitlist', async (req: Request, res: Response) => {
  try {
    const key = String(req.query.key || '');
    if (!WAITLIST_ADMIN_KEY || key !== WAITLIST_ADMIN_KEY) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    let limit = Number(req.query.limit ?? '1000');
    if (!Number.isFinite(limit) || limit <= 0) limit = 1000;
    const entries = listWaitlistEntries(limit);
    res.status(200).json({ ok: true, entries });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'failed to load waitlist' });
  }
});

app.get('/api/listings/open', async (_req: Request, res: Response) => {
  try {
    const rows = listOpenListings(200);
    // Enrich with escrowDeposited
    const program = getProgram();
    const conn = (program.provider as any).connection as web3.Connection;
    // Cache sharesMint per invoice
    const uniqInvoices = Array.from(new Set(rows.map((r: any) => r.invoicePk))).filter(Boolean);
    const sharesMintByInvoice = new Map<string, web3.PublicKey | null>();
    const DEFAULT_PK = '11111111111111111111111111111111';
    for (const invPk of uniqInvoices) {
      try {
        const inv = await fetchInvoice(program, new web3.PublicKey(invPk));
        const s: string = inv.sharesMint && inv.sharesMint.toBase58 ? inv.sharesMint.toBase58() : String(inv.sharesMint || '');
        const mint = s && s !== DEFAULT_PK ? new web3.PublicKey(s) : null;
        sharesMintByInvoice.set(invPk, mint);
      } catch { sharesMintByInvoice.set(invPk, null) }
    }
    const listings = await Promise.all(rows.map(async (row: any) => {
      try {
        const sharesMint = sharesMintByInvoice.get(row.invoicePk) || null;
        if (!sharesMint) return { ...row, escrowDeposited: false };
        const invoicePk = new web3.PublicKey(row.invoicePk);
        const sellerPk = new web3.PublicKey(row.seller);
        const [listingPda] = web3.PublicKey.findProgramAddressSync([
          Buffer.from('listing'), invoicePk.toBuffer(), sellerPk.toBuffer()
        ], program.programId);
        const [marketAuthority] = web3.PublicKey.findProgramAddressSync([
          Buffer.from('market'), listingPda.toBuffer()
        ], program.programId);
        // Try fetch on-chain listing to get remaining_qty (supports V1/V2)
        let onChainRemaining: string | null = null;
        try {
          const acc: any = await (program.account as any)['listing'].fetch(listingPda);
          const rq = acc?.remainingQty?.toString?.() ?? String(acc?.remainingQty ?? '0');
          onChainRemaining = rq;
        } catch {}
        const escrowSharesAta = await getAssociatedTokenAddress(sharesMint, marketAuthority, true);
        const bal = await conn.getTokenAccountBalance(escrowSharesAta).catch(() => null);
        const amt = bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
        const fallbackRemain = String(row.remaining_qty ?? row.qty ?? '0');
        const remainingQty = onChainRemaining ?? (amt > 0n ? amt.toString() : fallbackRemain);
        const status = (row.status === 'Open' && onChainRemaining !== null && BigInt(remainingQty) === 0n) ? 'Filled' : row.status;
        return { ...row, escrowDeposited: amt > 0n, remainingQty, status, onChain: onChainRemaining !== null };
      } catch { return { ...row, escrowDeposited: false } }
    }));
    res.status(200).json({ ok: true, listings });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// On-chain marketplace: build unsigned transaction for seller to deposit shares and create listing account (escrow-based)
app.post('/api/listings/:id/build-create-tx', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const sellerHeader = String(req.header('x-wallet') || '')
    if (!sellerHeader || sellerHeader !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(sellerHeader)
    const { tx } = await buildCreateListingTx(program, invoicePk, sellerPk, new BN(String(listing.qty)), new BN(String(listing.price)))
    // Set payer to seller and recent blockhash
    tx.feePayer = sellerPk
    await setRecentBlockhashSafe(tx, (program.provider as any).connection)
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2: build revoke seller shares allowance
app.post('/api/listings/:id/build-revoke-shares', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const sellerHeader = String(req.header('x-wallet') || '')
    if (!sellerHeader || sellerHeader !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(sellerHeader)
    const inv: any = await fetchInvoice(program, invoicePk)
    const sharesMint = new web3.PublicKey(inv.sharesMint)
    const sellerSharesAta = await getAssociatedTokenAddress(sharesMint, sellerPk)
    const tx = new web3.Transaction()
    tx.add(createRevokeInstruction(sellerSharesAta, sellerPk, [], TOKEN_PROGRAM_ID))
    tx.feePayer = sellerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2: build revoke buyer USDC allowance
app.post('/api/listings/:id/build-revoke-usdc', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const buyerHeader = String(req.header('x-wallet') || '')
    if (!buyerHeader) return res.status(403).json({ ok: false, error: 'buyer wallet required' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const buyerPk = new web3.PublicKey(buyerHeader)
    const inv: any = await fetchInvoice(program, invoicePk)
    const usdcMint = new web3.PublicKey(inv.usdcMint)
    const buyerUsdcAta = await getAssociatedTokenAddress(usdcMint, buyerPk)
    const tx = new web3.Transaction()
    tx.add(createRevokeInstruction(buyerUsdcAta, buyerPk, [], TOKEN_PROGRAM_ID))
    tx.feePayer = buyerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2: build cancel tx (revokes allowance and marks remaining_qty=0)
app.post('/api/listings/:id/build-cancel-v2-tx', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const sellerHeader = String(req.header('x-wallet') || '')
    if (!sellerHeader || sellerHeader !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(sellerHeader)
    const { tx } = await buildCancelListingV2Tx(program, invoicePk, sellerPk)
    tx.feePayer = sellerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2: build unsigned transaction for seller to initialize listing account (no escrow)
app.post('/api/listings/:id/build-create-v2-tx', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const sellerHeader = String(req.header('x-wallet') || '')
    if (!sellerHeader || sellerHeader !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(sellerHeader)
    const { tx } = await buildCreateListingV2Tx(program, invoicePk, sellerPk, new BN(String(listing.qty)), new BN(String(listing.price)))
    // Set payer to seller and recent blockhash
    tx.feePayer = sellerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2 (allowance-based): build seller shares approve tx
app.post('/api/listings/:id/build-approve-shares', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const sellerHeader = String(req.header('x-wallet') || '')
    if (!sellerHeader || sellerHeader !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(sellerHeader)
    // derive PDAs
    const [listingPda] = web3.PublicKey.findProgramAddressSync([
      Buffer.from('listing'), invoicePk.toBuffer(), sellerPk.toBuffer()
    ], program.programId)
    const [marketAuthority] = web3.PublicKey.findProgramAddressSync([
      Buffer.from('market'), listingPda.toBuffer()
    ], program.programId)
    // fetch invoice to get shares mint
    const inv: any = await fetchInvoice(program, invoicePk)
    const sharesMint = new web3.PublicKey(inv.sharesMint)
    const conn = (program.provider as any).connection as web3.Connection
    const mintInfo = await getMint(conn, sharesMint)
    const decimals = mintInfo.decimals
    const sellerSharesAta = await getAssociatedTokenAddress(sharesMint, sellerPk)
    const preIxs: web3.TransactionInstruction[] = []
    if (!(await conn.getAccountInfo(sellerSharesAta))) {
      preIxs.push(createAssociatedTokenAccountInstruction(
        sellerPk,
        sellerSharesAta,
        sellerPk,
        sharesMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ))
    }
    const amount = BigInt(String(listing.qty))
    const approveIx = createApproveCheckedInstruction(
      sellerSharesAta,
      sharesMint,
      marketAuthority,
      sellerPk,
      amount,
      decimals,
      [],
      TOKEN_PROGRAM_ID,
    )
    const tx = new web3.Transaction()
    for (const ix of preIxs) tx.add(ix)
    tx.add(approveIx)
    tx.feePayer = sellerPk
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64, marketAuthority: marketAuthority.toBase58() })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2 (allowance-based): build buyer USDC approve tx
app.post('/api/listings/:id/build-approve-usdc', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const buyerHeader = String(req.header('x-wallet') || '')
    if (!buyerHeader) return res.status(403).json({ ok: false, error: 'buyer wallet required' })
    const { qty } = req.body as { qty: string }
    if (!qty) return res.status(400).json({ ok: false, error: 'qty required' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(listing.seller)
    const buyerPk = new web3.PublicKey(buyerHeader)
    const [listingPda] = web3.PublicKey.findProgramAddressSync([
      Buffer.from('listing'), invoicePk.toBuffer(), sellerPk.toBuffer()
    ], program.programId)
    const [marketAuthority] = web3.PublicKey.findProgramAddressSync([
      Buffer.from('market'), listingPda.toBuffer()
    ], program.programId)
    const inv: any = await fetchInvoice(program, invoicePk)
    const usdcMint = new web3.PublicKey(inv.usdcMint)
    const conn = (program.provider as any).connection as web3.Connection
    const mintInfo = await getMint(conn, usdcMint)
    const decimals = mintInfo.decimals
    const buyerUsdcAta = await getAssociatedTokenAddress(usdcMint, buyerPk)
    const preIxs: web3.TransactionInstruction[] = []
    if (!(await conn.getAccountInfo(buyerUsdcAta))) {
      preIxs.push(createAssociatedTokenAccountInstruction(
        buyerPk,
        buyerUsdcAta,
        buyerPk,
        usdcMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ))
    }
    const qtyBase = BigInt(String(qty))
    const priceBase = BigInt(String(listing.price))
    const total = (qtyBase * priceBase) / 1_000_000n
    const approveIx = createApproveCheckedInstruction(
      buyerUsdcAta,
      usdcMint,
      marketAuthority,
      buyerPk,
      total,
      decimals,
      [],
      TOKEN_PROGRAM_ID,
    )
    const tx = new web3.Transaction()
    for (const ix of preIxs) tx.add(ix)
    tx.add(approveIx)
    tx.feePayer = buyerPk
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64, marketAuthority: marketAuthority.toBase58(), total: total.toString() })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace V2: build fulfill tx (assumes allowances already set)
app.post('/api/listings/:id/build-fulfill-v2', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const buyerHeader = String(req.header('x-wallet') || '')
    if (!buyerHeader) return res.status(403).json({ ok: false, error: 'buyer wallet required' })
    const { qty } = req.body as { qty: string }
    if (!qty) return res.status(400).json({ ok: false, error: 'qty required' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(listing.seller)
    const buyerPk = new web3.PublicKey(buyerHeader)
    const { tx } = await buildFulfillListingV2Tx(program, invoicePk, sellerPk, buyerPk, new BN(String(qty)))
    tx.feePayer = buyerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace: build unsigned transaction for buyer to fulfill listing atomically (USDC -> seller, shares -> buyer)
app.post('/api/listings/:id/build-fulfill-tx', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const buyerHeader = String(req.header('x-wallet') || '')
    if (!buyerHeader) return res.status(403).json({ ok: false, error: 'buyer wallet required' })
    const { qty } = req.body as { qty: string }
    if (!qty) return res.status(400).json({ ok: false, error: 'qty required' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(listing.seller)
    const buyerPk = new web3.PublicKey(buyerHeader)
    const { tx } = await buildFulfillListingTx(program, invoicePk, sellerPk, buyerPk, new BN(String(qty)))
    tx.feePayer = buyerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// On-chain marketplace: build unsigned transaction for seller to cancel listing (return remaining shares)
app.post('/api/listings/:id/build-cancel-tx', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' })
    const listing = getListing(id)
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' })
    const sellerHeader = String(req.header('x-wallet') || '')
    if (!sellerHeader || sellerHeader !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' })
    const program = getProgram()
    const invoicePk = new web3.PublicKey(listing.invoicePk)
    const sellerPk = new web3.PublicKey(sellerHeader)
    const { tx } = await buildCancelListingTx(program, invoicePk, sellerPk)
    tx.feePayer = sellerPk
    tx.recentBlockhash = (await (program.provider as any).connection.getLatestBlockhash()).blockhash
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')
    res.status(200).json({ ok: true, tx: b64 })
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) })
  }
})

// Listings: list by invoice
app.get('/api/invoice/:id/listings', async (req: Request, res: Response) => {
  try {
    const invoicePkStr = String(req.params.id);
    const status = (req.query.status as 'Open' | 'Filled' | 'Canceled' | undefined) || undefined;
    const baseRows = listListingsByInvoice(invoicePkStr, status);

    // Enrich with on-chain escrow deposit status (escrow_shares_ata balance > 0)
    const program = getProgram();
    const conn = (program.provider as any).connection as web3.Connection;
    const invoicePk = new web3.PublicKey(invoicePkStr);
    const inv = await fetchInvoice(program, invoicePk);
    const sharesMintStr: string = inv.sharesMint && inv.sharesMint.toBase58 ? inv.sharesMint.toBase58() : String(inv.sharesMint || '');
    const DEFAULT_PK = '11111111111111111111111111111111';
    const sharesMint = sharesMintStr && sharesMintStr !== DEFAULT_PK ? new web3.PublicKey(sharesMintStr) : null;

    const listings = await Promise.all(baseRows.map(async (row) => {
      try {
        if (!sharesMint) return { ...row, escrowDeposited: false };
        const sellerPk = new web3.PublicKey(row.seller);
        const [listingPda] = web3.PublicKey.findProgramAddressSync([
          Buffer.from('listing'), invoicePk.toBuffer(), sellerPk.toBuffer()
        ], program.programId);
        const [marketAuthority] = web3.PublicKey.findProgramAddressSync([
          Buffer.from('market'), listingPda.toBuffer()
        ], program.programId);
        // Try on-chain listing remaining_qty (works for V2 w/out escrow as well)
        let onChainRemaining: string | null = null;
        try {
          const acc: any = await (program.account as any)['listing'].fetch(listingPda);
          const rq = acc?.remainingQty?.toString?.() ?? String(acc?.remainingQty ?? '0');
          onChainRemaining = rq;
        } catch {}
        const escrowSharesAta = await getAssociatedTokenAddress(sharesMint, marketAuthority, true);
        const bal = await conn.getTokenAccountBalance(escrowSharesAta).catch(() => null);
        const amt = bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
        const escrowDeposited = amt > 0n;
        const fallbackRemain = String((row as any).remaining_qty ?? (row as any).qty ?? '0');
        const remainingQty = onChainRemaining ?? (amt > 0n ? amt.toString() : fallbackRemain);
        const status = (row.status === 'Open' && onChainRemaining !== null && BigInt(remainingQty) === 0n) ? 'Filled' : row.status;
        return { ...row, escrowDeposited, remainingQty, status, onChain: onChainRemaining !== null };
      } catch {
        return { ...row, escrowDeposited: false };
      }
    }));

    res.status(200).json({ ok: true, listings });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Listings: list by seller
app.get('/api/listings', async (req: Request, res: Response) => {
  try {
    const seller = (req.query.seller as string) || '';
    const status = (req.query.status as 'Open' | 'Filled' | 'Canceled' | undefined) || undefined;
    if (!seller) return res.status(400).json({ ok: false, error: 'seller required' });
    const rows = listListingsBySeller(seller, status);
    // Enrich with escrowDeposited similar to open
    const program = getProgram();
    const conn = (program.provider as any).connection as web3.Connection;
    const uniqInvoices = Array.from(new Set(rows.map((r: any) => r.invoicePk))).filter(Boolean);
    const sharesMintByInvoice = new Map<string, web3.PublicKey | null>();
    const DEFAULT_PK = '11111111111111111111111111111111';
    for (const invPk of uniqInvoices) {
      try {
        const inv = await fetchInvoice(program, new web3.PublicKey(invPk));
        const s: string = inv.sharesMint && inv.sharesMint.toBase58 ? inv.sharesMint.toBase58() : String(inv.sharesMint || '');
        const mint = s && s !== DEFAULT_PK ? new web3.PublicKey(s) : null;
        sharesMintByInvoice.set(invPk, mint);
      } catch { sharesMintByInvoice.set(invPk, null) }
    }
    const listings = await Promise.all(rows.map(async (row: any) => {
      try {
        const sharesMint = sharesMintByInvoice.get(row.invoicePk) || null;
        if (!sharesMint) return { ...row, escrowDeposited: false };
        const invoicePk = new web3.PublicKey(row.invoicePk);
        const sellerPk = new web3.PublicKey(row.seller);
        const [listingPda] = web3.PublicKey.findProgramAddressSync([
          Buffer.from('listing'), invoicePk.toBuffer(), sellerPk.toBuffer()
        ], program.programId);
        const [marketAuthority] = web3.PublicKey.findProgramAddressSync([
          Buffer.from('market'), listingPda.toBuffer()
        ], program.programId);
        // Try on-chain listing remaining_qty
        let onChainRemaining: string | null = null;
        try {
          const acc: any = await (program.account as any)['listing'].fetch(listingPda);
          const rq = acc?.remainingQty?.toString?.() ?? String(acc?.remainingQty ?? '0');
          onChainRemaining = rq;
        } catch {}
        const escrowSharesAta = await getAssociatedTokenAddress(sharesMint, marketAuthority, true);
        const bal = await conn.getTokenAccountBalance(escrowSharesAta).catch(() => null);
        const amt = bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
        const fallbackRemain = String((row as any).remaining_qty ?? (row as any).qty ?? '0');
        const remainingQty = onChainRemaining ?? (amt > 0n ? amt.toString() : fallbackRemain);
        const status = (row.status === 'Open' && onChainRemaining !== null && BigInt(remainingQty) === 0n) ? 'Filled' : row.status;
        return { ...row, escrowDeposited: amt > 0n, remainingQty, status, onChain: onChainRemaining !== null };
      } catch { return { ...row, escrowDeposited: false } }
    }));
    res.status(200).json({ ok: true, listings });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Listings: create (server-signed offer)
// Security note: signature verification to be added; for now require x-wallet header to match seller
app.post('/api/listings', async (req: Request, res: Response) => {
  try {
    const parsed0 = ListingCreateSchema.safeParse(req.body)
    if (!parsed0.success) return res.status(400).json({ ok: false, error: parsed0.error.errors?.[0]?.message || 'invalid body' });
    const { invoicePk, seller, price, qty, signature, ts } = parsed0.data as { invoicePk: string; seller: string; price: string; qty: string; signature?: string | null; ts?: number };
    const headerWallet = String(req.header('x-wallet') || '');
    if (!invoicePk || !seller || !price || !qty) return res.status(400).json({ ok: false, error: 'missing fields' });
    if (!headerWallet || headerWallet !== seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' });
    if (LISTINGS_REQUIRE_SIG) {
      if (!signature || typeof ts !== 'number' || !withinTolerance(ts)) return res.status(401).json({ ok: false, error: 'bad signature' });
      const msg = createMessage(String(invoicePk), String(seller), String(price), String(qty), Number(ts));
      const ok = verifySig(msg, seller, signature);
      if (!ok) return res.status(401).json({ ok: false, error: 'bad signature' });
    }
    // Enforce that total open listings do not exceed on-chain share balance for this invoice
    let qtyBase: bigint
    try {
      qtyBase = BigInt(String(qty));
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid qty' });
    }
    if (qtyBase <= 0n) return res.status(400).json({ ok: false, error: 'qty must be > 0' });

    const positions = await computeInvoicePositions(String(invoicePk));
    const sellerPos = positions.find((p: any) => p.wallet === seller);
    const balanceBase = sellerPos ? (() => { try { return BigInt(String(sellerPos.amount)); } catch { return 0n } })() : 0n;
    if (balanceBase <= 0n) {
      return res.status(400).json({ ok: false, error: 'seller has no shares for this invoice' });
    }

    const existing = listListingsByInvoice(String(invoicePk), 'Open').filter((l) => l.seller === seller);
    let reservedBase = 0n;
    for (const l of existing) {
      try {
        const remain = l.remainingQty ?? l.qty;
        reservedBase += BigInt(String(remain));
      } catch {}
    }
    const availableBase = balanceBase > reservedBase ? balanceBase - reservedBase : 0n;
    if (qtyBase > availableBase) {
      const maxShares = Number(availableBase) / 1_000_000;
      const msg = maxShares > 0
        ? `qty exceeds available shares (${maxShares.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares)`
        : 'no available shares to list for this invoice';
      return res.status(400).json({ ok: false, error: msg });
    }

    const row = createListing({ invoicePk, seller, price: String(price), qty: qtyBase.toString(), signature: signature || null });
    res.status(200).json({ ok: true, listing: row });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Listings: cancel by seller
app.post('/api/listings/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' });
    const headerWallet = String(req.header('x-wallet') || '');
    const parsed0 = ListingCancelSchema.safeParse(req.body || {})
    if (!parsed0.success) return res.status(400).json({ ok: false, error: parsed0.error.errors?.[0]?.message || 'invalid body' });
    const { signature, ts } = parsed0.data as { signature?: string; ts?: number };
    const listing = getListing(id);
    if (!listing) return res.status(404).json({ ok: false, error: 'not found' });
    if (!headerWallet || headerWallet !== listing.seller) return res.status(403).json({ ok: false, error: 'wallet mismatch' });
    if (LISTINGS_REQUIRE_SIG) {
      if (!signature || typeof ts !== 'number' || !withinTolerance(ts)) return res.status(401).json({ ok: false, error: 'bad signature' });
      const msg = cancelMessage(id, listing.seller, Number(ts));
      const ok = verifySig(msg, listing.seller, signature);
      if (!ok) return res.status(401).json({ ok: false, error: 'bad signature' });
    }
    const out = cancelListing(id, listing.seller);
    res.status(200).json({ ok: true, listing: out });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Listings: fill (buyer request) – partial fills allowed
app.post('/api/listings/:id/fill', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad id' });
    const parsed0 = ListingFillSchema.safeParse(req.body)
    if (!parsed0.success) return res.status(400).json({ ok: false, error: parsed0.error.errors?.[0]?.message || 'invalid body' });
    const { qty, signature, ts } = parsed0.data as { qty: string; signature?: string; ts?: number };
    const buyer = String(req.header('x-wallet') || '');
    if (!buyer) return res.status(403).json({ ok: false, error: 'buyer wallet required' });
    if (!qty) return res.status(400).json({ ok: false, error: 'qty required' });
    if (LISTINGS_REQUIRE_SIG) {
      if (!signature || typeof ts !== 'number' || !withinTolerance(ts)) return res.status(401).json({ ok: false, error: 'bad signature' });
      const msg = fillMessage(id, buyer, String(qty), Number(ts));
      const ok = verifySig(msg, buyer, signature);
      if (!ok) return res.status(401).json({ ok: false, error: 'bad signature' });
    }
    // TODO: perform on-chain transfer in a future step
    const out = fillListingPartial(id, String(qty));
    res.status(200).json({ ok: true, listing: out });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Positions history (diffs) for an invoice
app.get('/api/invoice/:id/positions/history', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? '100');
    const invoicePk = String(req.params.id);
    const rows = getPositionsHistory(invoicePk, Math.min(Math.max(limit, 1), 500));
    res.status(200).json({ ok: true, history: rows });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Portfolio for a wallet across invoices with shares_mint
app.get('/api/portfolio/:wallet', async (req: Request, res: Response) => {
  try {
    const wallet = String(req.params.wallet);
    const invoices = listInvoicesWithSharesMint();
    const out: Array<{ invoice: string; sharesMint: string; amount: string }> = [];
    for (const inv of invoices) {
      try {
        const cached = getPositionsCache(inv.invoicePk);
        if (!cached || !Array.isArray(cached.positions)) continue;
        const hit = (cached.positions as Array<any>).find((p: any) => p.wallet === wallet);
        if (!hit) continue;
        const amtStr = String((hit as any).amount ?? '0');
        if (BigInt(amtStr) <= 0n) continue;
        out.push({ invoice: inv.invoicePk, sharesMint: inv.sharesMint, amount: amtStr });
      } catch {}
    }
    res.status(200).json({ ok: true, portfolio: out });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/invoice/:id/init-shares', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const { sharesMint, tx } = await initSharesIx(program, invoicePk);
    try { await upsertInvoiceFromChain(program, invoicePk, tx); } catch {}
    try { saveTxLog({ sig: tx, kind: 'init_shares', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
    try { clearPositionsCache(invoicePk.toBase58()) } catch {}
    res.status(200).json({ ok: true, sharesMint: sharesMint.toBase58(), tx });
  } catch (e: any) {
    try { saveTxLog({ sig: '', kind: 'init_shares', invoicePk: req.params.id, success: false, error: e?.message }); } catch {}
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Phase 2B: fractional funding using shares mint
app.post('/api/invoice/:id/fund-fractional', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body as { amount: string | number };
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const bn = new BN(String(amount));
    const sig = await fundInvoiceFractionalIx(program, invoicePk, bn);
    try { await upsertInvoiceFromChain(program, invoicePk, sig); } catch {}
    try { saveTxLog({ sig, kind: 'fund_fractional', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
    try { clearPositionsCache(invoicePk.toBase58()) } catch {}
    res.status(200).json({ ok: true, tx: sig });
  } catch (e: any) {
    try { saveTxLog({ sig: '', kind: 'fund_fractional', invoicePk: req.params.id, success: false, error: e?.message }); } catch {}
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/idl/invoice_manager', (_req: Request, res: Response) => {
  try {
    const idlPath = resolve(process.cwd(), '..', 'target', 'idl', 'invoice_manager.json');
    const idl = readFileSync(idlPath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(idl);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// List invoices from DB with optional filters
app.get('/api/invoices', async (req: Request, res: Response) => {
  try {
    const { status, wallet } = req.query as { status?: string; wallet?: string };
    const pageRaw = (req.query.page as string | undefined) ?? '1';
    const pageSizeRaw = (req.query.pageSize as string | undefined) ?? '50';
    let page = Number(pageRaw);
    if (!Number.isFinite(page) || page <= 0) page = 1;
    let pageSize = Number(pageSizeRaw);
    if (!Number.isFinite(pageSize) || pageSize <= 0) pageSize = 50;
    pageSize = Math.min(Math.max(pageSize, 1), 200);
    const offset = (page - 1) * pageSize;

    const total = countInvoices({ status, wallet });
    const rows = listInvoices({ status, wallet, limit: pageSize, offset });
    const totals = getInvoiceTotals({ status, wallet });
    const pageCount = total > 0 ? Math.ceil(total / pageSize) : 0;

    res.status(200).json({
      ok: true,
      invoices: rows,
      stats: totals,
      pagination: {
        page,
        pageSize,
        total,
        pageCount,
      },
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Phase 3: KYC (stub) — admin writes, public read
app.post('/api/kyc', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const parsed = KycSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.errors?.[0]?.message || 'invalid body' });
    const { wallet, status, provider, reference, payload } = parsed.data;
    const rec = upsertKycRecord({ wallet, status, provider: provider || null, reference: reference || null, payload: payload ?? null });
    res.status(200).json({ ok: true, kyc: rec });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/api/kyc/:wallet', async (req: Request, res: Response) => {
  try {
    const rec = getKycRecord(String(req.params.wallet));
    if (!rec) return res.status(404).json({ ok: false, error: 'not found' });
    res.status(200).json({ ok: true, kyc: rec });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Phase 3: Document hashes (hash + optional CID)
app.post('/api/invoice/:id/document', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const invoicePk = String(req.params.id);
    const parsed = DocSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.errors?.[0]?.message || 'invalid body' });
    const { uploader, hash, cid } = parsed.data;
    const up = uploader || String(req.header('x-admin-wallet') || '');
    if (!invoicePk || !hash || !up) return res.status(400).json({ ok: false, error: 'invoicePk, uploader, hash required' });
    const isHex64 = typeof hash === 'string' && /^[0-9a-fA-F]{64}$/.test(hash);
    if (!isHex64) return res.status(400).json({ ok: false, error: 'hash must be 64-char hex (sha256)' });
    try {
      const existing = listDocHashes(invoicePk);
      if (existing.length >= 10) return res.status(400).json({ ok: false, error: 'max 10 documents per invoice' });
    } catch {}
    const rec = insertDocHash({ invoicePk, uploader: up, hash, cid: cid || null });
    res.status(200).json({ ok: true, document: rec });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/api/invoice/:id/documents', async (req: Request, res: Response) => {
  try {
    const invoicePk = String(req.params.id);
    const rows = listDocHashes(invoicePk);
    res.status(200).json({ ok: true, documents: rows });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// (mock rules service)
app.post('/api/invoice/:id/score', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const invoicePk = String(req.params.id);
    const parsed = ScoreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.errors?.[0]?.message || 'invalid body' });
    const num = Number(parsed.data.score);
    const riskLabel = num >= 700 ? 'Low' : num >= 600 ? 'Medium' : 'High';
    const rec = upsertCreditScore({ invoicePk, score: num, riskLabel, reason: parsed.data.reason || null });
    res.status(200).json({ ok: true, score: rec });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/api/invoice/:id/score', async (req: Request, res: Response) => {
  try {
    const invoicePk = String(req.params.id);
    const rec = getCreditScore(invoicePk);
    if (!rec) return res.status(404).json({ ok: false, error: 'not found' });
    res.status(200).json({ ok: true, score: rec });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/faucet/usdc', async (req: Request, res: Response) => {
  try {
    if (process.env.FAUCET_ENABLED !== 'true') {
      return res.status(403).json({ ok: false, error: 'faucet disabled' });
    }
    const { recipient, amount } = req.body as { recipient: string; amount?: string };
    if (!recipient) throw new Error('recipient required');
    const mintAmount = amount ? new BN(String(amount)) : new BN('100000000'); // default 100 USDC
    const program = getProgram();
    const usdcMintStr = process.env.USDC_MINT;
    if (!usdcMintStr) throw new Error('USDC_MINT not set');
    const usdcMint = new web3.PublicKey(usdcMintStr);
    const recipientPk = new web3.PublicKey(recipient);
    
    // Use spl-token CLI via the relayer (mint authority)
    const { mintTo, getOrCreateAssociatedTokenAccount } = await import('@solana/spl-token');
    const connection = program.provider.connection;
    const payer = (program.provider as any).wallet.payer;
    
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      usdcMint,
      recipientPk
    );
    
    const sig = await mintTo(
      connection,
      payer,
      usdcMint,
      recipientAta.address,
      payer,
      BigInt(mintAmount.toString())
    );
    
    res.status(200).json({ ok: true, tx: sig, ata: recipientAta.address.toBase58(), amount: mintAmount.toString() });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/invoice/:id/fund', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body as { amount: string | number };
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const bn = new BN(String(amount));
    const sig = await fundInvoice(program, invoicePk, bn);
    try { await upsertInvoiceFromChain(program, invoicePk, sig); } catch {}
    try { saveTxLog({ sig, kind: 'fund', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
    try { clearPositionsCache(invoicePk.toBase58()) } catch {}
    res.status(200).json({ ok: true, tx: sig });
  } catch (e: any) {
    try { saveTxLog({ sig: '', kind: 'fund', invoicePk: req.params.id, success: false, error: e?.message }); } catch {}
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/api/invoice/:id', async (req: Request, res: Response) => {
  try {
    // Always fetch from chain to keep response shape consistent for frontend
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const data = await fetchInvoice(program, invoicePk);
    try { await upsertInvoiceFromChain(program, invoicePk); } catch {}
    res.status(200).json({ ok: true, invoice: data });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// Derive positions for an invoice (fractional or pre-fractional)
app.get('/api/invoice/:id/positions', async (req: Request, res: Response) => {
  try {
    const invoicePkStr = String(req.params.id);
    const positions = await computeInvoicePositions(invoicePkStr);
    res.status(200).json({ ok: true, positions });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/invoice/mint', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const program = getProgram();
    const { metadataHash, amount, dueDate } = req.body as { metadataHash: string; amount: string | number; dueDate: string | number };
    const usdcMintEnv = process.env.USDC_MINT;
    if (!usdcMintEnv) throw new Error('USDC_MINT not set');
    const usdcMint = new web3.PublicKey(usdcMintEnv);
    const result = await mintIx(program, { metadataHash, amount: new BN(String(amount)), dueDate: new BN(String(dueDate)), usdcMint });
    try { await upsertInvoiceFromChain(program, result.invoicePubkey, result.tx); } catch {}
    try { saveTxLog({ sig: result.tx, kind: 'mint', invoicePk: result.invoicePubkey.toBase58(), success: true }); } catch {}
    res.status(200).json({ ok: true, invoice: result.invoicePubkey.toBase58(), tx: result.tx });
  } catch (e: any) {
    try { saveTxLog({ sig: '', kind: 'mint', invoicePk: '', success: false, error: e?.message }); } catch {}
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/invoice/:id/create-escrow', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ ok: false, error: 'admin only' });
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const sig = await createEscrowIx(program, invoicePk);
    try { await upsertInvoiceFromChain(program, invoicePk, sig); } catch {}
    try { saveTxLog({ sig, kind: 'create_escrow', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
    res.status(200).json({ ok: true, tx: sig });
  } catch (e: any) {
    try { saveTxLog({ sig: '', kind: 'create_escrow', invoicePk: req.params.id, success: false, error: e?.message }); } catch {}
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/webhook/payment', async (req: Request, res: Response) => {
  try {
    const enforce = process.env.ENABLE_HMAC === 'true';
    if (enforce) {
      const secret = process.env.HMAC_SECRET;
      const provided = req.header('x-hmac-signature') || '';
      const tsHeader = req.header('x-hmac-timestamp');
      if (!secret) return res.status(401).json({ ok: false, error: 'missing secret' });
      if (!tsHeader) return res.status(401).json({ ok: false, error: 'missing timestamp' });
      const ts = Number(tsHeader);
      if (!Number.isFinite(ts)) return res.status(401).json({ ok: false, error: 'invalid timestamp' });
      const toleranceSec = Number(process.env.WEBHOOK_TOLERANCE_SEC ?? '300');
      if (Math.abs(Date.now() - ts) > toleranceSec * 1000) return res.status(401).json({ ok: false, error: 'timestamp out of tolerance' });
      const bodyStr = (req as any).rawBody || JSON.stringify(req.body);
      const preimage = `${ts}.${bodyStr}`;
      const calc = crypto.createHmac('sha256', secret).update(preimage).digest('hex');
      if (!provided || provided !== calc) return res.status(401).json({ ok: false, error: 'bad signature' });

      const idem = req.header('x-idempotency-key') || '';
      if (idem) {
        const existing = hasIdempotencyKey(idem);
        if (existing.exists && existing.processed) {
          return res.status(200).json({ ok: true, idempotent: true });
        }
        const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
        recordWebhookEvent({ idemKey: idem, ts, sig: provided, payloadHash });
      }
    }
    // TODO: Re-enable HMAC verification in production
    // const secret = process.env.HMAC_SECRET;
    // const provided = req.header('x-hmac-signature');
    // if (secret) {
    //   const calc = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    //   if (!provided || provided !== calc) return res.status(401).json({ ok: false, error: 'bad signature' });
    // }
    const parsed = WebhookPaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.errors?.[0]?.message || 'invalid body' });
    const { invoice_id, amount } = parsed.data as { invoice_id: string; amount: string | number };
    const program = getProgram();
    const invoicePk = new web3.PublicKey(invoice_id);
    const bn = new BN(String(amount));
    const sig = await settleInvoice(program, invoicePk, bn);
    try { await upsertInvoiceFromChain(program, invoicePk, sig); } catch {}
    try { saveTxLog({ sig, kind: 'settle', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
    const idem = req.header('x-idempotency-key') || '';
    if (idem) { try { markWebhookProcessed(idem); } catch {} }
    res.status(200).json({ ok: true, tx: sig });
  } catch (e: any) {
    try {
      const { invoice_id } = (req.body || {}) as any;
      if (invoice_id) saveTxLog({ sig: '', kind: 'settle', invoicePk: String(invoice_id), success: false, error: e?.message });
    } catch {}
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/webhook/kyc', async (req: Request, res: Response) => {
  try {
    const enforce = process.env.ENABLE_HMAC === 'true';
    if (enforce) {
      const secret = process.env.HMAC_SECRET;
      const provided = req.header('x-hmac-signature') || '';
      const tsHeader = req.header('x-hmac-timestamp');
      if (!secret) return res.status(401).json({ ok: false, error: 'missing secret' });
      if (!tsHeader) return res.status(401).json({ ok: false, error: 'missing timestamp' });
      const ts = Number(tsHeader);
      if (!Number.isFinite(ts)) return res.status(401).json({ ok: false, error: 'invalid timestamp' });
      const toleranceSec = Number(process.env.WEBHOOK_TOLERANCE_SEC ?? '300');
      if (Math.abs(Date.now() - ts) > toleranceSec * 1000) return res.status(401).json({ ok: false, error: 'timestamp out of tolerance' });
      const bodyStr = (req as any).rawBody || JSON.stringify(req.body);
      const preimage = `${ts}.${bodyStr}`;
      const calc = crypto.createHmac('sha256', secret).update(preimage).digest('hex');
      if (!provided || provided !== calc) return res.status(401).json({ ok: false, error: 'bad signature' });

      const idem = req.header('x-idempotency-key') || '';
      if (idem) {
        const existing = hasIdempotencyKey(idem);
        if (existing.exists && existing.processed) {
          return res.status(200).json({ ok: true, idempotent: true });
        }
        const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
        recordWebhookEvent({ idemKey: idem, ts, sig: provided, payloadHash });
      }
    }

    const { wallet, status, provider, reference, payload } = req.body as { wallet: string; status: string; provider?: string; reference?: string; payload?: any };
    if (!wallet || !status) return res.status(400).json({ ok: false, error: 'wallet and status required' });
    const rec = upsertKycRecord({ wallet, status, provider: provider || null, reference: reference || null, payload: payload ?? null });
    const idem = req.header('x-idempotency-key') || '';
    if (idem) { try { markWebhookProcessed(idem); } catch {} }
    res.status(200).json({ ok: true, kyc: rec });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

export function startServer() {
  const port = Number(process.env.PORT ?? 8080);
  const server = app.listen(port, () => {
    console.log(`Backend listening on ${port}`);
    runIndexer().catch((e) => console.error('Indexer failed to start', e));
  });
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
