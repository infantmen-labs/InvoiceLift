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

## Roadmap
- Phase 1 (PoC): Done — backend + program + UI working on devnet.
- Phase 2 (Next): Roles, metadata storage, persistence/indexing, provider webhook integration, tests.
