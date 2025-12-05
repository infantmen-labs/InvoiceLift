# InvoiceLift — Devnet PoC

InvoiceLift is a devnet-only proof-of-concept for **on-chain invoice financing on Solana**.
It demonstrates how a seller can mint an invoice account, lock USDC in escrow, optionally
fractionalize the invoice into shares, trade those shares on a marketplace, and have an
admin relayer settle the invoice once off-chain payment is confirmed.

At a high level the demo lets you:

- **Mint invoices** on Solana devnet with amount, due date, and a metadata hash (e.g. IPFS CID).
- **Create escrow** for each invoice so USDC can be locked against it.
- **Initialize a per-invoice shares mint** and mint fractional "invoice shares" to investors.
- **Fund invoices** directly or fractionally in USDC using your connected wallet (6-decimal base units).
- **Trade invoice shares** on an allowance-based marketplace (V2) using SPL token delegates instead of escrow.
- **View your positions** in the Portfolio page and deep-link into invoice details from anywhere in the app.
- **Settle invoices** via an **admin-only webhook flow** that calls the on-chain `set_settled` instruction.

All flows run **only on devnet**. The frontend enforces this with a devnet guard and a
USDC faucet (100 USDC per request) to make testing easy.

## Prerequisites
- Node.js 18+
- Solana CLI and keypair with devnet SOL
- Anchor 0.31.1 toolchain (program already deployed for this PoC)

## Devnet Values
- Program ID: `F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm`
- USDC Mint (devnet test): `5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT`

## Program Admin & Settlement (AdminConfig)

- The program maintains a global `AdminConfig` account (PDA derived from `["config"]`) that stores the **admin** pubkey.
- Only this admin is allowed to call the on-chain `set_settled` instruction.
- Settlement invariants on-chain:
  - `invoice.status` must be `Funded`.
  - `amount` must be `> 0`.
  - `amount` must equal the invoice `funded_amount` (full settlement only).
  - USDC is always transferred from the escrow PDA ATA to the seller's USDC ATA.

The backend `settleInvoice` helper always reads `fundedAmount` from chain and passes that into `set_settled`, ignoring the webhook body `amount`. This ensures settlement can never partially drain escrow or exceed the funded total.

### One-time setup: init_config

Before any invoice can be settled, you must initialize `AdminConfig` once per deployment so the program knows who the admin/relayer is.

`scripts/init-config.js` uses the same env-driven relayer keypair as the backend:

- `CLUSTER_URL` – RPC endpoint (same as backend).
- `PROGRAM_ID` – deployed `invoice_manager` program ID.
- `RELAYER_KEYPAIR_PATH` – path to the relayer/admin keypair JSON (same as backend).

Run (from repo root, with env vars set appropriately):

```bash
CLUSTER_URL=https://api.devnet.solana.com \
PROGRAM_ID=F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm \
RELAYER_KEYPAIR_PATH=/path/to/relayer-keypair.json \
node scripts/init-config.js
```

The script will print:

- Admin pubkey (from `RELAYER_KEYPAIR_PATH`).
- Config PDA address.
- `init_config` transaction signature + explorer URL.

After this succeeds:

- Only `AdminConfig.admin` may act as `operator` for `set_settled`.
- The payment webhook `/webhook/payment` triggers settlement via the backend relayer, which uses this admin key and enforces the on-chain invariants above.

## System walkthrough (full flow)

For a detailed end-to-end walkthrough (mint invoice → fund → marketplace trades → admin-only settlement via webhook and `AdminConfig`), see:

- `docs/adr/System-full-flow.md` — **Allowance-Based Marketplace (V2) — Full Flow Test Plan**

## Backend (Express)

Backend setup, environment variables, indexer behavior, API endpoints, and webhooks are documented in [`backend/README.md`](backend/README.md).

## Frontend (Vite + React)
1) Configure app/.env:
```
VITE_BACKEND_URL=http://localhost:8080
VITE_FEATURE_ALLOWANCE_FILLS=true
VITE_ADMIN_WALLETS=<ADMIN_B58_1>,<ADMIN_B58_2>
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

Admin UI:
- If your connected wallet is listed in `VITE_ADMIN_WALLETS`, an **Admin** nav item appears in the sidebar and the Admin page is available with:
  - KYC editor and lookup (`POST /api/kyc`, `GET /api/kyc/:wallet`)
  - Document hash add and list (`POST /api/invoice/:id/document`, `GET /api/invoice/:id/documents`)
  - Credit score add and lookup (`POST /api/invoice/:id/score`, `GET /api/invoice/:id/score`)

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
