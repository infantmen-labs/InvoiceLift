import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useSignerMode } from '../../state/signerMode'

const TITLE_MAP: Record<string, string> = {
  '/': 'Invoices',
  '/invoices': 'Invoices',
  '/marketplace': 'Marketplace',
  '/portfolio': 'Portfolio',
  '/mint': 'Mint invoice',
  '/fund': 'Fund invoice',
  '/admin': 'Admin',
}

function usePageTitle(){
  const { pathname } = useLocation()
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname]
  // Fallback: best-effort match by segment
  const base = pathname.split('?')[0]
  if (TITLE_MAP[base]) return TITLE_MAP[base]
  return 'Invoices'
}

function SignerToggle(){
  const { mode, setMode, isAdmin } = useSignerMode()
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className="uppercase tracking-wide text-[10px] text-slate-500">Signer</span>
      {isAdmin ? (
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        >
          <option value="backend">Backend</option>
          <option value="wallet">Wallet</option>
        </select>
      ) : (
        <span className="text-slate-800">Wallet</span>
      )}
    </div>
  )
}

export function Header(){
  const title = usePageTitle()
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">InvoiceLift</div>
          <h1 className="text-sm font-semibold text-slate-900">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/mint"
            className="hidden md:inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200"
          >
            Mint invoice
          </Link>
          <SignerToggle />
          <div className="ml-1">
            <WalletMultiButton className="!h-9 !rounded-lg !bg-brand !px-3 !text-xs !font-medium !text-white hover:!bg-brand-dark" />
          </div>
        </div>
      </div>
    </header>
  )
}
