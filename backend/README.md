# InvoiceLift Backend (Express)

This README documents the Node/Express backend that powers InvoiceLift. The root `README.md` focuses on the product and Solana program; use this file for backend setup, environment variables, indexer behavior, and REST API endpoints.

## Environment (backend/.env)

Typical local dev configuration:

```env
PORT=8080
CLUSTER_URL=https://api.devnet.solana.com
PROGRAM_ID=F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm
RELAYER_KEYPAIR_PATH=C:\Users\Spektor\.config\solana\id.json
USDC_MINT=5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT
HMAC_SECRET=<replace-with-strong-secret>
# Enforce webhook HMAC signature verification (true/false)
ENABLE_HMAC=true
# Optional: webhook timestamp tolerance in seconds (default 300)
WEBHOOK_TOLERANCE_SEC=300
# CORS
CORS_ORIGIN=http://localhost:5173

# Listings signatures
# Default is true; set to 'false' to disable verification
LISTINGS_REQUIRE_SIG=true
LISTING_SIG_TOL_SEC=300
ADMIN_WALLETS=

# Indexer / positions cache
POSITIONS_TTL_MS=30000
INDEXER_SYNC_MS=60000
REQUIRE_KYC=true

# Optional: override SQLite DB path (tests/CI)
# DB_PATH=./data/dev.sqlite

# Dev-only faucet; set to true to enable
FAUCET_ENABLED=false

# Admin key for viewing waitlist entries via GET /api/waitlist?key=...
WAITLIST_ADMIN_KEY=<replace-with-strong-admin-key>
```

## Run the backend locally

```bash
cd backend
npm install
npm run dev
# health check
curl http://localhost:8080/healthz
```

### Tests

```bash
cd backend
npm test
```

## Database & Indexer

- SQLite file at `backend/data/dev.sqlite` is created on first run.
- No external DB required in dev. Delete the file to reset state.
- A lightweight indexer seeds and syncs invoices from chain periodically (default ~60s, configurable via `INDEXER_SYNC_MS`).
- SPL transfer subscription for `shares_mint` updates the positions cache and activity feed in near real-time.
- Waitlist entries (Join Waitlist + Investor Interest forms) are stored in `waitlist_entries` via the `/api/waitlist` endpoint.

## Marketplace Listings: Env flags and signatures

- **Env flags**
  - **LISTINGS_REQUIRE_SIG**: true/false. Default: true (set to 'false' to disable). When enabled, listing create/cancel/fill require a wallet-signed message. Backend verifies ed25519 signatures (tweetnacl) and checks timestamp tolerance.
  - **LISTING_SIG_TOL_SEC**: Timestamp tolerance in seconds. Default 300.
  - **ADMIN_WALLETS**: Comma-separated base58 public keys. Admin-only backend endpoints require header `x-admin-wallet` to match one of these.

- **Headers**
  - `x-wallet`: Base58 pubkey of the signer (seller for create/cancel, buyer for fill). Must match the message signer.
  - `x-admin-wallet`: Admin wallet (for admin-gated endpoints like mint, fund, init-shares, fund-fractional, create-escrow, KYC, docs, scores).

- **Signature message formats** (UTF-8, newline-delimited). `ts` is epoch milliseconds.
  - Create listing
    ```
    listing:create
    invoicePk=<INVOICE_PUBKEY>
    seller=<SELLER_B58>
    price=<PRICE_BASE_UNITS>
    qty=<QTY_BASE_UNITS>
    ts=<EPOCH_MS>
    ```
  - Cancel listing
    ```
    listing:cancel
    id=<LISTING_ID>
    seller=<SELLER_B58>
    ts=<EPOCH_MS>
    ```
  - Fill listing
    ```
    listing:fill
    id=<LISTING_ID>
    buyer=<BUYER_B58>
    qty=<QTY_BASE_UNITS>
    ts=<EPOCH_MS>
    ```

- **Signature encoding**
  - Frontend: `signature = base64(wallet.signMessage(utf8(message)))`
  - Backend expects JSON body fields `{ ts, signature, ... }` alongside required inputs, and verifies with `tweetnacl.sign.detached.verify` using the `x-wallet` header as the public key.

## Allowance-Based Marketplace (V2)

This flow uses SPL token allowances for an atomic swap without escrow. The program uses a PDA delegate (`marketplace_authority`) derived from the listing to transfer tokens via `transfer_checked`.

- Feature flag (frontend): set `VITE_FEATURE_ALLOWANCE_FILLS=true` to enable V2 UI. Escrow (V1) remains as fallback.
- Decimals: `qty` and `price` are expressed in base units with 6 decimals. Total USDC is computed on-chain as `(qty * price) / 1_000_000`.

Endpoints (backend builds unsigned txs you sign and submit from the wallet):
- `POST /api/listings/:id/build-create-v2-tx`
  - Seller initializes the on-chain Listing account (no escrow transfer).
  - Headers: `x-wallet: <SELLER_B58>`
- `POST /api/listings/:id/build-approve-shares`
  - Seller approves `qty` shares to the `marketplace_authority` PDA.
  - Headers: `x-wallet: <SELLER_B58>`
- `POST /api/listings/:id/build-approve-usdc`
  - Buyer approves total USDC to the `marketplace_authority` PDA.
  - Headers: `x-wallet: <BUYER_B58>`; Body: `{ "qty": "<QTY_BASE_UNITS>" }`
- `POST /api/listings/:id/build-fulfill-v2`
  - Buyer triggers the atomic swap (USDC → seller, shares → buyer) using allowances.
  - Headers: `x-wallet: <BUYER_B58>`; Body: `{ "qty": "<QTY_BASE_UNITS>" }`
- `POST /api/listings/:id/build-cancel-v2-tx`
  - Seller cancels the listing on-chain (revokes shares allowance, sets `remaining_qty=0`).
  - Headers: `x-wallet: <SELLER_B58>`
- `POST /api/listings/:id/build-revoke-shares`
  - Seller convenience revoke for the shares allowance.
  - Headers: `x-wallet: <SELLER_B58>`
- `POST /api/listings/:id/build-revoke-usdc`
  - Buyer convenience revoke for the USDC allowance.
  - Headers: `x-wallet: <BUYER_B58>`

### Escrow-Based Flow (V1) — Reference

1. Seller creates listing (DB)
2. Seller deposits shares to escrow and creates the Listing account on-chain:
   - `POST /api/listings/:id/build-create-tx` (seller signs)
3. Buyer fills on-chain via escrow path:
   - `POST /api/listings/:id/build-fulfill-tx` with `{ qty }` (buyer signs)

## Core API Endpoints (quick ref)

### Invoices & positions

- `POST /api/invoice/mint`
- `POST /api/invoice/:invoiceId/create-escrow`
- `POST /api/invoice/:invoiceId/fund`
- `GET /api/invoice/:invoiceId`
- `POST /api/invoice/:invoiceId/init-shares`
- `POST /api/invoice/:invoiceId/fund-fractional`
- `GET /api/invoice/:invoiceId/positions`
- `GET /api/invoices?status=&wallet=`
- `GET /idl/invoice_manager` (serve IDL)

### Marketplace listings

- `GET /api/listings/open`
- `GET /api/invoice/:id/listings`
- `GET /api/listings?seller=...`
- `POST /api/listings` — create listing (off-chain row)
- `POST /api/listings/:id/cancel`
- `POST /api/listings/:id/fill`
- V2 allowance-based endpoints listed above

### Waitlist / investor interest

- `POST /api/waitlist`
  - Body: `{ "name?": string, "email": string, "source?": "waitlist" | "investor" }`
- `GET /api/waitlist?key=WAITLIST_ADMIN_KEY&limit=1000`
  - Admin-only JSON view of recent waitlist entries.

### Verification & Trust

- **KYC**
  - `POST /api/kyc` (admin)
    - Body: `{ "wallet": "<B58>", "status": "approved|review|rejected", "provider?": "string", "reference?": "string", "payload?": { ... } }`
  - `GET /api/kyc/:wallet`
- **Documents (hash + optional CID)**
  - `POST /api/invoice/:id/document` (admin)
  - `GET /api/invoice/:id/documents`
- **Credit Score (mock rules)**
  - `POST /api/invoice/:id/score` (admin)
  - `GET /api/invoice/:id/score`
- **Faucet (dev only)**
  - `POST /api/faucet/usdc` (requires `FAUCET_ENABLED=true`)

Admin writes require header `x-admin-wallet` matching one of `ADMIN_WALLETS`. Reads are public.

### Webhooks

- `POST /webhook/payment` (HMAC)
- `POST /webhook/kyc` (HMAC)

Both use a timestamped HMAC with idempotency based on `HMAC_SECRET`. See the root `README.md` or `docs/adr/System-full-flow.md` for full settlement semantics and examples.
