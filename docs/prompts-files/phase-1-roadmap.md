# InvoiceLift — Hackathon Roadmap & Reference Repo Skeleton

> Purpose: a concise, pre-launch roadmap plus a reference repository skeleton (files + minimal content) you can clone and use to produce the Proof-of-Work the Hackathon reviewers want.

---

## Quick orientation

* **Project**: InvoiceLift — Solana-based invoice-financing marketplace (devnet PoC → mainnet rollup).
* **Hackathon goal**: produce an end-to-end devnet demo (mint → fund → settle) + public repo, demo video, and docs that demonstrate technical feasibility and a compliance path.
* **Deliverables for hackathon**: repo + demo script + 2–3 min video + tx links + technical spec + security plan + weekly public updates.

---

# Hackathon Roadmap (phase-based — *do not specify dates in the hackathon*)

> Each phase lists *deliverables* you will attach to the hackathon application or produce as Proof-of-Work.

### Phase 0 — Prep & Proposal Package (Proposal submission artifact)

**Objectives:** Make the proposal crisp, show ability to deliver.
**Deliverables:**

* Short elevator pitch & 1‑paragraph problem statement.
* 3–4 milestones mapped to budget (Phase 1–4 deliverables with scope).
* Demo plan: end-to-end Devnet demo (mint → fund → simulate payment → settle).
* PoW links: previous projects, GitHub handle, sample commits.
* Estimated budget & resource split (see hackathon guidance).

**Why this matters:** Hackathon reviewers triage proposals quickly — clarity, PoW, and a realistic milestone plan win.

---

### Phase 1 — E2E Devnet Prototype (Core PoW)

**Objectives:** Prove the core flow works on Solana devnet.
**Deliverables:**

* Anchor program: `InvoiceManager` (mint invoice NFT, escrow USDC, setSettled)
* Backend relayer: webhook endpoint to accept off-chain payment proof and call `setSettled` (sanity checks + auth)
* Frontend: minimal UI for seller (mint) and investor (buy/fund)
* Demo script & 2–3 min video with TX links
* Repo with `README` + quickstart

**Minimum acceptance criteria (PoW):** One invoice minted, investor funds via USDC, simulated buyer payment triggers settlement, funds released to seller — all on devnet with TX links.

---

### Phase 2 — Marketplace & Fractionalization

**Objectives:** Add liquidity features and fractional purchases.
**Deliverables:**

* Fractionalization pattern (split NFT → fungible shares) or fungible wrapper token per invoice
* Secondary transfer marketplace (peer transfer + simple orderbook or listings)
* Indexer to show invoice marketplace state (backend job + Postgres)
* Automated unit tests for key flows

**Reviewer wins:** Shows composability and liquidity — key Finternet primitives.

---

### Phase 3 — Compliance & Trust

**Objectives:** Demonstrate practical KYC/AML, invoice verification & risk labeling.
**Deliverables:**

* KYC sandbox integration (Persona/Onfido/Sumsub) proof-of-sandbox flow
* Document hashing+storage pattern (IPFS/Arweave link + doc hash on-chain)
* Simple credit-scoring oracle (mocked rules + external data feed)
* Threat model + security checklist

**Reviewer wins:** Shows you understand real-world legal & fraud vectors.

---

### Phase 4 — Polished Submission & Community

**Objectives:** Open-source, docs, community onboarding.
**Deliverables:**

* Publish code under MIT/Apache-2.0
* Full technical spec (architecture, token model, governance path)
* Community update cadence (public issue tracker / weekly Discord or GitHub updates)
* Final demo + instructions for partners to run the PoC

**Reviewer wins:** Openness + sustainability.

---

# Pre-Grant Metrics & Signals for Reviewers

List at least 3 measurable signals you'll include in updates and the grant packet:

1. `N_invoices_minted_devnet` (target: ≥ 5 sample invoices with tx links)
2. `N_investor_funds_tx` (target: ≥ 5 funding txs)
3. Demo views / GitHub stars (show interest)
4. Security tests (unit coverage %, basic integration tests passing)

Include these numbers in your weekly community updates.

---

# Risks & Mitigations (summary to include in grant app)

* **Off-chain fraud (fake invoices):** Document hashing + KYC + optional escrow dispute period.
* **Escrow operator compromise:** Use multisig for settlement or threshold signatures; require signed webhook tokens.
* **Regulatory risk:** Use sandbox KYC, avoid offering lending-as-product in early PoC, emphasize proof-of-technology and compliance roadmap.
* **Liquidity risk:** Start with curated/underwritten invoices for demo; plan market-makers later.

---

# Reference Repo Skeleton

Below is a recommended repo layout. Fill in files with the provided starter snippets.

```
invoicex/
├─ README.md
├─ LICENSE
├─ anchor.toml
├─ Cargo.toml
├─ programs/
│  └─ invoice_manager/
│     ├─ Cargo.toml
│     └─ src/
│        └─ lib.rs
├─ backend/
│  ├─ package.json
│  ├─ src/
│  │  ├─ index.ts         # express + webhook endpoints
│  │  ├─ relayer.ts       # helper to call Anchor program
│  │  └─ indexer.ts       # optional: scans txs to populate Postgres
│  └─ prisma/             # or migrations for Postgres
├─ app/
│  ├─ package.json
│  ├─ src/
│  │  ├─ App.tsx
│  │  └─ pages/
│  │     ├─ MintInvoice.tsx
│  │     └─ FundInvoice.tsx
├─ scripts/
│  ├─ demo.ts             # CLI script to run mint->fund->settle
│  └─ deploy.sh
├─ tests/
│  ├─ anchor_tests.rs
│  └─ backend_tests.ts
├─ .github/
│  └─ workflows/ci.yml
└─ docs/
   ├─ TECHNICAL_SPEC.md
   ├─ SECURITY.md
   └─ GRANT_PROPOSAL.md
```

---

## Starter file contents

### `programs/invoice_manager/src/lib.rs` (minimal Anchor program)

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWFK...replace_with_devnet_id");

#[program]
pub mod invoice_manager {
    use super::*;
    pub fn mint_invoice(ctx: Context<MintInvoice>, metadata_hash: String, amount: u64, due_date: i64) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        invoice.seller = *ctx.accounts.seller.key;
        invoice.amount = amount;
        invoice.metadata_hash = metadata_hash;
        invoice.due_date = due_date;
        invoice.status = InvoiceStatus::Open;
        Ok(())
    }

    pub fn set_settled(ctx: Context<SetSettled>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        invoice.status = InvoiceStatus::Settled;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintInvoice<'info> {
    #[account(init, payer = seller, space = 8 + 200)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetSettled<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub operator: Signer<'info>, // later: require multisig / verified relayer
}

#[account]
pub struct Invoice {
    pub seller: Pubkey,
    pub amount: u64,
    pub metadata_hash: String,
    pub due_date: i64,
    pub status: InvoiceStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum InvoiceStatus {
    Open,
    Funded,
    Settled,
}
```

> Note: This is a starting point — you will expand to include escrow accounts, USDC token transfers, and PDAs for escrow authority.

---

### `backend/src/index.ts` (minimal Express webhook + relayer)

```ts
import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

app.post('/webhook/payment', async (req, res) => {
  // verify webhook signature from accounting provider (HMAC)
  const { invoice_id, paid_amount, proof_url } = req.body;
  // TODO: validate, check amounts, call Anchor client to set_settled
  // use @project-serum/anchor or solana/web3
  res.status(200).json({ ok: true });
});

app.listen(8080, () => console.log('Backend listening on 8080'));
```

---

### `app/src/pages/MintInvoice.tsx` (React + wallet-adapter stub)

```tsx
import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export function MintInvoice(){
  const { publicKey, sendTransaction } = useWallet();
  async function handleMint(e){
    e.preventDefault();
    // call backend endpoint that crafts and sends transaction or uses Anchor client in frontend
    alert('minting (demo stub)');
  }
  return (
    <form onSubmit={handleMint}>
      <input name="buyer" placeholder="Buyer ID" />
      <input name="amount" placeholder="Amount" />
      <button type="submit">Mint Invoice</button>
    </form>
  );
}
```

---

### `scripts/demo.ts` (TypeScript demo flow)

```ts
// pseudocode CLI: mint -> fund -> simulate webhook -> settle
// usage: ts-node scripts/demo.ts
import { execSync } from 'child_process';

async function main(){
  console.log('1) Minting sample invoice...');
  // call backend endpoint to mint and return invoice_id and tx link
  console.log('tx: https://explorer.solana.com/tx/<devnet_tx_id>?cluster=devnet');

  console.log('2) Simulating investor funding via USDC transfer...');
  console.log('tx: https://explorer.solana.com/tx/<devnet_tx_id2>?cluster=devnet');

  console.log('3) Simulate buyer payment webhook → settlement');
  // call webhook locally or post to deployed backend endpoint
  console.log('tx: https://explorer.solana.com/tx/<devnet_tx_id3>?cluster=devnet');
}

main();
```

---

## Quickstart — How to run the devnet PoC (for README)

1. Install Solana CLI, Anchor, Node.js (LTS), Rust toolchain
2. `solana config set --url https://api.devnet.solana.com`
3. Start local Anchor tests: `anchor test` (or deploy program: `anchor deploy`)
4. Start backend: `cd backend && npm install && npm run dev`
5. Start frontend: `cd app && npm install && npm run dev`
6. Run demo script: `ts-node scripts/demo.ts` and paste TX links into grant packet

---

## Grant Proposal Attachments Checklist (copy into grant form)

* repo: github.com/<your-handle>/invoicex (public)
* demo video: YouTube or mp4 (2–3 min) with tx links in description
* PoW: sample commits + past project links
* Technical spec: `docs/TECHNICAL_SPEC.md`
* Security & compliance doc: `docs/SECURITY.md`
* Weekly update plan: link to issues or public thread

---

## Next recommended immediate actions (first 48 hours)

1. Create repo & push skeleton (use `git init` + push to GitHub)
2. Implement minimal Anchor program `mint_invoice` + `set_settled` (copy starter lib.rs)
3. Implement backend webhook and demo script (quick script that calls your backend)
4. Record a short screen-capture video showing the devnet flow; add tx links to the repo README
5. Draft the grant application text in `docs/GRANT_PROPOSAL.md` (copy elevator pitch + milestones)

---

## Template grant blurb (short — copy/paste)

**Title:** InvoiceX — a Finternet-native invoice financing marketplace (devnet PoC)

**Elevator pitch:** InvoiceX tokenizes invoices on Solana and connects small businesses to a global pool of investors. Sellers mint verified invoice tokens; investors fund invoices using USDC escrow; once payment is verified the system releases funds and updates on-chain state. The PoC demonstrates mint → fund → settle flows and a clear compliance path.

**Milestones requested:** Phase 1 (E2E Devnet PoC) + Phase 2 (marketplace + fractionalization). See attached milestone PDF for deliverables and budget.

---

### License

Use `MIT` or `Apache-2.0`.

---

If you want, I can now:

* create the GitHub repo with these files (generate file contents for you to paste), or
* generate the full `lib.rs`, `index.ts`, and `App.tsx` files with more complete code (not stubs), or
* draft the grant application text from `docs/GRANT_PROPOSAL.md` ready to paste.

Tell me which and I’ll produce the files next.
