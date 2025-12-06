# InvoiceLift Whitepaper

## Abstract

Invoice financing is a critical working-capital tool for businesses, but existing solutions are
fragmented, opaque, and slow. Investors must trust centralized platforms with custody of funds
and risk models that are difficult to audit.

InvoiceLift is a devnet-only proof-of-concept (PoC) that explores how **on-chain invoice
financing on Solana** could look. The system lets a seller mint an on-chain invoice account,
lock USDC liquidity into escrow, optionally fractionalize the claim into tokenized shares, trade
those shares in a marketplace, and have an admin relayer settle the invoice when off-chain
payment is confirmed.

This whitepaper describes the problem, the InvoiceLift design, its architecture across Solana,
backend, and frontend, and the key flows implemented in the PoC. It is **not** a production
system or investment product and should be treated solely as a technical exploration.

---

## 1. Problem Overview

### 1.1 Working capital and invoice financing

Businesses often wait 30–90 days to get paid for issued invoices. To smooth cash flow, many
turn to invoice factoring or financing. Today, these solutions typically have:

- **Centralized custody** – A platform holds both customer payments and investor funds.
- **Limited transparency** – Underwriting models and risk assumptions are off-chain and
  difficult to audit.
- **Fractured liquidity** – Each platform runs its own internal marketplace and cap table.
- **Operational friction** – Settlement, reconciliations, and reporting rely on manual
  processes and batch jobs.

### 1.2 Why on-chain?

Public blockchains introduce:

- **Programmable assets** – Invoices and their cash flows can be represented directly as
  on-chain accounts and tokens.
- **Composability** – Once tokenized, positions can be traded, collateralized, or integrated
  into other DeFi systems.
- **Auditability** – Positions, transfers, and key state transitions are transparent and
  verifiable.

However, an end-to-end design must acknowledge that **real-world payments and enforcement
remain off-chain**. A practical system must combine on-chain positions with off-chain oracles
and operational processes.

InvoiceLift explores a minimal architecture for this hybrid world.

---

## 2. Solution Overview

InvoiceLift is a devnet PoC that models the lifecycle of a financed invoice on Solana:

1. **Mint invoice** – A seller mints an on-chain invoice account with amount, due date,
   and metadata hash (e.g. IPFS CID or document store).
2. **Create escrow** – A USDC escrow account is created for that invoice.
3. **Initialize shares** – The seller can initialize a **per-invoice shares mint** and mint
   shares that represent fractional claims on the invoice cash flows.
4. **Fund invoice** – Investors fund the invoice by sending USDC into escrow or buying
   shares, with amounts tracked in base units (6 decimals) on-chain.
5. **Trade shares** – A marketplace V2 design uses **allowance-based trading** (SPL delegates)
   instead of moving tokens into escrow PDAs, keeping custody in investor wallets while enabling
   off-chain orderbooks.
6. **Settle invoice** – An **admin relayer** calls a `set_settled` instruction once the
   off-chain payer has settled the invoice. This returns funds and/or updates positions
   according to business logic.

The current implementation is intentionally constrained:

- Runs **only on Solana devnet**.
- Uses a small, curated set of instructions.
- Exposes a thin backend API for indexed reads and relayer-style writes.
- Ships a focused frontend that demonstrates the flows in a guided, devnet-only UX.

---

## 3. Architecture

### 3.1 High-level components

The system has three main components:

- **Solana Program (Anchor)**  
  - Defines the invoice, escrow, and marketplace accounts and instructions.
  - Is deployed to devnet under a fixed program ID:
    - `F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm`
  - Uses USDC devnet mint:
    - `5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT`

- **Backend (Express + SQLite + Anchor)**  
  - Provides REST endpoints for invoices, portfolio, listings, faucet, and settlement.
  - Runs an indexer that watches on-chain state and mirrors invoices into SQLite.
  - Acts as an admin relayer for settlement and certain admin-only tasks.

- **Frontend (Vite + React)**  
  - Provides a devnet-only demo UI for minting, funding, trading, and monitoring invoices.
  - Integrates with Solana wallet adapters (e.g. Phantom) and the backend REST API.
  - Implements guardrails (devnet check, faucet, copyable invoice IDs) to smooth the demo.

### 3.2 On-chain data model (simplified)

Key accounts in the Anchor program include:

- **Invoice account**
  - `amount`: total invoice amount (USDC base units, 6 decimals).
  - `funded_amount`: amount funded so far.
  - `status`: Open / Funded / Settled / Cancelled.
  - `seller`: public key of the invoice owner.
  - `investor`: optional, for pre-fractional flows.
  - `shares_mint`: public key of the SPL mint for invoice shares (or default 111... if unset).
  - Additional metadata (due date, metadata hash, etc.).

- **Escrow account**
  - Holds USDC for a given invoice.

- **Shares mint**
  - SPL mint representing fractionalized positions in the invoice.

- **Marketplace PDAs / listings**
  - Track orders for buying/selling invoice shares.
  - In V2, rely on **allowance-based** design where investors approve a delegate to move
    a bounded amount of tokens on their behalf.

### 3.3 Backend responsibilities

The backend service performs several roles:

- **Indexing & caching**
  - Streams invoice accounts and writes them into a SQLite database.
  - Computes global invoice statistics (count, total amount, total funded, average funded%).
  - Provides a cached view of per-invoice positions derived from SPL token balances.

- **Admin relayer**
  - Exposes endpoints for admin-only operations such as settlement, guarded by wallet-based
    allowlists and secrets.
  - Validates configuration at startup (program ID, cluster, mints).

- **REST API** (indicative examples)
  - `GET /api/invoices` – List invoices with pagination and global stats.
  - `GET /api/invoices/:id` – Get full invoice details + on-chain positions.
  - `GET /api/portfolio/:wallet` – Aggregate holdings for a given wallet.
  - `GET /api/listings/open` – Return open marketplace listings.
  - `POST /api/faucet/usdc` – Mint devnet USDC to a wallet (for demo only).

### 3.4 Frontend responsibilities

The React frontend:

- Connects to Solana devnet via wallet adapters.
- Calls the backend API for invoices, portfolios, and listings.
- Builds and sends on-chain transactions for minting, funding, and trading.
- Guides the user through a scripted devnet demo flow.

Key pages include:

- **Landing page** – High-level narrative and call to action.
- **Invoices** – Global invoice list, per-invoice detail panel, stats, and actions.
- **Mint Invoice** – Form for minting new invoices with automatic redirect to details.
- **Fund Invoice** – Funding form with USDC faucet and unit-safe inputs.
- **Marketplace** – View and interact with share listings.
- **Portfolio** – See per-wallet invoice share positions with deep links to invoice details.

---

## 4. User Flows

This section describes how the PoC behaves from a user perspective.

### 4.1 Devnet-only guardrails

Because the PoC is devnet-only, the frontend includes a **devnet guard**:

- Detects when the connected wallet is on mainnet or an unsupported cluster.
- Highlights a banner and inline hints instructing the user to switch to Devnet.
- Blocks on-chain actions (mint, fund, trade) until the user has both:
  - Switched their wallet to Devnet.
  - Acknowledged the devnet disclaimer in the UI.

The app also exposes a **USDC faucet**:

- `Request devnet USDC` button on the Fund page calls the backend faucet endpoint.
- Default mint amount is **100 USDC** (`100_000_000` base units, 6 decimals).
- A toast surfaces the amount and links to the transaction on a Solana explorer.

### 4.2 Seller flow: mint and fractionalize an invoice

1. **Mint invoice**
   - The seller navigates to **Mint Invoice**.
   - They provide human-readable fields:
     - Amount (e.g. `5.0` USDC, converted internally to `5_000_000` base units).
     - Due date.
     - Metadata hash (e.g. an IPFS CID or test tag).
   - They click **Mint invoice (Wallet)** and sign a transaction.
   - On success, the app automatically redirects to `/invoice/<INVOICE_PUBKEY>` where the
     new invoice is displayed in detail.

2. **Initialize shares**
   - From the invoice details view, the seller can initialize a per-invoice shares mint.
   - The **Init shares (Wallet)** button is only enabled if the connected wallet matches the
     invoice `seller`.
   - On confirmation, the program creates the SPL mint, and the invoice account is updated
     to reference it.

3. **Fund fractionally (seller as first investor)**
   - The seller can fund their own invoice fractionally, receiving shares.
   - They input a human-readable USDC amount (e.g. `5.0`), which is converted to base units.
   - The transaction both moves USDC into escrow and mints shares to the seller.

### 4.3 Investor flow: acquire and trade invoice shares

1. **Discover opportunities**
   - Investors browse the **Invoices** page, which displays global statistics:
     - Total number of invoices.
     - Global sum of invoice amounts.
     - Global sum of funded amounts.
     - Average funded percentage.
   - Alternatively, they browse the **Marketplace** page for current listings.

2. **Acquire exposure**
   - Investors can acquire shares either by funding the invoice (in supported flows) or by
     buying listed shares on the marketplace.
   - The allowance-based V2 marketplace flow has the investor approve a limited amount of
     USDC or shares via SPL token delegates, enabling off-chain order matching while keeping
     custody in their wallet.

3. **View portfolio**
   - The **Portfolio** page aggregates all invoice share holdings for the connected wallet.
   - Each position includes a clickable invoice ID that deep-links back to the invoice details
     page, where positions and status are shown in more detail.

### 4.4 Admin flow: settlement via webhook

Invoice settlement is modeled as an **admin-only** operation:

1. Off-chain, the payer settles the real-world invoice.
2. The operator (or another system) calls a backend webhook with proof/metadata.
3. The backend relayer validates the request and then submits an on-chain `set_settled`
   instruction.
4. The invoice account status is updated to Settled, and any remaining balances are reconciled
   according to the program logic.

This design intentionally keeps business-specific settlement rules off-chain for the PoC,
while ensuring that the **final settlement state is always reflected on-chain**.

---

## 5. UX and Safety Considerations

Although the PoC is not a production deployment, several UX and safety choices are made to
make the demo predictable and educational:

- **Seller-only share initialization** – Prevents arbitrary wallets from fractionalizing other
  users' invoices.
- **Unit-safe funding inputs** – All amounts in the UI are human-readable (e.g. `5.0`) and
  converted to 6-decimal base units under the hood, avoiding confusion such as displaying
  `0.000005 USDC` after a `5` USDC input.
- **Copyable invoice IDs** – Invoice public keys are copyable from the invoice detail view,
  making it easy to share or debug specific invoices.
- **Global stats bar** – The Invoices page surfaces global statistics so users understand the
  scale and distribution of invoices beyond the current table page.
- **Devnet-only faucet** – The faucet is explicitly labeled as devnet-only and gated by
  environment flags on the backend.

---

## 6. Limitations and Risks

InvoiceLift is intentionally limited:

- **Devnet only** – The PoC runs solely on Solana devnet. Mints and program IDs are for
  testing and may be reset.
- **No KYC/KYB or legal enforcement** – Real-world identity, onboarding, and enforcement are
  out of scope.
- **Centralized admin relayer** – Settlement relies on a trusted operator to call
  `set_settled`. In a production system, this would need stronger governance and auditing.
- **Oracle and data quality** – Off-chain payment confirmations are assumed to be correct.
  Robust oracles and reconciliation logic are not implemented.
- **Smart contract risk** – As with any on-chain program, bugs may exist. The PoC has not
  undergone formal audits.

This whitepaper does not constitute investment advice, an offer, or a solicitation. It is a
technical description of an experimental prototype.

---

## 7. Roadmap and Future Directions

Several directions could evolve InvoiceLift from a PoC toward a more complete system:

1. **Identity and compliance**
   - Integrate KYC/KYB onboarding and link invoices to verified entities.
   - Encode jurisdiction-specific constraints and factor eligibility rules.

2. **Risk and pricing models**
   - Attach on-chain credit scores or risk parameters to invoices and issuers.
   - Support dynamic pricing curves and secondary market discovery.

3. **Governance and settlement**
   - Replace the centralized admin relayer with a governed multisig or DAO process.
   - Implement transparent criteria and appeals for settlement decisions.

4. **Advanced marketplaces**
   - Support orderbooks, auctions, or AMM-style pools for invoice shares.
   - Allow composability with other DeFi protocols (lending, collateral, vaults).

5. **Real-world deployments**
   - Run pilots with real businesses and carefully scoped invoice portfolios.
   - Integrate payment providers and bank rails for robust off-chain settlement.

---

## 8. References and Links

- **Program ID (devnet):**  
  `F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm`

- **USDC Mint (devnet test):**  
  `5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT`

- **Repository:**  
  https://github.com/infantmen-labs/InvoiceLift

- **Demo frontend:**  
  Hosted via Vercel (link provided in hackathon submission).

- **Backend API:**  
  Hosted via Render (link provided in hackathon submission).

InvoiceLift is an experiment in making invoice financing more transparent, programmable, and
composable. While this PoC is limited to devnet and a narrow scope, it outlines a path toward
on-chain, verifiable representations of real-world receivables.
