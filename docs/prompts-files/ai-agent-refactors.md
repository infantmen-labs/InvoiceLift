# AI Agent Refactors & Redesigns

This file documents the main refactors and redesign tasks handled by the AI coding agent (Windsurf Cascade / GPT-5.1 High Reasoning) during development of InvoiceLift, for hackathon transparency.

## Backend & Indexer

- **Relayer & IDL loading for cloud deploys**  
  Updated `backend/src/anchor.ts` so Render/Railway can load the relayer keypair and Anchor IDL from environment variables or committed JSON, instead of relying only on local filesystem paths.

- **Configurable indexer sync interval**  
  Refactored `backend/src/indexer.ts` to read `INDEXER_SYNC_MS` from env, allowing the on-chain indexer to run slower or be effectively disabled on hosted RPCs to reduce 429 rate-limit errors.

- **Listings indexer for marketplace consistency**  
  Extended `runIndexer()` to scan on-chain `Listing` accounts and upsert them into the SQLite `listings` table using a new `upsertListingFromChain` helper in `backend/src/db.ts`, so fresh deployments reconstruct marketplace state from chain.

- **Canonical on-chain quantities**  
  Adjusted `upsertListingFromChain` to treat on-chain `remaining_qty` as canonical for both `qty` and `remainingQty`, ensuring consistent listing amounts across different backends pointing at the same program.

- **Positions cache and portfolio endpoint**  
  Optimized `/api/portfolio/:wallet` in `backend/src/index.ts` to use cached positions from the indexer instead of rescanning SPL token accounts per request.

- **Indexer error logging**  
  Added logging around `syncAll()` in `backend/src/indexer.ts` so indexer failures (e.g., private RPC free tier blocking `getProgramAccounts`) are surfaced instead of silently swallowed.

## Marketplace UX & Flows

- **Marketplace layout refinements**  
  Iteratively refined `app/src/pages/Marketplace.tsx` to:
  - Truncate long invoice and seller addresses with tooltips.
  - Add clearer per-row summary text (remaining vs total shares, price).
  - Color-code listing status chips (Open / Filled / Canceled).

- **On-chain V2 listing actions**  
  Wired Marketplace to use the new V2 allowance-based flows (approve/revoke USDC and shares, init V2 listing, fulfill V2) via backend transaction builders, replacing older off-chain fill flows.

- **Unified dropdown behavior for actions**  
  Added a per-row dropdown state (`openItems`) and updated Marketplace so both seller actions and buyer actions expand/collapse consistently from a single click on the listing row, with click-handling inside the panels preventing accidental re-toggles.

## Portfolio Page

- **Hooks-order bug fix**  
  Refactored `app/src/pages/Portfolio.tsx` into a thin `Portfolio` wrapper and a `PortfolioConnected` component, ensuring all hooks are called unconditionally and fixing the "Rendered fewer hooks than expected" crash.

- **Performance-friendly backend usage**  
  Updated the Portfolio page to consume the optimized `/api/portfolio/:wallet` endpoint backed by cached positions instead of triggering heavy scans.

- **Visual restyling for dark theme**  
  Restyled Portfolio holdings cards to match the dark gradient background using semi-transparent slate panels, lighter text, and subtle accent colors instead of stark black blocks.

## Landing & Navigation

- **New Landing page**  
  Implemented `app/src/pages/Landing.tsx` as a marketing-focused entry point with hero content, core flow cards (Mint / Fund / Trade), and a "How it works" section, using framer-motion and parallax tilt for subtle motion.

- **Routing & layout refactor**  
  Updated `app/src/App.tsx` so `/` shows the Landing page without the main app layout, and all other routes are wrapped in `MainLayout` with sidebar/header.

- **Admin nav gating**  
  Updated `Sidebar` and `SignerMode` logic so the Admin link only appears and is accessible for wallets listed in `VITE_ADMIN_WALLETS`.

- **Wallet connect button integration**  
  Simplified the wallet connect button in `Header` to use `WalletMultiButton` with custom styling only, removing hard-coded "Select Wallet" text so the label correctly reflects the connected wallet or short address.

## Waitlist Microsite

- **Waitlist FAQ accordion**  
  Implemented and later refactored the FAQ accordion in `app/src/pages/WaitListFAQ.tsx`:
  - Fixed invalid hook usage inside `map` and removed unnecessary state.
  - Kept framer-motion for smooth expand/collapse while making interaction snappier.

- **Waitlist layout & copy tweaks**  
  Assisted in structuring the WaitList page sections (hero, CTA buttons, features, signup forms, FAQ, about copy) to align with the main product story.

## Invoices & Settlement

- **Fund & settlement flow alignment**  
  Updated `FundInvoice` and docs so settlement is always executed via the backend relayer/webhook path (admin-controlled), removing the older direct-wallet settlement button from the UI.

- **Docs and ADR-style notes**  
  Added/updated sections in `docs/archive/v2-marketplace-test-plan.md` and other docs to reflect the admin-settlement design, webhook usage, and on-chain invariants.

## UX Consistency & Devnet Guardrails

- **Devnet guard + explicit acknowledgement**  
  Introduced a `DevnetGuardProvider`/`useDevnetGuard` hook so all on-chain actions (mint, fund, trade)
  verify that the connected wallet is on devnet/testnet and that the user has explicitly confirmed
  this in the UI. Buttons now show clear, actionable error copy instead of silently failing when
  Phantom is pointed at mainnet.

- **Post-mint redirect to invoice details**  
  Updated `MintInvoice` so that once mint + escrow succeed (wallet or backend signer mode), the
  app automatically navigates to `/invoice/:id`. This removes the manual copy-paste of invoice
  pubkeys and the "search for the new invoice" step.

- **Correct and consistent USDC units**  
  Fixed unit conversion in `FundInvoice` and related flows so all user-facing fields accept
  human-readable USDC amounts (e.g. `5.0`) and convert to 6-decimal base units internally. This
  removed confusing displays such as `0.000005 USDC` after funding `5`.

- **Faucet UX improvements**  
  Increased the devnet USDC faucet default to **100 USDC** and updated the Fund page toast to
  explicitly state the requested amount (parsed from the backend response) together with an
  explorer link to the mint transaction.

- **Seller-only Init Shares (Wallet)**  
  Tightened the fractionalization UX so `Init shares (Wallet)` is only enabled when the connected
  wallet matches the invoice `seller`. Non-sellers see a disabled button plus helper text; the
  handler also enforces this check defensively.

- **Global invoice stats bar**  
  Refactored the Invoices page stats strip to consume backend-computed global totals from
  `/api/invoices` (total invoice count, global sum of amounts and funded amounts, and average
  funded %), instead of recomputing only over the current table page.

- **Better invoice navigation & copyability**  
  Added:
  - A copy-to-clipboard button next to the invoice pubkey in the invoice details summary, with
    success/error toasts.
  - Clickable invoice IDs in the Portfolio page that deep-link to `/invoice/:id`.
  - A clickable `InvoiceLift` heading in the sidebar that routes back to the main landing page.

## Prompting & Tooling Docs

- **Tools documentation**  
  Created `docs/prompts-files/tools-used.md` describing GPT-5.1 (High Reasoning) via Windsurf Cascade as the primary coding/design assistant and v0 as the UI prototyping tool.

- **Prompt-oriented roadmaps**  
  Helped structure `docs/prompts-files/phase-1-roadmap.md`, `development-roadmap.md`, `frontend-ui-roadmap.md`, and related prompt files used to guide further AI-assisted work.

---

This list is not exhaustive of every small change, but captures the major refactors and redesign tasks delegated to the AI agent for the hackathon."}}]}]**}
