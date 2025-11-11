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

## 2) Phase 0 — Environment & Scaffolding

- Install toolchains: Solana CLI, Anchor, Rust, Node LTS, ts-node
- Initialize repo skeleton and package managers (npm/yarn/pnpm)
- Configure basic TS configs, lint, format, pre-commit hooks
- Add .env templates for program ID, cluster URL, USDC mint, relayer keypair path
- GitHub Actions: lint + typecheck + Anchor unit tests

Definition of Done
- `anchor build` and `anchor test` pass locally
- Backend boots with health check; Frontend boots with wallet connect

---

## 3) Phase 1 — E2E Devnet Prototype (Mint → Fund → Settle)

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

## 4) Phase 2 — Marketplace & Fractionalization

Program (Anchor)
- Add fractionalization: per-invoice fungible token mint (SPL) to represent investor shares
- `fund_invoice_fractional(invoice, investor, amount)`
  - Mint proportional shares to investor based on `amount`
  - Deposit USDC to escrow; allow multiple investors; track total_funded
- `transfer_shares` event support (off-chain index will track balances via SPL)
- Optional `list_invoice` / simple escrow-less listing handled off-chain with signatures

Indexer & DB
- Postgres schema: invoices, investors, positions, txs
- Indexer job: subscribe to program events and SPL mint balances; write to DB

Backend
- APIs to list invoices, positions, recent activity
- Simple orderbook/listings (server-signed offers with cancel/fill)

Frontend
- Marketplace list/detail, funding with fraction input, investor portfolio

Quality
- Integration tests: multi-investor funding; share transfer indexing

Definition of Done (Phase 2)
- Multiple investors can fund one invoice; positions visible via indexer APIs
- Basic secondary transfer flow observable in UI and DB

---

## 5) Phase 3 — Verification & Trust (Technical Only)

- KYC Sandbox integration (stub): client onboarding flow to collect KYC tokens; backend verifies webhook; store KYC status off-chain
- Document hashing/storage: compute hash client-side, store on-chain hash; upload file to IPFS/Arweave via gateway; store CID off-chain
- Credit scoring mock service: rules engine using external data API; write risk_label on-chain or off-chain index
- Security hardening
  - Replace single `operator` with multisig (e.g., SPL multisig PDA) or allow-list of relayer keys
  - Strict webhook signature verification and replay protection

Definition of Done (Phase 3)
- KYC stub flows operational in dev; document hash persisted; risk labels surfaced in UI

---

## 6) Phase 4 — Hardening, DX & OSS Packaging (Technical)

- Program: events/docs, account size audits, upgrade path, error codes finalized
- Backend: config validation, typed APIs (zod), robust logging/metrics
- Frontend: polish UX for core flows, error handling, tx status polling
- Docker/devcontainers for all services; Makefile/justfile for common tasks
- Public README quickstart, technical spec in docs/, SECURITY checklist (engineering-only)

Definition of Done (Phase 4)
- One-command dev bootstrap; CI green; docs enable third parties to run PoC

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
