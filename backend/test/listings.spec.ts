import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

// Mock Anchor layer used by certain endpoints (e.g., listings by invoice)
vi.mock('../src/anchor', async () => {
  const { web3 } = await import('@coral-xyz/anchor')
  const dummyProgramId = new web3.PublicKey('F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm')
  const provider = { connection: {
    getLatestBlockhash: async () => ({ blockhash: 'TEST_BLOCKHASH' }),
    getAccountInfo: async () => null,
    getTokenAccountBalance: async () => ({ value: { amount: '0' } }),
    getParsedProgramAccounts: async () => ([]),
  } }
  function dummyPk(){ return web3.Keypair.generate().publicKey }
  return {
    getProgram: () => ({ programId: dummyProgramId, provider }),
    async fetchInvoice(){ return { sharesMint: dummyPk().toBase58(), usdcMint: dummyPk().toBase58() } },
  }
})

let server: any
let baseUrl: string

function bytesToBase64(bytes: Uint8Array){
  return Buffer.from(bytes).toString('base64')
}

describe('Listings API with signatures', () => {
  const seller = nacl.sign.keyPair()
  const buyer = nacl.sign.keyPair()
  const sellerPk58 = bs58.encode(seller.publicKey)
  const buyerPk58 = bs58.encode(buyer.publicKey)
  const invoicePk58 = bs58.encode(nacl.randomBytes(32))

  beforeAll(async () => {
    vi.mock('../src/indexer', () => ({ runIndexer: async () => {} }))
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.LISTINGS_REQUIRE_SIG = 'true'
    process.env.LISTING_SIG_TOL_SEC = '300'
    const mod = await import('../src/index')
    server = mod.startServer()
    const addr: any = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('rejects create without signature when required', async () => {
    const res = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk: invoicePk58, seller: sellerPk58, price: '1000000', qty: '5000000' })
    expect(res.status).toBe(401)
  })

  it('rejects create with bad signature', async () => {
    const ts = Date.now()
    const msg = `listing:create\ninvoicePk=${invoicePk58}\nseller=${sellerPk58}\nprice=1\nqty=1\nts=${ts}`
    // Signed by buyer instead of seller
    const badSig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), buyer.secretKey))
    const res = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk: invoicePk58, seller: sellerPk58, price: '1', qty: '1', ts, signature: badSig })
    expect(res.status).toBe(401)
  })

  it('rejects create with timestamp out of tolerance', async () => {
    const tolSec = 300
    const ts = Date.now() - (tolSec * 1000 + 5_000)
    const msg = `listing:create\ninvoicePk=${invoicePk58}\nseller=${sellerPk58}\nprice=1\nqty=1\nts=${ts}`
    const sig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), seller.secretKey))
    const res = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk: invoicePk58, seller: sellerPk58, price: '1', qty: '1', ts, signature: sig })
    expect(res.status).toBe(401)
  })

  it('creates, fills partially, then cancels listing with valid signatures', async () => {
    // Create
    const tsCreate = Date.now()
    const msgCreate = `listing:create\ninvoicePk=${invoicePk58}\nseller=${sellerPk58}\nprice=1000000\nqty=5000000\nts=${tsCreate}`
    const sigCreate = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msgCreate), seller.secretKey))
    const create = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk: invoicePk58, seller: sellerPk58, price: '1000000', qty: '5000000', ts: tsCreate, signature: sigCreate })
    expect(create.status).toBe(200)
    const listingId = create.body.listing.id as number

    // Fill partial
    const tsFill = Date.now()
    const msgFill = `listing:fill\nid=${listingId}\nbuyer=${buyerPk58}\nqty=3000000\nts=${tsFill}`
    const sigFill = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msgFill), buyer.secretKey))
    const fill = await request(baseUrl)
      .post(`/api/listings/${listingId}/fill`)
      .set('x-wallet', buyerPk58)
      .send({ qty: '3000000', ts: tsFill, signature: sigFill })
    expect(fill.status).toBe(200)
    expect(fill.body.listing.remainingQty).toBe('2000000')

    // Cancel as seller
    const tsCancel = Date.now()
    const msgCancel = `listing:cancel\nid=${listingId}\nseller=${sellerPk58}\nts=${tsCancel}`
    const sigCancel = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msgCancel), seller.secretKey))
    const cancel = await request(baseUrl)
      .post(`/api/listings/${listingId}/cancel`)
      .set('x-wallet', sellerPk58)
      .send({ ts: tsCancel, signature: sigCancel })
    expect(cancel.status).toBe(200)
    expect(cancel.body.listing.status).toBe('Canceled')
  })

  it('lists open listings and by invoice/seller endpoints', async () => {
    const open = await request(baseUrl).get('/api/listings/open')
    expect(open.status).toBe(200)
    // open listings may be 0 depending on prior test state
    const byInv = await request(baseUrl).get(`/api/invoice/${invoicePk58}/listings`)
    expect(byInv.status).toBe(200)
    const bySeller = await request(baseUrl).get(`/api/listings?seller=${encodeURIComponent(sellerPk58)}`)
    expect(bySeller.status).toBe(200)
  })
})
