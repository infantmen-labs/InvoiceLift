# Security Guidelines

This document outlines the current security posture for the InvoiceLift devnet PoC and recommended practices.

## Threat Model (Devnet PoC)
- Non-custodial user flows; server builds unsigned transactions.
- Admin-only operations are explicitly gated by header `x-admin-wallet` matching `ADMIN_WALLETS`.
- Webhooks must be signed with timestamped HMAC when `ENABLE_HMAC=true`.

## Secrets & Configuration
- Do not commit secrets to the repository. Use environment variables or files referenced by env (e.g., `RELAYER_KEYPAIR_PATH`).
- Required/important envs:
  - `PROGRAM_ID`, `USDC_MINT`
  - `ENABLE_HMAC`, `HMAC_SECRET`
  - `ADMIN_WALLETS`
  - `LISTINGS_REQUIRE_SIG` (default on) and `LISTING_SIG_TOL_SEC`
  - `FAUCET_ENABLED` must remain `false` outside development
- Config preflight logs warnings for missing/misconfigured values at startup (non-breaking).

## Webhooks
- HMAC verification: `hex(hmac_sha256(HMAC_SECRET, ts + '.' + rawBody))`
- Required headers when `ENABLE_HMAC=true`:
  - `x-hmac-timestamp`: epoch ms
  - `x-hmac-signature`: hex HMAC
  - Optional: `x-idempotency-key` to dedupe
- Endpoints:
  - `/webhook/payment` (settlement)
  - `/webhook/kyc` (KYC upsert)

## Admin-Gated Endpoints
- Admin writes require `x-admin-wallet` to match one of `ADMIN_WALLETS`.
- Examples: invoice mint/init-shares/fund-fractional, KYC/doc/score writes.

## Listings Signatures
- By default (`LISTINGS_REQUIRE_SIG!=false`) listings create/fill/cancel require signed messages with timestamp tolerance.

## Optional Controls
- KYC gating (planned): reject listing flows for wallets without `approved` KYC.
- Audit logging (planned): append-only audit trails for admin writes.

## Dependency & Build Security
- Use Node 18 LTS. Docker images are based on Debian slim with build tools for native deps.
- CI runs typecheck/tests on PRs.

## Reporting Issues
- Create a private issue and omit sensitive details. Provide repro steps and commit/PR references.
