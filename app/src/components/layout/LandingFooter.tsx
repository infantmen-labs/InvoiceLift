import React from 'react'

export function LandingFooter(){
  return (
    <footer className="border-t border-slate-800 bg-slate-950/90">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <span className="font-medium text-slate-400">InvoiceLift</span>{' '}
          <span className="text-slate-600">· Devnet proof of concept</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://github.com/Sektorial12/InvoiceLift"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-300"
          >
            GitHub
          </a>
          <span className="hidden h-1 w-1 rounded-full bg-slate-700 sm:inline-block" />
          <span className="text-slate-600">Not for production use. Devnet only.</span>
        </div>
      </div>
    </footer>
  )
}
