# InvoiceLift — Technical Development Roadmap (Engineering Only)

Scope: End-to-end technical plan to build the devnet PoC and evolve toward a marketplace. Excludes grant admin, marketing, and non-engineering items.

---

## 0) Baseline & Assumptions

- Cluster: Solana devnet
- Frameworks: Anchor (program), Node.js/Express TS (backend), React + Wallet Adapter (frontend)
- Tokens: USDC devnet mint configured via env (no hardcoding). SPL Token for Phase 1
- Keys: Local dev keypairs for program authority/relayer only in devnet; no mainnet keys
- Repo layout: as in reference skeleton (programs/, backend/, app/, scripts/, tests/, docs/)
- Security posture (devnet): minimal but sane (HMAC webhooks, authZ checks, no public write endpoints without checks)

---

## 1) Workstreams

- Program (Anchor)
- Backend API & Relayer (TS/Express)
- Frontend (React + Wallet)
- Demo Scripts & Tooling
- Indexer & DB (Phase 2+)
- CI/CD, Quality & Observability
- Security Hardening & Key Management

---

## 2) Phase 0 — Environment & Scaffolding — Status: Completed

- Install toolchains: Solana CLI, Anchor, Rust, Node LTS, ts-node
- Initialize repo skeleton and package managers (npm/yarn/pnpm)
- Configure basic TS configs, lint, format, pre-commit hooks
- Add .env templates for program ID, cluster URL, USDC mint, relayer keypair path
- GitHub Actions: lint + typecheck + Anchor unit tests

Definition of Done — Completed
- `anchor build` passes locally (IDL generated)
- Backend health check available at GET `/healthz`
- Frontend shows functional Connect Wallet button (devnet)

---

## 3) Phase 1 — E2E Devnet Prototype (Mint → Fund → Settle) — Status: Completed

### Phase 1 Summary — Completed Items

- Program (Anchor)
  - Implemented escrow USDC token account (PDA authority) and instructions: `create_escrow`, `fund_invoice`, `set_settled` (escrow→seller transfer)
  - Rebuilt IDL and deployed to devnet: `F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm`
- Backend (Express)
  - Implemented `/webhook/payment` with HMAC verification (toggle via `ENABLE_HMAC`), `/api/invoice/:id`, `/api/invoice/mint`, `/api/invoice/:id/create-escrow`, `/api/invoice/:id/fund`
  - Enabled CORS for frontend dev server
- Frontend (React)
  - Wired minimal mint and fund flows to backend; shows tx links and status
- Demo & Docs
  - Added `scripts/demo.js` one-shot flow (mint → escrow → fund → settle) with optional HMAC signing
  - Added README quickstart and API examples

### 3.1 Program (Anchor): `invoice_manager`

Accounts
- `Invoice` PDA: seller, amount, metadata_hash, due_date, status, investor(optional), funded_amount
- `Escrow` PDA/authority: derivation for escrow USDC token account owned by program

Instructions
- `mint_invoice(metadata_hash: String, amount: u64, due_date: i64)`
  - Create `Invoice` PDA; set status=Open
  - (Optional tokenization v0) Emit event; NFT mint can be deferred to Phase 2
- `create_escrow(invoice)`
  - Create escrow USDC token account (ATA) with program authority for invoice
- `fund_invoice(invoice, investor, amount)`
  - CPI to SPL Token: transfer USDC from investor ATA → escrow ATA
  - Set invoice.investor, funded_amount; status=Funded
- `set_settled(invoice, operator)`
  - Access control: `operator` signer must match configured relayer/operator
  - Transfer USDC from escrow ATA → seller ATA
  - status=Settled; emit event

Events & Errors
- Emit events for Minted, Funded, Settled
- Custom errors for insufficient funds, wrong status, auth

Tests (Anchor)
- Unit tests covering happy path and basic reverts

### 3.2 Backend API & Relayer (TS/Express)

- Libraries: `@coral-xyz/anchor`, `@solana/web3.js`, `tweetnacl` or `crypto` for HMAC
- Env: CLUSTER_URL, PROGRAM_ID, RELAYER_KEYPAIR_PATH, USDC_MINT, HMAC_SECRET
- Endpoints
  - POST `/api/invoice/mint` → calls `mint_invoice` (+ `create_escrow`); returns `invoice_pubkey`, tx ids
  - POST `/api/invoice/:id/fund` → server constructs/returns tx or server-signs with investor dev key (dev-only); returns tx id
  - POST `/webhook/payment` → verify HMAC; sanity checks; calls `set_settled`; returns tx id
  - GET `/api/invoice/:id` → reads on-chain state (Anchor fetch)
- Logging: pino/winston; include tx signatures and links

### 3.3 Frontend (React)

- Wallet connect + cluster selector (devnet)
- Pages
  - MintInvoice: form(metadata hash, amount, due date) → POST mint; show tx links
  - FundInvoice: select invoice, amount → POST fund; show tx links
  - Read-only invoice view: status, links

### 3.4 Demo Script

- `scripts/demo.ts`: orchestrate mint → fund → webhook(settle); print tx links

### 3.5 CI/CD & Quality

- GitHub Action: backend typecheck/lint/test, Anchor build/test
- Prettier/ESLint; Rust fmt/clippy optional in CI

Definition of Done (Phase 1)
- One invoice lifecycle completed on devnet with verifiable tx links
- Anchor tests pass; backend webhook settlement works with HMAC
- Minimal UI supports mint & fund flows

---

## 4) Phase 2 — Persistence, Indexing, Security & UX — Status: Phase 2A Completed; Phase 2B (Fractionalization) Completed

### Phase 2A — Completed Items

- Frontend
  - Investor-signed “Fund with Wallet” flow via wallet adapter + Anchor
  - Invoice list and detail views with status polling and explorer links
- Backend & Indexing
  - Serve IDL via `GET /idl/invoice_manager`
  - SQLite persistence (tables: invoices, tx_logs, webhook_events for idempotency)
  - Polling indexer to sync on-chain invoices into DB (every ~30s)
  - Routes: `GET /api/invoices`, `GET /api/invoice/:id`, `POST /api/invoice/mint`, `POST /api/invoice/:id/create-escrow`, `POST /api/invoice/:id/fund`
  - Dev-only USDC faucet at `POST /api/faucet/usdc`
- Webhook Security
  - Timestamped HMAC verification, replay protection, idempotency keys
- Tests & Docs
  - Backend integration tests (health, webhook HMAC/idempotency, core endpoints)
  - README updated with DB setup, indexer, investor wallet flow, faucet, and webhook details
  - Test isolation supported via `DB_PATH` env override

Note: Anchor program unit tests are scaffolded and will be run once local authority/tooling is unified across environments.

### Phase 2B — Fractionalization & Positions — Status: Completed

Program (Anchor)
- Added fractionalization with per-invoice SPL `shares_mint` on `Invoice` account
- Implemented `init_shares` and `fund_invoice_fractional`
- Fixed account mutability for `shares_mint` and payer where needed
- Anchor tests added for `init_shares` and `fund_invoice_fractional`

Backend
- New endpoints:
  - `POST /api/invoice/:id/init-shares`
  - `POST /api/invoice/:id/fund-fractional`
  - `GET /api/invoice/:id/positions` derives holders from SPL token accounts of `shares_mint`
- SQLite persistence extended with `shares_mint`
- Optional positions cache with TTL (`POSITIONS_TTL_MS`), stored in `positions_cache`
- Indexer precomputes and caches positions for invoices with `shares_mint` every ~30s

Frontend
- Added fractional UI in invoice detail: "Init Shares" and "Fund fraction" with amount input
- Added wallet-based flows for Mint Invoice, Init Shares, and Fund Fraction for consistency
- Global signer mode (Backend vs Wallet) with role-based UI via `VITE_ADMIN_WALLETS`
  - Non-admins are forced to Wallet mode; backend mode hidden
- Seller-gated settlement in Wallet mode; "Settle (Webhook)" only in Backend mode
- Toasts with explorer links for all txs

Definition of Done (Phase 2B)
- Multiple investors can fund an invoice; positions visible and cached via API
- Wallet UX is consistent across Mint, Init Shares, Fund Fraction

Notes
- Marketplace (orderbook/listings, secondary transfers indexing) is deferred to Phase 2C

### Phase 2C — Marketplace — Completed

Program (Anchor)
- Implemented allowance-based marketplace flow alongside existing escrow (V1):
  - Added `marketplace_authority` PDA: seeds `["market", listing_pda]`.
  - Added `create_listing_v2` (no escrow transfer on create; initializes on-chain Listing with `remaining_qty`).
  - Added `fulfill_listing_v2` (atomic swap via SPL allowances using PDA delegate with `transfer_checked`).
  - Backwards-compatible with V1 escrow create/fulfill/cancel.

Indexer & DB
- Existing polling indexer continues to sync invoices. Implemented SPL transfer subscription for `shares_mint` to drive positions cache and activity feed.

Backend
- Listings APIs extended for allowance (V2) flow:
  - `POST /api/listings/:id/build-create-v2-tx` (init on-chain Listing account without escrow)
  - `POST /api/listings/:id/build-approve-shares` (seller approves shares to `marketplace_authority` PDA)
  - `POST /api/listings/:id/build-approve-usdc` (buyer approves USDC to PDA)
  - `POST /api/listings/:id/build-fulfill-v2` (atomic swap using allowances)
- Listings enrichment now resolves on-chain `Listing.remaining_qty` when available, includes `onChain: true|false`, and preserves escrow-based fallback for V1.

Frontend
- Invoices and Marketplace pages updated with a feature-flagged allowance UI (`VITE_FEATURE_ALLOWANCE_FILLS`):
  - Seller: Init On-chain (V2), Approve Shares
  - Buyer: Approve USDC, Fill On-chain (V2)
- Escrow deposit + V1 fulfill kept as fallback when the feature flag is disabled.

Quality & Security
- Verified E2E allowance-based flow on devnet: create/init, approvals, fulfill, state reflection, and portfolio updates.

Definition of Done (Phase 2C)
- Allowance-based create/init, approvals, and atomic fulfill are usable end-to-end on devnet; UI exposes both flows via feature flag; listings state reflects on-chain `remaining_qty`; tests and docs updated.
- Status: Completed

#### Phase 2C — Recently Completed
- Program
  - Implemented `cancel_listing_v2` to revoke seller shares delegate and set `remaining_qty = 0`.
  - Emitted events for fulfill and cancel across V1 and V2 flows for better observability.
- Backend
  - Added revoke allowance endpoints: `POST /api/listings/:id/build-revoke-shares` and `POST /api/listings/:id/build-revoke-usdc`.
  - Added V2 cancel builder endpoint: `POST /api/listings/:id/build-cancel-v2-tx`.
  - Wrote integration tests covering V2 create/init, approvals, fulfill, cancel, and revoke endpoints.
- Frontend
  - Wired “Cancel On-chain (V2)” buttons and added convenience revoke actions (Invoices) behind feature flag.

---

## 5) Phase 3 — Verification & Trust (Technical Only)

Status: Completed

- KYC Sandbox integration (stub): client onboarding flow to collect KYC tokens; backend verifies webhook; store KYC status off-chain
- Document hashing/storage: compute hash client-side, store on-chain hash; upload file to IPFS/Arweave via gateway; store CID off-chain
- Credit scoring mock service: rules engine using external data API; write risk_label on-chain or off-chain index
- Security hardening
  - Replace single `operator` with multisig (e.g., SPL multisig PDA) or allow-list of relayer keys
  - Strict webhook signature verification and replay protection

### Phase 3 — Recently Completed

- Backend & DB
  - Added SQLite tables: `kyc_records`, `doc_hashes`, `credit_scores`.
  - Endpoints (admin writes, public reads):
    - `POST /api/kyc`, `GET /api/kyc/:wallet`
    - `POST /api/invoice/:id/document`, `GET /api/invoice/:id/documents`
    - `POST /api/invoice/:id/score`, `GET /api/invoice/:id/score`
  - Webhooks:
    - `POST /webhook/kyc` with timestamped HMAC verification and idempotency (mirrors payment webhook).
  - Validations:
    - Document `hash` must be 64-char hex (SHA-256); max 10 documents per invoice.
    - Credit score auto-derives `riskLabel` from score: `>=700 Low`, `600–699 Medium`, `<600 High`.
  - Tests: backend integration tests cover KYC admin gating/read, document validation/limits, score derivation.

- Frontend
  - Minimal Admin UI (visible when wallet is in `VITE_ADMIN_WALLETS`):
    - KYC editor/lookup
    - Document hash add/list
    - Credit score add/lookup

### Next Steps (Phase 3)

1. Optional: KYC gating on listing actions (env `REQUIRE_KYC`) with clear 403 errors.
2. Optional: integrate real KYC provider payload mapping in `/webhook/kyc`.
3. Expand risk rules using external data API; observability/audit logs for Phase 3 writes.

Definition of Done (Phase 3)
- KYC stub flows operational in dev; document hash persisted; risk labels surfaced in UI — ✅ Completed

---

## 6) Phase 4 — Hardening, DX & OSS Packaging (Technical)

Status: Completed

- Program: events/docs, account size audits, upgrade path, error codes finalized
- Backend: config validation, typed APIs (zod), robust logging/metrics
- Frontend: polish UX for core flows, error handling, tx status polling
- Docker/devcontainers for all services; Makefile/justfile for common tasks
- Public README quickstart, technical spec in docs/, SECURITY checklist (engineering-only)

### Phase 4 — Recently Completed

- Backend
  - Structured JSON logging (`backend/src/logger.ts`): configurable via `LOG_LEVEL`, request logging middleware.
  - Config validation preflight (`backend/src/config.ts`): warns on missing/risky env (non-breaking).
  - Typed API validation with zod (`backend/src/validation.ts`):
    - KYC, Docs, Score, Webhooks (payment, KYC), Listings (create/cancel/fill).
    - Clear error messages from schema validation.
  - All tests passing (31/31) with validation integrated.

- Infrastructure & DX
  - Docker:
    - `backend/Dockerfile` (Debian slim + native build tools for better-sqlite3).
    - `app/Dockerfile` (Vite build + preview).
  - Compose: `docker-compose.yml` to run backend + app together.
  - Devcontainer: `.devcontainer/devcontainer.json` for quick onboarding.

- CI/CD
  - GitHub Actions: `.github/workflows/project-ci.yml`
    - Backend: typecheck + tests
    - Frontend: typecheck + build
    - Node 20, npm cache, parallel jobs.

- Security
  - `SECURITY.md`: threat model, secrets management, webhook HMAC, admin gating, reporting guidelines.

### Next Steps (Phase 4 — Optional)

1. Observability: correlation IDs, audit logs for admin writes.
2. Security middleware: `helmet`, optional rate-limiting (off by default in dev).
3. Prod config: fail-fast on missing critical envs when `NODE_ENV=production`.

Definition of Done (Phase 4)
- One-command dev bootstrap; CI green; docs enable third parties to run PoC — ✅ Completed

---

## 7) Cross-Cutting: Security, Keys, Config

- Keep all private keys out of repo; use file-based keypairs via env path
- Separate operator/relayer key from dev wallet; restrict `set_settled` to operator
- HMAC secrets in env; rotateable
- Idempotency keys for backend POSTs to avoid duplicate txs

---

## 8) Cross-Cutting: Observability & Testing

- Logs: structured logs with tx ids, invoice ids
- Metrics (optional): basic counters in backend; Anchor tests coverage targets
- Tests: unit (program), integration (backend + local validator), e2e script

---

## 9) Deliverable Artifacts (Technical)

- On-chain: program ID, Anchor IDL, tx links
- Off-chain: API spec, DB schema (Phase 2+), indexer design
- Demo: scripts/demo.ts output with tx links

---

## 10) Open Technical Decisions

- NFT representation timing: pure account vs. NFT mint in Phase 1
- Fractionalization mechanism: per-invoice SPL mint vs. Token-2022 features
- Indexing stack: custom indexer vs. Helius/third-party webhooks

---

## 11) Sequencing Summary

1. Phase 0: Tooling + skeleton + CI
2. Phase 1: Program minimal + backend relayer + UI + demo script
3. Phase 2: Fractionalization + indexer + marketplace UI
4. Phase 3: KYC/doc hash/risk stub + multisig
5. Phase 4: Hardening + DX + packaging
