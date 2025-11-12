# ADR: Phase 2B — Fractionalization & Marketplace (MVP)

## Context & Goals
- Enable multiple investors to fund a single invoice in fractions.
- Represent investor positions as an SPL fungible token per invoice ("shares").
- Minimal backend/frontend to display positions and allow fractional funding.
- Preserve existing Phase 1/2 flows and security (HMAC webhook, idempotency).

## Program (Anchor)
### New/Updated Accounts
- Invoice
  - Add `shares_mint: Pubkey`
  - Add `total_funded: u64` (separate from `funded_amount` or replace it)
  - Keep `status: Open/Funded/Settled` and `escrow_bump` as-is
- SPL Mint (per invoice)
  - 6 decimals; supply equals total funded units (1 token unit == 1 USDC base unit)

### Instructions (minimal)
- `init_shares(invoice, payer)`
  - Creates `shares_mint` with `payer` as mint authority OR program as mint authority
  - Store `shares_mint` on `invoice`
- `fund_invoice_fractional(invoice, investor, investor_ata, escrow_token, amount)`
  - CPI SPL Token transfer: USDC `investor_ata` -> `escrow_token`
  - CPI SPL Mint: mint `amount` shares to `investor_shares_ata`
  - Update `invoice.total_funded += amount`
  - Status -> `Funded`
- `set_settled(invoice, operator, escrow_token, seller_ata)`
  - Same as now (escrow -> seller), signed by PDA with `escrow_bump`
  - Does not burn shares in MVP (positions are historical)

### Events
- Emit `FundedFractional { invoice, investor, amount, shares_mint }`
- Reuse existing event(s) for settlement if present

### Security Notes
- Keep transfer checks for USDC mint equality
- Shares mint authority should be program-authority (preferable)
- No redemption path in MVP

## Indexer & DB
### DB Changes
- Add to `invoices` table: `shares_mint TEXT`
- New table `positions` (optional for MVP, can be fully derived from SPL):
  - `id INTEGER PK`, `invoice_pk TEXT`, `wallet TEXT`, `shares TEXT`
- Keep `tx_logs` as-is

### Indexing
- Track `invoices.shares_mint` on-chain updates
- For MVP, positions can be computed on demand via SPL balance RPC
- If needed, periodically index SPL balances for `shares_mint` into `positions`

## Backend API
- `GET /api/invoices` (already exists): include `shares_mint` when present
- `POST /api/invoice/:id/fund-fractional` (server-signed or client-signed)
  - Request: `{ amount: string }`
  - Response: `{ ok, tx }`
- `GET /api/invoice/:id/positions` (optional MVP)
  - Returns wallet -> shares map (derived or indexed)

## Frontend (MVP)
- Invoice detail:
  - If `shares_mint` present, show "Fund fraction" (amount input)
  - Show positions (wallet, shares) if endpoint exists, else link to explorer
- Investor portfolio page (optional MVP): list owned shares by invoice

## Migration
- DB migration: add `shares_mint` column
- Existing invoices remain valid; `init_shares` can be called lazily per invoice

## Definition of Done
- Multiple investors can fund an invoice via `fund_invoice_fractional`
- `shares_mint` recorded on invoice; explorer link shown in UI
- Backend returns positions or provides guidance to derive
- Indexer tolerates presence/absence of `shares_mint`

## Open Questions
- Should shares be redeemable against escrow at settlement time? (Out of MVP scope)
- Pricing model: 1:1 mapping USDC unit to share unit is simplest (no discounting)
- Whether to add per-investor cap or KYC gating before minting shares
