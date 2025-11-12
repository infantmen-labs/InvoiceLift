import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { web3, BN } from '@coral-xyz/anchor';
import { getProgram, fetchInvoice, settleInvoice, fundInvoice, mintInvoice as mintIx, createEscrow as createEscrowIx, initShares as initSharesIx, fundInvoiceFractional as fundInvoiceFractionalIx } from './anchor';
import cors from 'cors';
import { readFileSync } from 'fs';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { resolve } from 'path';
import { initDb, upsertInvoiceFromChain, saveTxLog, getInvoiceRow, listInvoices, hasIdempotencyKey, recordWebhookEvent, markWebhookProcessed, getPositionsCache, setPositionsCache } from './db';
import { runIndexer } from './indexer';

const app = express();
app.use(bodyParser.json({
  verify: (req: any, _res, buf) => {
    try { req.rawBody = buf.toString('utf8'); } catch {}
  }
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));

// Initialize SQLite database
initDb();

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// Phase 2B: initialize shares mint for an invoice
app.post('/api/invoice/:id/init-shares', async (req: Request, res: Response) => {
  try {
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const { sharesMint, tx } = await initSharesIx(program, invoicePk);
    try { await upsertInvoiceFromChain(program, invoicePk, tx); } catch {}
    try { saveTxLog({ sig: tx, kind: 'init_shares', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
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
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const bn = new BN(String(amount));
    const sig = await fundInvoiceFractionalIx(program, invoicePk, bn);
    try { await upsertInvoiceFromChain(program, invoicePk, sig); } catch {}
    try { saveTxLog({ sig, kind: 'fund_fractional', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
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
    const rows = listInvoices({ status, wallet });
    res.status(200).json({ ok: true, invoices: rows });
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
    const mintAmount = amount ? new BN(String(amount)) : new BN('10000000'); // default 10 USDC
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
    
    res.status(200).json({ ok: true, tx: sig, ata: recipientAta.address.toBase58() });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/invoice/:id/fund', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body as { amount: string | number };
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const bn = new BN(String(amount));
    const sig = await fundInvoice(program, invoicePk, bn);
    try { await upsertInvoiceFromChain(program, invoicePk, sig); } catch {}
    try { saveTxLog({ sig, kind: 'fund', invoicePk: invoicePk.toBase58(), success: true }); } catch {}
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

// Derive positions for an invoice (pre-fractional: single investor if funded)
app.get('/api/invoice/:id/positions', async (req: Request, res: Response) => {
  try {
    const program = getProgram();
    const invoicePk = new web3.PublicKey(req.params.id);
    const data: any = await fetchInvoice(program, invoicePk);
    const DEFAULT_PK = '11111111111111111111111111111111';

    // If shares_mint exists, derive positions from SPL token balances
    const sharesMintStr: string = data.sharesMint && data.sharesMint.toBase58 ? data.sharesMint.toBase58() : String(data.sharesMint || '');
    if (sharesMintStr && sharesMintStr !== DEFAULT_PK) {
      // Try cache first
      const cached = getPositionsCache(invoicePk.toBase58());
      const ttlMs = Number(process.env.POSITIONS_TTL_MS ?? '15000');
      if (cached && (Date.now() - cached.updatedAt) < ttlMs) {
        return res.status(200).json({ ok: true, positions: cached.positions });
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
      try { setPositionsCache(invoicePk.toBase58(), positions) } catch {}
      return res.status(200).json({ ok: true, positions });
    }

    // Fallback (pre-fractional): single investor based on funded_amount
    const investor = (data.investor || '').toBase58 ? data.investor.toBase58() : String(data.investor || '');
    const fundedAmount = data.fundedAmount?.toString?.() ?? String(data.fundedAmount ?? '0');
    const positions = [] as Array<{ wallet: string; amount: string }>;
    if (investor && investor !== DEFAULT_PK && BigInt(fundedAmount) > 0n) {
      positions.push({ wallet: investor, amount: fundedAmount });
    }
    res.status(200).json({ ok: true, positions });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/api/invoice/mint', async (req: Request, res: Response) => {
  try {
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
    const { invoice_id, amount } = req.body as { invoice_id: string; amount: string | number };
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
