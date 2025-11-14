import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { web3 } from '@coral-xyz/anchor'

let server: any
let baseUrl: string

function bytesToBase64(bytes: Uint8Array){
  return Buffer.from(bytes).toString('base64')
}

// Minimal SPL Token mocks to let endpoints build transactions without RPC
vi.mock('@solana/spl-token', async () => {
  const { web3 } = await import('@coral-xyz/anchor')
  return {
    TOKEN_PROGRAM_ID: web3.SystemProgram.programId,
    ASSOCIATED_TOKEN_PROGRAM_ID: web3.SystemProgram.programId,
    async getMint(_conn: any, _mint: web3.PublicKey){ return { decimals: 6 } },
    async getAssociatedTokenAddress(_mint: web3.PublicKey, _owner: web3.PublicKey, _allowOffCurve?: boolean){
      return web3.Keypair.generate().publicKey
    },
    createAssociatedTokenAccountInstruction(_payer: web3.PublicKey, _ata: web3.PublicKey){
      return new web3.TransactionInstruction({ keys: [], programId: web3.SystemProgram.programId })
    },
    createApproveCheckedInstruction(_source: web3.PublicKey, _mint: web3.PublicKey, _delegate: web3.PublicKey){
      return new web3.TransactionInstruction({ keys: [], programId: web3.SystemProgram.programId })
    },
    createRevokeInstruction(_source: web3.PublicKey){
      return new web3.TransactionInstruction({ keys: [], programId: web3.SystemProgram.programId })
    },
  }
})

// Anchor layer mocks used by backend/src/index routes
vi.mock('../src/anchor', async () => {
  const { web3 } = await import('@coral-xyz/anchor')
  const dummyProgramId = new web3.PublicKey('F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm')
  const provider = { connection: { getLatestBlockhash: async () => ({ blockhash: 'EET8Z2uiGNsq4CPGK8HBX9nuSUXwxLBzME2YkdEYY5Dd' }), getAccountInfo: async () => null } }
  function dummyTx(){
    const tx = new web3.Transaction()
    tx.add(new web3.TransactionInstruction({ keys: [], programId: web3.SystemProgram.programId }))
    return tx
  }
  function dummyPk(){ return web3.Keypair.generate().publicKey }
  return {
    getProgram: () => ({ programId: dummyProgramId, provider }),
    async fetchInvoice(_program: any, _invoicePk: web3.PublicKey){
      // Return fake invoice with mints
      return { sharesMint: dummyPk().toBase58(), usdcMint: dummyPk().toBase58() }
    },
    // V2 builders
    async buildCreateListingV2Tx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    async buildFulfillListingV2Tx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    async buildCancelListingV2Tx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    // V1 builders (not used here but required by import)
    async buildCreateListingTx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    async buildFulfillListingTx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    async buildCancelListingTx(){ return { tx: dummyTx(), listingPda: dummyPk(), marketAuthority: dummyPk() } },
    // Other functions imported by index.ts
    async settleInvoice(){ return 'TEST_SIG' },
    async fundInvoice(){ return 'TEST_SIG' },
    async mintInvoice(){ return { invoicePubkey: dummyPk(), tx: 'TEST_SIG' } },
    async createEscrow(){ return 'TEST_SIG' },
    async initShares(){ return { sharesMint: dummyPk(), tx: 'TEST_SIG' } },
    async fundInvoiceFractional(){ return 'TEST_SIG' },
  }
})

// Avoid starting real indexer
vi.mock('../src/indexer', () => ({ runIndexer: async () => {} }))

describe('Listings V2 builder & revoke endpoints', () => {
  const seller = nacl.sign.keyPair()
  const buyer = nacl.sign.keyPair()
  const sellerPk58 = bs58.encode(seller.publicKey)
  const buyerPk58 = bs58.encode(buyer.publicKey)
  const invoicePk = '11111111111111111111111111111111' // valid base58 for tests

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.LISTINGS_REQUIRE_SIG = 'true'
    process.env.LISTING_SIG_TOL_SEC = '300'
    process.env.DB_PATH = require('path').resolve(__dirname, `tmp_v2_${Date.now()}_${Math.random()}.sqlite`)
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

  it('creates a listing with signature for use by V2 endpoints', async () => {
    const ts = Date.now()
    const msg = createMsg({ invoicePk, seller: sellerPk58, price: '1000000', qty: '5000000', ts })
    const sig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), seller.secretKey))
    const res = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk, seller: sellerPk58, price: '1000000', qty: '5000000', ts, signature: sig })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.listing?.id).toBeGreaterThan(0)
  })

  it('builds V2 create/init, approves shares/usdc, fulfills, cancels, and revokes', async () => {
    // Create a fresh listing
    const ts = Date.now()
    const msg = createMsg({ invoicePk, seller: sellerPk58, price: '1000000', qty: '5000000', ts })
    const sig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), seller.secretKey))
    const create = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk, seller: sellerPk58, price: '1000000', qty: '5000000', ts, signature: sig })
    const id = create.body.listing.id as number

    // Init on-chain (V2)
    const initV2 = await request(baseUrl)
      .post(`/api/listings/${id}/build-create-v2-tx`)
      .set('x-wallet', sellerPk58)
      .send({})
    expect(initV2.status).toBe(200)
    expect(initV2.body.ok).toBe(true)
    expect(typeof initV2.body.tx).toBe('string')

    // Seller approves shares
    const approveShares = await request(baseUrl)
      .post(`/api/listings/${id}/build-approve-shares`)
      .set('x-wallet', sellerPk58)
      .send({})
    expect(approveShares.status).toBe(200)
    expect(approveShares.body.ok).toBe(true)
    expect(typeof approveShares.body.tx).toBe('string')

    // Buyer approves USDC for partial fill (qty 3_000_000)
    const approveUsdc = await request(baseUrl)
      .post(`/api/listings/${id}/build-approve-usdc`)
      .set('x-wallet', buyerPk58)
      .send({ qty: '3000000' })
    expect(approveUsdc.status).toBe(200)
    expect(approveUsdc.body.ok).toBe(true)
    expect(typeof approveUsdc.body.tx).toBe('string')
    expect(typeof approveUsdc.body.marketAuthority).toBe('string')
    expect(approveUsdc.body.total).toBe('3000000')

    // Fulfill V2
    const fulfill = await request(baseUrl)
      .post(`/api/listings/${id}/build-fulfill-v2`)
      .set('x-wallet', buyerPk58)
      .send({ qty: '3000000' })
    expect(fulfill.status).toBe(200)
    expect(fulfill.body.ok).toBe(true)
    expect(typeof fulfill.body.tx).toBe('string')

    // Cancel V2 (seller)
    const cancelV2 = await request(baseUrl)
      .post(`/api/listings/${id}/build-cancel-v2-tx`)
      .set('x-wallet', sellerPk58)
      .send({})
    expect(cancelV2.status).toBe(200)
    expect(cancelV2.body.ok).toBe(true)
    expect(typeof cancelV2.body.tx).toBe('string')

    // Revoke shares (seller)
    const revokeShares = await request(baseUrl)
      .post(`/api/listings/${id}/build-revoke-shares`)
      .set('x-wallet', sellerPk58)
      .send({})
    expect(revokeShares.status).toBe(200)
    expect(revokeShares.body.ok).toBe(true)

    // Revoke USDC (buyer)
    const revokeUsdc = await request(baseUrl)
      .post(`/api/listings/${id}/build-revoke-usdc`)
      .set('x-wallet', buyerPk58)
      .send({})
    expect(revokeUsdc.status).toBe(200)
    expect(revokeUsdc.body.ok).toBe(true)
  })

  it('validates headers and inputs for V2 endpoints', async () => {
    // Create listing
    const ts = Date.now()
    const msg = createMsg({ invoicePk, seller: sellerPk58, price: '1000000', qty: '1000000', ts })
    const sig = bytesToBase64(nacl.sign.detached(new TextEncoder().encode(msg), seller.secretKey))
    const create = await request(baseUrl)
      .post('/api/listings')
      .set('x-wallet', sellerPk58)
      .send({ invoicePk, seller: sellerPk58, price: '1000000', qty: '1000000', ts, signature: sig })
    const id = create.body.listing.id as number

    // Wrong wallet for seller-only endpoint
    const badSeller = await request(baseUrl)
      .post(`/api/listings/${id}/build-approve-shares`)
      .set('x-wallet', buyerPk58)
      .send({})
    expect(badSeller.status).toBe(403)

    // Missing qty for approve-usdc
    const missingQty = await request(baseUrl)
      .post(`/api/listings/${id}/build-approve-usdc`)
      .set('x-wallet', buyerPk58)
      .send({})
    expect(missingQty.status).toBe(400)

    // Missing buyer wallet for fulfill-v2
    const noBuyer = await request(baseUrl)
      .post(`/api/listings/${id}/build-fulfill-v2`)
      .send({ qty: '1' })
    expect(noBuyer.status).toBe(403)

    // Bad seller for cancel-v2
    const badCancel = await request(baseUrl)
      .post(`/api/listings/${id}/build-cancel-v2-tx`)
      .set('x-wallet', buyerPk58)
      .send({})
    expect(badCancel.status).toBe(403)
  })
})
