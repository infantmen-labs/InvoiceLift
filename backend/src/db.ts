import Database from 'better-sqlite3'
import { web3, Program } from '@coral-xyz/anchor'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { dirname, resolve } from 'path'
import { mkdirSync } from 'fs'

let db: ReturnType<typeof Database> | null = null

function nowMs(){ return Date.now() }

export function initDb(customPath?: string){
  const dbPath = customPath || process.env.DB_PATH || resolve(process.cwd(), 'data', 'dev.sqlite')
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_pk TEXT UNIQUE,
      seller TEXT,
      investor TEXT,
      usdc_mint TEXT,
      amount TEXT,
      funded_amount TEXT,
      status TEXT,
      metadata_hash TEXT,
      due_date INTEGER,
      escrow_authority TEXT,
      escrow_token TEXT,
      shares_mint TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      last_sig TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_wallet ON invoices(seller, investor);

    CREATE TABLE IF NOT EXISTS tx_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sig TEXT,
      kind TEXT,
      invoice_pk TEXT,
      slot INTEGER,
      success INTEGER,
      error TEXT,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tx_logs_invoice ON tx_logs(invoice_pk);

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idem_key TEXT UNIQUE,
      ts INTEGER,
      sig TEXT,
      payload_hash TEXT,
      created_at INTEGER,
      processed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_ts ON webhook_events(ts);

    CREATE TABLE IF NOT EXISTS positions_cache (
      invoice_pk TEXT PRIMARY KEY,
      payload TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS positions_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_pk TEXT,
      wallet TEXT,
      delta TEXT,
      new_amount TEXT,
      ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_positions_hist_invoice ON positions_history(invoice_pk);

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_pk TEXT,
      seller TEXT,
      price TEXT,
      qty TEXT,
      remaining_qty TEXT,
      status TEXT,
      signature TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_listings_invoice ON listings(invoice_pk);
    CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
  `)
  // Backfill migration: add shares_mint if missing
  try {
    const cols = db.prepare("PRAGMA table_info('invoices')").all() as any[]
    const hasShares = Array.isArray(cols) && cols.some((c: any) => c && (c.name === 'shares_mint'))
    if (!hasShares) {
      db.exec('ALTER TABLE invoices ADD COLUMN shares_mint TEXT')
    }
  } catch {}
}

function getDb(): ReturnType<typeof Database> {
  if(!db) initDb()
  return db as ReturnType<typeof Database>
}

function toStatusString(status: any): string {
  if (!status) return 'unknown'
  const k = Object.keys(status)[0]
  // Normalize to Title case as in IDL variants
  if (!k) return 'unknown'
  const t = k.toLowerCase()
  if (t === 'open') return 'Open'
  if (t === 'funded') return 'Funded'
  if (t === 'settled') return 'Settled'
  return k
}

function mapRowToCamel(row: any){
  if(!row) return null
  return {
    invoicePk: row.invoice_pk,
    seller: row.seller,
    investor: row.investor || null,
    usdcMint: row.usdc_mint,
    amount: row.amount,
    fundedAmount: row.funded_amount,
    status: row.status,
    metadataHash: row.metadata_hash,
    dueDate: row.due_date,
    escrowAuthority: row.escrow_authority,
    escrowToken: row.escrow_token,
    sharesMint: row.shares_mint || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSig: row.last_sig || null,
  }
}

export async function upsertInvoiceFromChain(program: Program, invoicePk: web3.PublicKey, lastSig?: string){
  const db = getDb()
  const invoice = await (program.account as any)['invoice'].fetch(invoicePk)
  const usdcMint = new web3.PublicKey((invoice as any).usdcMint)
  const sharesMintOnChain = (invoice as any).sharesMint
  const sharesMint = sharesMintOnChain ? new web3.PublicKey(sharesMintOnChain) : null
  const seller = new web3.PublicKey((invoice as any).seller)
  const investor = new web3.PublicKey((invoice as any).investor)
  const amount = (invoice as any).amount.toString()
  const fundedAmount = (invoice as any).fundedAmount.toString()
  const metadataHash = (invoice as any).metadataHash as string
  const dueDate = Number((invoice as any).dueDate)
  const status = toStatusString((invoice as any).status)

  const [escrowAuthority] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), invoicePk.toBuffer()],
    program.programId
  )
  const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)

  const exists = db.prepare('SELECT id FROM invoices WHERE invoice_pk = ?').get(invoicePk.toBase58())
  const ts = nowMs()
  if (exists) {
    db.prepare(`UPDATE invoices SET seller = ?, investor = ?, usdc_mint = ?, amount = ?, funded_amount = ?, status = ?, metadata_hash = ?, due_date = ?, escrow_authority = ?, escrow_token = ?, shares_mint = ?, updated_at = ?, last_sig = ? WHERE invoice_pk = ?`)
      .run(
        seller.toBase58(),
        investor.toBase58(),
        usdcMint.toBase58(),
        amount,
        fundedAmount,
        status,
        metadataHash,
        dueDate,
        escrowAuthority.toBase58(),
        escrowToken.toBase58(),
        sharesMint ? sharesMint.toBase58() : null,
        ts,
        lastSig || null,
        invoicePk.toBase58()
      )
  } else {
    db.prepare(`INSERT INTO invoices (invoice_pk, seller, investor, usdc_mint, amount, funded_amount, status, metadata_hash, due_date, escrow_authority, escrow_token, shares_mint, created_at, updated_at, last_sig) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        invoicePk.toBase58(),
        seller.toBase58(),
        investor.toBase58(),
        usdcMint.toBase58(),
        amount,
        fundedAmount,
        status,
        metadataHash,
        dueDate,
        escrowAuthority.toBase58(),
        escrowToken.toBase58(),
        sharesMint ? sharesMint.toBase58() : null,
        ts,
        ts,
        lastSig || null
      )
  }
  const row = db.prepare('SELECT * FROM invoices WHERE invoice_pk = ?').get(invoicePk.toBase58())
  return mapRowToCamel(row)
}

export function saveTxLog(log: { sig: string; kind: string; invoicePk: string; slot?: number; success: boolean; error?: string }){
  const db = getDb()
  db.prepare(`INSERT INTO tx_logs (sig, kind, invoice_pk, slot, success, error, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(log.sig, log.kind, log.invoicePk, log.slot || null, log.success ? 1 : 0, log.error || null, nowMs())
}

export function getInvoiceRow(invoicePk: string){
  const db = getDb()
  const row = db.prepare('SELECT * FROM invoices WHERE invoice_pk = ?').get(invoicePk)
  return mapRowToCamel(row)
}

export function listInvoices(opts: { status?: string; wallet?: string }){
  const db = getDb()
  const { status, wallet } = opts
  let sql = 'SELECT * FROM invoices'
  const params: any[] = []
  const where: string[] = []
  if (status) { where.push('status = ?'); params.push(status) }
  if (wallet) { where.push('(seller = ? OR investor = ?)'); params.push(wallet, wallet) }
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY updated_at DESC LIMIT 200'
  const rows = db.prepare(sql).all(...params)
  return rows.map(mapRowToCamel)
}

export function hasIdempotencyKey(idemKey: string){
  const db = getDb()
  const row = db.prepare('SELECT id, processed_at FROM webhook_events WHERE idem_key = ?').get(idemKey) as { id: number; processed_at: number | null } | undefined
  return row ? { exists: true, processed: !!row.processed_at } : { exists: false, processed: false }
}

export function recordWebhookEvent(ev: { idemKey: string; ts: number; sig: string; payloadHash: string }){
  const db = getDb()
  try {
    db.prepare('INSERT INTO webhook_events (idem_key, ts, sig, payload_hash, created_at) VALUES (?,?,?,?,?)')
      .run(ev.idemKey, ev.ts, ev.sig, ev.payloadHash, nowMs())
  } catch {}
}

export function markWebhookProcessed(idemKey: string){
  const db = getDb()
  db.prepare('UPDATE webhook_events SET processed_at = ? WHERE idem_key = ?').run(nowMs(), idemKey)
}

export function getPositionsCache(invoicePk: string){
  const db = getDb()
  const row = db.prepare('SELECT payload, updated_at FROM positions_cache WHERE invoice_pk = ?').get(invoicePk) as { payload: string; updated_at: number } | undefined
  if (!row) return null
  try {
    const positions = JSON.parse(row.payload)
    return { positions, updatedAt: row.updated_at }
  } catch {
    return null
  }
}

export function setPositionsCache(invoicePk: string, positions: Array<{ wallet: string; amount: string }> ){
  const db = getDb()
  const payload = JSON.stringify(positions)
  const ts = nowMs()
  db.prepare('INSERT INTO positions_cache (invoice_pk, payload, updated_at) VALUES (?,?,?) ON CONFLICT(invoice_pk) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
    .run(invoicePk, payload, ts)
}

export function clearPositionsCache(invoicePk: string){
  const db = getDb()
  try { db.prepare('DELETE FROM positions_cache WHERE invoice_pk = ?').run(invoicePk) } catch {}
}

export function recordPositionsDiffs(invoicePk: string, diffs: Array<{ wallet: string; delta: string; newAmount: string }>){
  const db = getDb()
  const ts = nowMs()
  const stmt = db.prepare('INSERT INTO positions_history (invoice_pk, wallet, delta, new_amount, ts) VALUES (?,?,?,?,?)')
  const tx = db.transaction((items: Array<{ wallet: string; delta: string; newAmount: string }>) => {
    for (const d of items) stmt.run(invoicePk, d.wallet, d.delta, d.newAmount, ts)
  })
  try { tx(diffs) } catch {}
}

export function listInvoicesWithSharesMint(){
  const db = getDb()
  const rows = db.prepare('SELECT invoice_pk, shares_mint FROM invoices WHERE shares_mint IS NOT NULL').all() as Array<{ invoice_pk: string; shares_mint: string }>
  return rows.map(r => ({ invoicePk: r.invoice_pk, sharesMint: r.shares_mint }))
}

export function getPositionsHistory(invoicePk: string, limit: number = 100){
  const db = getDb()
  const rows = db.prepare('SELECT wallet, delta, new_amount as newAmount, ts FROM positions_history WHERE invoice_pk = ? ORDER BY ts DESC LIMIT ?').all(invoicePk, limit) as Array<{ wallet: string; delta: string; newAmount: string; ts: number }>
  return rows
}

// Listings helpers and types
export type Listing = {
  id: number
  invoicePk: string
  seller: string
  price: string
  qty: string
  remainingQty: string
  status: 'Open' | 'Filled' | 'Canceled'
  signature: string | null
  createdAt: number
  updatedAt: number
}

function mapListingRow(row: any): Listing | null {
  if (!row) return null
  return {
    id: row.id,
    invoicePk: row.invoice_pk,
    seller: row.seller,
    price: row.price,
    qty: row.qty,
    remainingQty: row.remaining_qty,
    status: row.status,
    signature: row.signature || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createListing(input: { invoicePk: string; seller: string; price: string; qty: string; signature?: string | null }): Listing {
  const db = getDb()
  const ts = nowMs()
  const info = db.prepare(`INSERT INTO listings (invoice_pk, seller, price, qty, remaining_qty, status, signature, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(input.invoicePk, input.seller, input.price, input.qty, input.qty, 'Open', input.signature || null, ts, ts)
  const id = Number(info.lastInsertRowid)
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id)
  return mapListingRow(row) as Listing
}

export function getListing(id: number): Listing | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id)
  return mapListingRow(row)
}

export function listListingsByInvoice(invoicePk: string, status?: 'Open' | 'Filled' | 'Canceled'): Listing[] {
  const db = getDb()
  let sql = 'SELECT * FROM listings WHERE invoice_pk = ?'
  const params: any[] = [invoicePk]
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY updated_at DESC LIMIT 200'
  const rows = db.prepare(sql).all(...params)
  return (rows || []).map(mapListingRow).filter(Boolean) as Listing[]
}

export function listListingsBySeller(seller: string, status?: 'Open' | 'Filled' | 'Canceled'): Listing[] {
  const db = getDb()
  let sql = 'SELECT * FROM listings WHERE seller = ?'
  const params: any[] = [seller]
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY updated_at DESC LIMIT 200'
  const rows = db.prepare(sql).all(...params)
  return (rows || []).map(mapListingRow).filter(Boolean) as Listing[]
}

export function cancelListing(id: number, seller: string): Listing | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as any
  if (!row) return null
  if (row.seller !== seller) throw new Error('not seller')
  if (row.status !== 'Open') throw new Error('not open')
  db.prepare('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?').run('Canceled', nowMs(), id)
  const out = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as any
  return mapListingRow(out)
}

export function fillListingPartial(id: number, fillQty: string): Listing | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as any
  if (!row) return null
  if (row.status !== 'Open') throw new Error('not open')
  const remaining = BigInt(String(row.remaining_qty || '0'))
  const fill = BigInt(String(fillQty))
  if (fill <= 0n) throw new Error('fill must be > 0')
  if (fill > remaining) throw new Error('insufficient remaining')
  const next = remaining - fill
  const status = next === 0n ? 'Filled' : 'Open'
  db.prepare('UPDATE listings SET remaining_qty = ?, status = ?, updated_at = ? WHERE id = ?').run(next.toString(), status, nowMs(), id)
  const out = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as any
  return mapListingRow(out)
}

export function listOpenListings(limit: number = 200): Listing[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM listings WHERE status = ? ORDER BY updated_at DESC LIMIT ?').all('Open', limit)
  return (rows || []).map(mapListingRow).filter(Boolean) as Listing[]
}

