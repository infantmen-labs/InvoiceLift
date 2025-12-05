import React from 'react';
import { Link } from 'react-router-dom';
import Tilt from 'react-parallax-tilt';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { LandingHeader } from '../components/layout/LandingHeader';
import { LandingFooter } from '../components/layout/LandingFooter';

export function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50 overflow-hidden">
      <LandingHeader />
      <main className="flex-1 border-t border-slate-800 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 space-y-12">
          {/* Hero / intro */}
          <section className="space-y-4">
            <p className="inline-flex items-center rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-purple-200">
              Demo guide 
              <span className="ml-2 text-slate-300 normal-case">Mint → Fund → Trade → Settle</span>
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">
              How to use the InvoiceLift demo
            </h1>
            <p className="max-w-2xl text-sm md:text-base text-slate-300">
              This page walks you through the devnet proof-of-concept: mint an invoice, fund it with USDC, trade invoice
              shares, and understand how settlement works — all using the built-in app screens.
            </p>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link
                to="/try-demo"
                className="inline-flex items-center rounded-lg border border-brand/60 bg-brand px-4 py-2 font-medium text-white shadow-sm hover:bg-brand-dark"
              >
                <span>Back to demo landing</span>
              </Link>
              <Link
                to="/mint"
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-medium text-slate-200 hover:border-slate-500"
              >
                <span>Jump to Mint Invoice</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* Step-by-step guide */}
          <section className="space-y-8">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Before you start</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-300 list-disc list-inside">
                <li>Connect a devnet wallet (e.g. Phantom) using the wallet button in the sidebar.</li>
                <li>
                  Make sure you have a little devnet SOL for fees and devnet USDC (the app includes a faucet on the
                  Fund page if needed).
                </li>
                <li>The demo runs fully on devnet — nothing here is real money or production credit risk.</li>
                <li>
                  If a page looks empty right after you mint, fund, or trade, wait a few seconds and click
                  <span className="font-medium"> Refresh</span> — the backend indexer may still be syncing from devnet.
                </li>
              </ul>
            </div>

            <Tilt tiltMaxAngleX={10} tiltMaxAngleY={10}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
                <h2 className="text-base font-semibold text-slate-50 flex items-center justify-between">
                  Step 1 — Mint an invoice
                  <Link
                    to="/mint"
                    className="inline-flex items-center text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    Open Mint page
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Create an on-chain invoice that represents a real-world receivable, with amount, due date, and
                  metadata hash pointing to off-chain documents.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-300 list-decimal list-inside">
                  <li>Go to the <span className="font-medium">Mint Invoice</span> page in the left navigation.</li>
                  <li>Fill in <span className="font-medium">Metadata Hash</span>, <span className="font-medium">Amount</span> (USDC, 6 decimals), and <span className="font-medium">Due Date</span>.</li>
                  <li>Click <span className="font-medium">Mint Invoice (Wallet)</span> and approve the transaction.</li>
                  <li>After confirmation, your invoice appears in the <span className="font-medium">Invoices</span> page.</li>
                </ul>
              </div>
            </Tilt>

            <Tilt tiltMaxAngleX={10} tiltMaxAngleY={10}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
                <h2 className="text-base font-semibold text-slate-50 flex items-center justify-between">
                  Step 2 — Initialize shares for the invoice
                  <Link
                    to="/invoices"
                    className="inline-flex items-center text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    Open Invoices
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Turn the invoice into a tokenized asset by creating its <span className="font-medium">shares mint</span>,
                  which represents fractional ownership of the invoice.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-300 list-decimal list-inside">
                  <li>On the <span className="font-medium">Invoices</span> page, open the detail drawer for your invoice.</li>
                  <li>Click <span className="font-medium">Init Shares (Wallet)</span> and approve the transaction.</li>
                  <li>
                    After it confirms, the invoice shows a <span className="font-medium">Shares Mint</span> address — this
                    is the SPL token used for trading positions.
                  </li>
                </ul>
              </div>
            </Tilt>

            <Tilt tiltMaxAngleX={10} tiltMaxAngleY={10}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
                <h2 className="text-base font-semibold text-slate-50 flex items-center justify-between">
                  Step 3 — Fund the invoice and receive shares
                  <Link
                    to="/fund"
                    className="inline-flex items-center text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    Open Fund page
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Provide USDC liquidity into the invoice and receive invoice shares that represent your claim on
                  repayment.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-300 list-decimal list-inside">
                  <li>
                    From the <span className="font-medium">Fund Invoice</span> page or invoice detail drawer, choose an
                    invoice to fund.
                  </li>
                  <li>
                    Enter an <span className="font-medium">Amount</span> of USDC and use the wallet-based flow (e.g.
                    <span className="font-medium">Fund Fraction (Wallet)</span>).
                  </li>
                  <li>Approve the transaction; once confirmed, you will see your position under <span className="font-medium">Portfolio</span>.</li>
                </ul>
              </div>
            </Tilt>

            <Tilt tiltMaxAngleX={10} tiltMaxAngleY={10}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
                <h2 className="text-base font-semibold text-slate-50 flex items-center justify-between">
                  Step 4 — List and trade invoice shares
                  <Link
                    to="/marketplace"
                    className="inline-flex items-center text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    Open Marketplace
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Use the allowance-based marketplace (V2) to list your shares and let other investors buy them using
                  SPL token approvals instead of manual escrow.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-300 list-decimal list-inside">
                  <li>From an invoice detail, create a listing by choosing <span className="font-medium">Price</span> and <span className="font-medium">Quantity</span>.</li>
                  <li>Initialize the listing on-chain with <span className="font-medium">Init On-chain (V2)</span>.</li>
                  <li>Approve shares and — as a buyer — approve USDC using the provided buttons.</li>
                  <li>
                    Use <span className="font-medium">Fill On-chain (V2)</span> to execute the swap; positions update in
                    the <span className="font-medium">Portfolio</span> view.
                  </li>
                </ul>
              </div>
            </Tilt>

            <Tilt tiltMaxAngleX={10} tiltMaxAngleY={10}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
                <h2 className="text-base font-semibold text-slate-50">Step 5 — Understand settlement</h2>
                <p className="mt-2 text-sm text-slate-300">
                  In production, settlement happens when the real-world buyer pays the invoice off-chain. In this PoC, a
                  signed payment webhook calls the backend relayer (admin wallet), which reads the funded amount from
                  chain and executes an admin-only settlement that releases USDC from escrow according to the program
                  rules.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  For a deep dive into settlement and webhooks, see the technical ADR linked below.
                </p>
              </div>
            </Tilt>
          </section>

          {/* Advanced docs */}
          <section className="border-t border-slate-800 pt-8 mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Advanced docs & code</h2>
            <p className="mt-2 text-sm text-slate-300">
              If you want to inspect the on-chain program, backend implementation, or full allowance-based test plan,
              use the links below.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a
                href="https://github.com/Sektorial12/InvoiceLift"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-medium text-slate-200 hover:border-slate-500"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View repo on GitHub
              </a>
              <a
                href="https://github.com/Sektorial12/InvoiceLift/blob/main/docs/adr/System-full-flow.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-medium text-slate-200 hover:border-slate-500"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Read full system flow ADR
              </a>
            </div>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
