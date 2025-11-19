import React from 'react'
import { Link } from 'react-router-dom'

export function LandingHeader(){
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand/20 ring-1 ring-brand/40" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">InvoiceLift</span>
            <span className="text-[11px] text-slate-500">Invoice financing on Solana</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            to="/invoices"
            className="inline-flex items-center rounded-lg border border-brand/60 bg-brand px-3 py-1.5 font-medium text-white shadow-sm hover:bg-brand-dark"
          >
            Launch App
          </Link>
        </div>
      </div>
    </header>
  )
}
