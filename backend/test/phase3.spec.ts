import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import path from 'path'

// Mock anchor to avoid real RPC and to satisfy index.ts imports
vi.mock('../src/anchor', async () => {
  const { web3 } = await import('@coral-xyz/anchor')
  const provider = { connection: { getLatestBlockhash: async () => ({ blockhash: '11111111111111111111111111111111' }), getAccountInfo: async () => null } }
  function dummyTx(){
    const tx = new web3.Transaction()
    tx.add(new web3.TransactionInstruction({ keys: [], programId: web3.SystemProgram.programId }))
    return tx
  }
  function dummyPk(){ return web3.Keypair.generate().publicKey }
  return {
    getProgram: () => ({ programId: dummyPk(), provider }),
    // Core used elsewhere but not invoked in these tests
    settleInvoice: async () => 'FAKE_SIG',
    fundInvoice: async () => 'FAKE_SIG',
    mintInvoice: async () => ({ invoicePubkey: { toBase58: () => 'FAKE_INVOICE' }, tx: 'FAKE_SIG' }),
    createEscrow: async () => 'FAKE_SIG',
    fetchInvoice: async () => ({ status: { Open: {} }, amount: '0', fundedAmount: '0' }),
    initShares: async () => ({ sharesMint: { toBase58: () => 'FAKE_SHARES' }, tx: 'FAKE_SIG' }),
    fundInvoiceFractional: async () => 'FAKE_SIG',
    // Builders stubs
    buildCreateListingTx: async () => ({ tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() }),
    buildFulfillListingTx: async () => ({ tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() }),
    buildCancelListingTx: async () => ({ tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() }),
    buildCreateListingV2Tx: async () => ({ tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() }),
    buildFulfillListingV2Tx: async () => ({ tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() }),
    buildCancelListingV2Tx: async () => ({ tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() }),
  }
})

// Avoid starting real indexer
vi.mock('../src/indexer', () => ({ runIndexer: async () => {} }))

describe('Phase 3 endpoints (KYC, Docs, Score)', () => {
  let server: any
  let base: ReturnType<typeof request>

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.ADMIN_WALLETS = 'TEST_ADMIN'
    process.env.DB_PATH = path.resolve(__dirname, `tmp_phase3_${Date.now()}_${Math.random()}.sqlite`)
    const mod = await import('../src/index')
    server = mod.startServer()
    const addr = server.address()
    const url = `http://127.0.0.1:${addr.port}`
    base = request(url)
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('KYC: admin write and public read', async () => {
    const wallet = 'TEST_WALLET_A'
    const post = await base
      .post('/api/kyc')
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ wallet, status: 'approved', provider: 'sandbox', reference: 'ref-1', payload: { k: 1 } })
    expect(post.status).toBe(200)
    expect(post.body.ok).toBe(true)
    expect(post.body.kyc.wallet).toBe(wallet)

    const get = await base.get(`/api/kyc/${wallet}`)
    expect(get.status).toBe(200)
    expect(get.body.ok).toBe(true)
    expect(get.body.kyc.status).toBe('approved')
  })

  it('KYC: non-admin write is forbidden and missing record is 404', async () => {
    const noAdmin = await base.post('/api/kyc').send({ wallet: 'X', status: 'approved' })
    expect(noAdmin.status).toBe(403)

    const missing = await base.get('/api/kyc/UNKNOWN_WALLET')
    expect(missing.status).toBe(404)
  })

  it('Documents: hash validation and max 10 per invoice', async () => {
    const invoice = '11111111111111111111111111111111'
    // invalid hash
    const bad = await base
      .post(`/api/invoice/${invoice}/document`)
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ hash: 'abc' })
    expect(bad.status).toBe(400)

    // add 10 valid docs
    const hexes = ['a','b','c','d','e','f','0','1','2','3']
    for (let i = 0; i < 10; i++) {
      const h = hexes[i].repeat(64)
      const ok = await base
        .post(`/api/invoice/${invoice}/document`)
        .set('x-admin-wallet', 'TEST_ADMIN')
        .send({ hash: h, uploader: 'TEST_ADMIN', cid: `cid-${i}` })
      expect(ok.status).toBe(200)
      expect(ok.body.ok).toBe(true)
    }

    // 11th should fail
    const eleven = await base
      .post(`/api/invoice/${invoice}/document`)
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ hash: '4'.repeat(64) })
    expect(eleven.status).toBe(400)

    const list = await base.get(`/api/invoice/${invoice}/documents`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.documents)).toBe(true)
    expect(list.body.documents.length).toBe(10)
  })

  it('Documents: non-admin write is forbidden', async () => {
    const invoice = '11111111111111111111111111111111'
    const res = await base
      .post(`/api/invoice/${invoice}/document`)
      .send({ hash: 'a'.repeat(64) })
    expect(res.status).toBe(403)
  })

  it('Credit Score: derives risk label and supports read', async () => {
    const invLow = 'INV_LOW_11111111111111111111111111'
    const invMed = 'INV_MED_11111111111111111111111111'
    const invHigh = 'INV_HIGH_111111111111111111111111'

    const low = await base
      .post(`/api/invoice/${invLow}/score`)
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ score: 700, reason: 'rule' })
    expect(low.status).toBe(200)
    expect(low.body.score.riskLabel).toBe('Low')

    const med = await base
      .post(`/api/invoice/${invMed}/score`)
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ score: 650 })
    expect(med.status).toBe(200)
    expect(med.body.score.riskLabel).toBe('Medium')

    const high = await base
      .post(`/api/invoice/${invHigh}/score`)
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ score: 599 })
    expect(high.status).toBe(200)
    expect(high.body.score.riskLabel).toBe('High')

    const read = await base.get(`/api/invoice/${invLow}/score`)
    expect(read.status).toBe(200)
    expect(read.body.score.score).toBe(700)
  })

  it('Credit Score: validates score and non-admin write forbidden', async () => {
    const inv = 'INV_BAD_11111111111111111111111111'
    const bad = await base
      .post(`/api/invoice/${inv}/score`)
      .set('x-admin-wallet', 'TEST_ADMIN')
      .send({ score: 'NaN' })
    expect(bad.status).toBe(400)

    const noAdmin = await base
      .post(`/api/invoice/${inv}/score`)
      .send({ score: 700 })
    expect(noAdmin.status).toBe(403)

    const missing = await base.get(`/api/invoice/${inv}/score`)
    expect(missing.status).toBe(404)
  })
})
