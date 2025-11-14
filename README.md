# InvoiceLift — Devnet PoC

End-to-end prototype for mint → fund → settle invoice financing on Solana (Anchor).

## Prerequisites
- Node.js 18+
- Solana CLI and keypair with devnet SOL
- Anchor 0.31.1 toolchain (program already deployed for this PoC)

## Devnet Values
- Program ID: `F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm`
- USDC Mint (devnet test): `5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT`

## Backend (Express)
1) Configure environment (backend/.env):
```
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
 CORS_ORIGIN=http://localhost:5173
 # Optional: override SQLite DB path (tests/CI)
 # DB_PATH=./data/dev.sqlite
 # Dev-only faucet; set to true to enable
 FAUCET_ENABLED=false
```

### Marketplace Listings: Env flags and signatures

- **Env flags**
  - **LISTINGS_REQUIRE_SIG**: true/false. Default: true (set to 'false' to disable). When enabled, listing create/cancel/fill require a wallet-signed message. Backend verifies ed25519 signatures (tweetnacl) and checks timestamp tolerance.
  - **LISTING_SIG_TOL_SEC**: Timestamp tolerance in seconds. Default 300.
  - **ADMIN_WALLETS**: Comma-separated base58 public keys. Admin-only backend endpoints require header `x-admin-wallet` to match one of these.

- **Headers**
  - `x-wallet`: Base58 pubkey of the signer (seller for create/cancel, buyer for fill). Must match the message signer.
  - `x-admin-wallet`: Admin wallet (for admin-gated endpoints like mint, fund, init-shares, fund-fractional, create-escrow).

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

- **Listings endpoints (quick ref)**
  - `GET /api/listings/open`
  - `GET /api/invoice/:id/listings`
  - `GET /api/listings?seller=...`
  - `POST /api/listings` `{ invoicePk, seller, price, qty, ts, signature }`
  - `POST /api/listings/:id/cancel` `{ ts, signature }`
  - `POST /api/listings/:id/fill` `{ qty, ts, signature }`

### Allowance-Based Marketplace (V2)

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
   - Seller cancels the listing on-chain (revokes shares allowance, sets remaining_qty=0).
   - Headers: `x-wallet: <SELLER_B58>`
 - `POST /api/listings/:id/build-revoke-shares`
   - Seller convenience revoke for the shares allowance.
   - Headers: `x-wallet: <SELLER_B58>`
 - `POST /api/listings/:id/build-revoke-usdc`
   - Buyer convenience revoke for the USDC allowance.
   - Headers: `x-wallet: <BUYER_B58>`

Example (buyer approve USDC):
```
curl -X POST http://localhost:8080/api/listings/1/build-approve-usdc \
  -H "Content-Type: application/json" \
  -H "x-wallet: <BUYER_B58>" \
  -d '{"qty":"1000000"}'  # 1.000000 shares
```

Example (buyer fulfill V2):
```
curl -X POST http://localhost:8080/api/listings/1/build-fulfill-v2 \
  -H "Content-Type: application/json" \
  -H "x-wallet: <BUYER_B58>" \
  -d '{"qty":"1000000"}'
```

Troubleshooting:
- DelegateMissing: Ensure you approved to the PDA delegate derived by the program (endpoints handle the correct PDA).
- InsufficientAllowance: Approve sufficient `qty` (seller) and `total` USDC (buyer) before fulfill.
- ATAs: Backend auto-creates missing ATAs as pre-instructions in the unsigned transaction it returns.
 - UI will surface current delegate and delegated amount for shares (seller) and USDC (buyer) when the allowance feature flag is enabled.

#### End-to-End Flow (V2)

1) Seller creates listing (off-chain DB row):
   - `POST /api/listings { invoicePk, seller, price, qty, (optional sig) }`
2) Seller initializes on-chain Listing account without escrow:
   - `POST /api/listings/:id/build-create-v2-tx` with header `x-wallet: <SELLER>`; sign+submit Tx.
3) Seller approves shares to the PDA delegate:
   - `POST /api/listings/:id/build-approve-shares` with `x-wallet: <SELLER>`; sign+submit.
4) Buyer approves USDC for the desired quantity:
   - `POST /api/listings/:id/build-approve-usdc` with `x-wallet: <BUYER>` and body `{ qty }` (base units);
     sign+submit.
5) Buyer fulfills atomically using allowances:
   - `POST /api/listings/:id/build-fulfill-v2` with `{ qty }` and `x-wallet: <BUYER>`; sign+submit.
6) Verify state:
   - Listing `remaining_qty` decreases (on-chain fetch by backend enrichment).
   - Buyer’s shares appear in Portfolio (`GET /api/portfolio/:wallet`) and in wallet ATA.

Note: Frontend exposes steps 2–5 as buttons when `VITE_FEATURE_ALLOWANCE_FILLS=true`.

#### Escrow-Based Flow (V1) — Reference

1) Seller creates listing (DB)
2) Seller deposits shares to escrow and creates the Listing account on-chain:
   - `POST /api/listings/:id/build-create-tx` (seller signs)
3) Buyer fills on-chain via escrow path:
   - `POST /api/listings/:id/build-fulfill-tx` with `{ qty }` (buyer signs)

2) Install and run:
```
cd backend
npm install
npm run dev
# health check
curl http://localhost:8080/healthz
```

### Database & Indexer
- SQLite file at `backend/data/dev.sqlite` is created on first run.
- No external DB required in dev. Delete the file to reset state.
- A lightweight indexer seeds and syncs invoices from chain every 30s.

### API Endpoints
- POST /api/invoice/mint
```
curl -X POST http://localhost:8080/api/invoice/mint \
  -H "Content-Type: application/json" \
  -d '{"metadataHash":"demo-cid-or-hash","amount":"5000000","dueDate":"1736294400"}'
```
- POST /api/invoice/{invoiceId}/create-escrow
```
curl -X POST http://localhost:8080/api/invoice/<INVOICE>/create-escrow
```
- POST /api/invoice/{invoiceId}/fund
```
curl -X POST http://localhost:8080/api/invoice/<INVOICE>/fund \
  -H "Content-Type: application/json" \
  -d '{"amount":"5000000"}'
```
- GET /api/invoice/{invoiceId}
```
curl http://localhost:8080/api/invoice/<INVOICE>
```
- POST /api/invoice/{invoiceId}/init-shares (Phase 2B)
```
curl -X POST http://localhost:8080/api/invoice/<INVOICE>/init-shares
```
- POST /api/invoice/{invoiceId}/fund-fractional (Phase 2B)
```
curl -X POST http://localhost:8080/api/invoice/<INVOICE>/fund-fractional \
  -H "Content-Type: application/json" \
  -d '{"amount":"500000"}'
```
- GET /api/invoice/{invoiceId}/positions
```
curl http://localhost:8080/api/invoice/<INVOICE>/positions
```
- GET /api/invoices?status=&wallet=
```
curl "http://localhost:8080/api/invoices?status=Open"
curl "http://localhost:8080/api/invoices?wallet=<WALLET_PUBKEY>"
```
- GET /idl/invoice_manager (serve IDL)
```
curl http://localhost:8080/idl/invoice_manager
```
- Allowance-based Marketplace (V2)
  - `POST /api/listings/:id/build-create-v2-tx`
  - `POST /api/listings/:id/build-approve-shares`
  - `POST /api/listings/:id/build-approve-usdc`
  - `POST /api/listings/:id/build-fulfill-v2`
  - `POST /api/listings/:id/build-cancel-v2-tx`
  - `POST /api/listings/:id/build-revoke-shares`
  - `POST /api/listings/:id/build-revoke-usdc`
- POST /api/faucet/usdc (dev only; mints USDC to a wallet)
```
curl -X POST http://localhost:8080/api/faucet/usdc \
  -H "Content-Type: application/json" \
  -d '{"recipient":"<WALLET_PUBKEY>","amount":"10000000"}'
```
Requires `FAUCET_ENABLED=true`.
- POST /webhook/payment (HMAC)
```
# Enable HMAC by setting ENABLE_HMAC=true in backend/.env
# Timestamped HMAC with idempotency:
#   preimage = "<ts_ms>." + JSON.stringify(body)
#   signature = hex(hmac_sha256(HMAC_SECRET, preimage))
TS=$(node -e "console.log(Date.now())")
BODY='{"invoice_id":"<INVOICE>","amount":"5000000"}'
PREIMAGE="$TS.$BODY"
SIG=$(echo -n $PREIMAGE | openssl dgst -sha256 -hmac "$HMAC_SECRET" -r | awk '{print $1}')
curl -X POST http://localhost:8080/webhook/payment \
  -H "Content-Type: application/json" \
  -H "x-hmac-timestamp: $TS" \
  -H "x-hmac-signature: $SIG" \
  -H "x-idempotency-key: demo-$TS" \
  -d "$BODY"
```

## Frontend (Vite + React)
1) Configure app/.env:
```
VITE_BACKEND_URL=http://localhost:8080
VITE_FEATURE_ALLOWANCE_FILLS=true
```
2) Install and run:
```
cd app
npm install
npm run dev
```
- MintInvoice page mints invoice and creates escrow.
- FundInvoice page supports two flows:
  - Relayer-funded (backend) by amount
  - Investor-signed funding via connected wallet
    - The UI auto-creates your USDC ATA if missing and can use the USDC faucet.
- Invoices list: filter by status/wallet, open detail panel, explorer links.
- Marketplace pages (and invoice listings panel):
  - If `VITE_FEATURE_ALLOWANCE_FILLS=true`, show V2 buttons:
    - Seller: Init On-chain (V2), Approve Shares
    - Buyer: Approve USDC, Fill On-chain (V2)
  - Else, show escrow deposit + Fill On-chain (V1) fallback.

## Demo Scripts
- JavaScript (recommended, Node 18+):
```
BACKEND_URL=http://localhost:8080 node scripts/demo.js
# With signed webhook
BACKEND_URL=http://localhost:8080 SIGN_WEBHOOK=true HMAC_SECRET=<secret> node scripts/demo.js
```
- TypeScript (optional):
```
cd scripts
npm install
npm run demo
```

## Notes
- CORS origin is configurable via `CORS_ORIGIN` (default http://localhost:5173).
- For production, keep `ENABLE_HMAC=true` and sign webhooks server-side only.
- The PoC uses a devnet USDC test mint controlled by the relayer; replace with your own for testing.
