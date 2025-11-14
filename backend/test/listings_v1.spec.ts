import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import request from 'supertest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { web3 } from '@coral-xyz/anchor'

let server: any
let baseUrl: string

function bytesToBase64(bytes: Uint8Array){
  return Buffer.from(bytes).toString('base64')
}

// Anchor layer mocks used by backend/src/index routes
vi.mock('../src/anchor', async () => {
  const { web3 } = await import('@coral-xyz/anchor')
  const dummyProgramId = new web3.PublicKey('F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm')
  const provider = { connection: { getLatestBlockhash: async () => ({ blockhash: '11111111111111111111111111111111' }), getAccountInfo: async () => null } }
  function dummyTx(){
    const tx = new web3.Transaction()
    tx.add(new web3.TransactionInstruction({ keys: [], programId: web3.SystemProgram.programId }))
    return tx
  }
  function dummyPk(){ return web3.Keypair.generate().publicKey }
  return {
    getProgram: () => ({ programId: dummyProgramId, provider }),
    async fetchInvoice(_program: any, _invoicePk: web3.PublicKey){
      return { sharesMint: dummyPk().toBase58(), usdcMint: dummyPk().toBase58() }
    },
    async buildCreateListingTx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    async buildFulfillListingTx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    async buildCancelListingTx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
  }
})

// Avoid starting real indexer
vi.mock('../src/indexer', () => ({ runIndexer: async () => {} }))

describe('Listings V1 builder endpoints', () => {
  const seller = nacl.sign.keyPair()
  const buyer = nacl.sign.keyPair()
  const sellerPk58 = bs58.encode(seller.publicKey)
  const buyerPk58 = bs58.encode(buyer.publicKey)
  const invoicePk = bs58.encode(nacl.randomBytes(32))

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.LISTINGS_REQUIRE_SIG = 'true'
    process.env.LISTING_SIG_TOL_SEC = '300'
    process.env.DB_PATH = path.resolve(__dirname, `tmp_v1_${Date.now()}_${Math.random()}.sqlite`)
    const mod = await import('../src/index')
    server = mod.startServer()
    const addr: any = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  function createMsg({ invoicePk, seller, price, qty, ts }: { invoicePk: string, seller: string, price: string, qty: string, ts: number }){
    return `listing:create\ninvoicePk=${invoicePk}\nseller=${seller}\nprice=${price}\nqty=${qty}\nts=${ts}`
  }

  it('builds V1 create/fulfill/cancel transactions', async () => {
    // Create listing
    const ts = Date.now()
    const msg = createMsg({ invoicePk, seller: sellerPk58, price: '1000000', qty: '5000000', ts })
    const sig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), seller.secretKey))
    const create = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk, seller: sellerPk58, price: '1000000', qty: '5000000', ts, signature: sig })
    expect(create.status).toBe(200)
    const id = create.body.listing.id as number

    // Build create-tx (escrow deposit)
    const buildCreate = await request(baseUrl)
      .post(`/api/listings/${id}/build-create-tx`)
      .set('x-wallet', sellerPk58)
      .send({})
    expect(buildCreate.status).toBe(200)
    expect(buildCreate.body.ok).toBe(true)
    expect(typeof buildCreate.body.tx).toBe('string')

    // Build fulfill-tx (V1 atomic)
    const buildFulfill = await request(baseUrl)
      .post(`/api/listings/${id}/build-fulfill-tx`)
      .set('x-wallet', buyerPk58)
      .send({ qty: '3000000' })
    expect(buildFulfill.status).toBe(200)
    expect(buildFulfill.body.ok).toBe(true)
    expect(typeof buildFulfill.body.tx).toBe('string')

    // Build cancel-tx (V1)
    const buildCancel = await request(baseUrl)
      .post(`/api/listings/${id}/build-cancel-tx`)
      .set('x-wallet', sellerPk58)
      .send({})
    expect(buildCancel.status).toBe(200)
    expect(buildCancel.body.ok).toBe(true)
    expect(typeof buildCancel.body.tx).toBe('string')
  })

  it('validates headers and inputs for V1 endpoints', async () => {
    // Create listing
    const ts = Date.now()
    const msg = createMsg({ invoicePk, seller: sellerPk58, price: '1', qty: '1', ts })
    const sig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), seller.secretKey))
    const create = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk, seller: sellerPk58, price: '1', qty: '1', ts, signature: sig })
    const id = create.body.listing.id as number

    // Wrong seller for create-tx
    const badSeller = await request(baseUrl)
      .post(`/api/listings/${id}/build-create-tx`)
      .set('x-wallet', buyerPk58)
      .send({})
    expect(badSeller.status).toBe(403)

    // Missing qty for fulfill-tx
    const missingQty = await request(baseUrl)
      .post(`/api/listings/${id}/build-fulfill-tx`)
      .set('x-wallet', buyerPk58)
      .send({})
    expect(missingQty.status).toBe(400)

    // Missing buyer header for fulfill-tx
    const noBuyer = await request(baseUrl)
      .post(`/api/listings/${id}/build-fulfill-tx`)
      .send({ qty: '1' })
    expect(noBuyer.status).toBe(403)
  })
})
