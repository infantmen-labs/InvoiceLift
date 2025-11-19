import React from 'react'
import { Link } from 'react-router-dom'
import { LandingHeader } from '../components/layout/LandingHeader'
import { LandingFooter } from '../components/layout/LandingFooter'

export function Landing(){
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <LandingHeader />
      <main className="flex-1">
        <section className="border-b border-slate-800 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
          <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16 md:flex-row md:items-center">
            <div className="flex-1 space-y-5">
              <p className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-200">
                Devnet PoC · Invoice Financing on Solana
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                Unlock liquidity from your invoices.
              </h1>
              <p className="max-w-xl text-sm text-slate-300">
                InvoiceLift lets you mint invoices on Solana, fund them with USDC, and trade fractional positions in a
                marketplace secured by on-chain rules and an admin-controlled settlement flow.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link
                  to="/invoices"
                  className="inline-flex items-center rounded-lg border border-brand/60 bg-brand px-4 py-2 font-medium text-white shadow-sm hover:bg-brand-dark"
                >
                  Launch App
                </Link>
                <a
                  href="https://github.com/Sektorial12/InvoiceLift"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-medium text-slate-200 hover:border-slate-500"
                >
                  View Docs & Code
                </a>
              </div>
            </div>
            <div className="mt-6 flex-1 md:mt-0">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">What you can do</div>
                <dl className="mt-3 space-y-2 text-xs text-slate-200">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="font-medium text-slate-100">Mint</dt>
                    <dd className="max-w-xs text-right text-slate-300">
                      Tokenize real-world invoices as on-chain accounts with USDC escrow.
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="font-medium text-slate-100">Fund</dt>
                    <dd className="max-w-xs text-right text-slate-300">
                      Provide USDC liquidity to invoices and earn proportional payout on settlement.
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="font-medium text-slate-100">Trade</dt>
                    <dd className="max-w-xs text-right text-slate-300">
                      Buy and sell invoice shares via the allowance-based marketplace (V2).
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-800 bg-slate-950">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Core flows</h2>
            <p className="mt-1 text-sm text-slate-300">
              Navigate into the app to explore each part of the system.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Link
                to="/mint"
                className="group flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm hover:border-brand"
              >
                <h3 className="font-semibold text-slate-50">Mint invoices</h3>
                <p className="mt-2 text-[13px] text-slate-300">
                  Create on-chain invoices with USDC escrow and metadata hashes that represent off-chain documents.
                </p>
                <span className="mt-3 text-[11px] font-medium text-brand group-hover:text-brand-dark">
                  Go to Mint →
                </span>
              </Link>
              <Link
                to="/fund"
                className="group flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm hover:border-brand"
              >
                <h3 className="font-semibold text-slate-50">Fund invoices</h3>
                <p className="mt-2 text-[13px] text-slate-300">
                  Use the backend relayer or your own wallet to fund invoice escrows on devnet.
                </p>
                <span className="mt-3 text-[11px] font-medium text-brand group-hover:text-brand-dark">
                  Go to Fund →
                </span>
              </Link>
              <Link
                to="/marketplace"
                className="group flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm hover:border-brand"
              >
                <h3 className="font-semibold text-slate-50">Trade shares</h3>
                <p className="mt-2 text-[13px] text-slate-300">
                  List, approve, and fill invoice share trades using the allowance-based marketplace.
                </p>
                <span className="mt-3 text-[11px] font-medium text-brand group-hover:text-brand-dark">
                  Go to Marketplace →
                </span>
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-slate-950">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">How it works</h2>
            <ol className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-3">
              <li className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</div>
                <div className="mt-1 font-medium text-slate-50">Mint</div>
                <p className="mt-2 text-[13px] text-slate-300">
                  A seller mints an invoice on Solana with amount, due date, seller wallet and a metadata hash that
                  points to off-chain documents. The program creates an on-chain invoice account and a dedicated USDC
                  escrow address that all later funding and trading flows reference.
                </p>
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</div>
                <div className="mt-1 font-medium text-slate-50">Fund & trade</div>
                <p className="mt-2 text-[13px] text-slate-300">
                  Investors send USDC into the escrow (directly or fractionally) and receive on-chain invoice shares.
                  Those shares can then be listed in the marketplace, where buyers and sellers trade using
                  allowance-based SPL token approvals instead of a custodial order book or manual escrow.
                </p>
              </li>
              <li className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</div>
                <div className="mt-1 font-medium text-slate-50">Admin settlement</div>
                <p className="mt-2 text-[13px] text-slate-300">
                  When the real-world buyer pays off-chain, a signed payment webhook calls into the backend relayer
                  (admin wallet). The relayer reads the funded amount from chain and performs an admin-only
                  on-chain settlement that releases USDC from escrow to the seller according to the program's
                  settlement rules.
                </p>
              </li>
            </ol>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
