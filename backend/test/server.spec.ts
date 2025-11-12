import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import path from 'path'

vi.mock('../src/anchor', () => {
  return {
    getProgram: () => ({}),
    settleInvoice: async () => 'FAKE_SIG',
    fundInvoice: async () => 'FAKE_SIG',
    mintInvoice: async () => ({ invoicePubkey: { toBase58: () => 'FAKE_INVOICE' }, tx: 'FAKE_SIG' }),
    createEscrow: async () => 'FAKE_SIG',
    fetchInvoice: async () => ({ status: { Open: {} }, amount: '0', fundedAmount: '0' }),
    initShares: async () => ({ sharesMint: { toBase58: () => 'FAKE_SHARES' }, tx: 'FAKE_SIG' }),
    fundInvoiceFractional: async () => 'FAKE_SIG'
  }
})

vi.mock('../src/indexer', () => ({ runIndexer: async () => {} }))

describe('backend server', () => {
  let server: any
  let base: ReturnType<typeof request>

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.ENABLE_HMAC = 'true'
    process.env.HMAC_SECRET = 'testsecret'
    process.env.USDC_MINT = '5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT'
    process.env.PROGRAM_ID = 'F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm'
    process.env.RELAYER_KEYPAIR_PATH = path.resolve(__dirname, 'dummy.json')
    const mod = await import('../src/index')
    server = mod.startServer()
    const addr = server.address()
    const url = `http://127.0.0.1:${addr.port}`
    base = request(url)
  })

  it('mint endpoint returns invoice and tx', async () => {
    const res = await base
      .post('/api/invoice/mint')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ metadataHash: 'demo', amount: '1', dueDate: '1736294400' }))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.invoice).toBe('string')
    expect(typeof res.body.tx).toBe('string')
  })

  it('create-escrow endpoint returns tx', async () => {
    const res = await base
      .post('/api/invoice/11111111111111111111111111111111/create-escrow')
      .send()
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.tx).toBe('string')
  })

  it('init-shares endpoint returns shares mint and tx', async () => {
    const res = await base
      .post('/api/invoice/11111111111111111111111111111111/init-shares')
      .send()
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.sharesMint).toBe('string')
    expect(typeof res.body.tx).toBe('string')
  })

  it('fund endpoint returns tx', async () => {
    const res = await base
      .post('/api/invoice/11111111111111111111111111111111/fund')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ amount: '1' }))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.tx).toBe('string')
  })

  it('fund-fractional endpoint returns tx', async () => {
    const res = await base
      .post('/api/invoice/11111111111111111111111111111111/fund-fractional')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ amount: '1' }))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.tx).toBe('string')
  })

  it('list invoices returns array', async () => {
    const res = await base.get('/api/invoices')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.invoices)).toBe(true)
  })

  it('list invoices supports filters', async () => {
    const res = await base.get('/api/invoices?status=Open&wallet=11111111111111111111111111111111')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.invoices)).toBe(true)
  })

  it('positions endpoint returns array for invoice', async () => {
    const res = await base.get('/api/invoice/11111111111111111111111111111111/positions')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.positions)).toBe(true)
  })

  it('serves IDL', async () => {
    const res = await base.get('/idl/invoice_manager')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    const idl = JSON.parse(res.text)
    expect(typeof idl.address).toBe('string')
  })

  it('faucet disabled by default', async () => {
    const res = await base
      .post('/api/faucet/usdc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ recipient: '11111111111111111111111111111111', amount: '1' }))
    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
  })

  afterAll(async () => {
    server?.close()
  })

  it('healthz ok', async () => {
    const res = await base.get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('webhook rejects missing headers', async () => {
    const res = await base.post('/webhook/payment').send({ invoice_id: 'X', amount: '1' })
    expect(res.status).toBe(401)
  })

  it('webhook rejects bad signature', async () => {
    const body = { invoice_id: '11111111111111111111111111111111', amount: '1' }
    const ts = Date.now()
    const bodyStr = JSON.stringify(body)
    const preimage = `${ts}.${bodyStr}`
    const wrongSig = crypto.createHmac('sha256', 'wrong').update(preimage).digest('hex')
    const res = await base
      .post('/webhook/payment')
      .set('Content-Type', 'application/json')
      .set('x-hmac-timestamp', String(ts))
      .set('x-hmac-signature', wrongSig)
      .send(bodyStr)
    expect(res.status).toBe(401)
  })

  it('webhook rejects timestamp out of tolerance', async () => {
    const body = { invoice_id: '11111111111111111111111111111111', amount: '1' }
    const ts = Date.now() - 600_000 // 10 minutes ago
    const bodyStr = JSON.stringify(body)
    const preimage = `${ts}.${bodyStr}`
    const sig = crypto.createHmac('sha256', process.env.HMAC_SECRET as string).update(preimage).digest('hex')
    const res = await base
      .post('/webhook/payment')
      .set('Content-Type', 'application/json')
      .set('x-hmac-timestamp', String(ts))
      .set('x-hmac-signature', sig)
      .send(bodyStr)
    expect(res.status).toBe(401)
  })

  it('webhook accepts timestamped HMAC and idempotency', async () => {
    // Use a valid Solana public key format (System Program ID) to pass PublicKey validation
    const body = { invoice_id: '11111111111111111111111111111111', amount: '1' }
    const ts = Date.now()
    const bodyStr = JSON.stringify(body)
    const preimage = `${ts}.${bodyStr}`
    const sig = crypto.createHmac('sha256', process.env.HMAC_SECRET as string).update(preimage).digest('hex')
    const idem = `test-${ts}`

    const res1 = await base
      .post('/webhook/payment')
      .set('Content-Type', 'application/json')
      .set('x-hmac-timestamp', String(ts))
      .set('x-hmac-signature', sig)
      .set('x-idempotency-key', idem)
      .send(bodyStr)
    expect(res1.status).toBe(200)
    expect(res1.body.ok).toBe(true)
    expect(res1.body.tx).toBe('FAKE_SIG')

    const res2 = await base
      .post('/webhook/payment')
      .set('Content-Type', 'application/json')
      .set('x-hmac-timestamp', String(ts))
      .set('x-hmac-signature', sig)
      .set('x-idempotency-key', idem)
      .send(bodyStr)
    expect(res2.status).toBe(200)
    expect(res2.body.ok).toBe(true)
    expect(res2.body.idempotent).toBe(true)
  })
})
