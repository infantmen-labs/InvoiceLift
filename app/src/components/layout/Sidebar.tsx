import React from 'react'
import { NavLink } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSignerMode } from '../../state/signerMode'

const navItems = [
  { to: '/invoices', label: 'Invoices' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/mint', label: 'Mint invoice' },
  { to: '/fund', label: 'Fund invoice' },
  { to: '/admin', label: 'Admin' },
]

export function Sidebar(){
  const wallet = useWallet()
  const { mode, isAdmin } = useSignerMode()
  const walletStr = wallet.publicKey?.toBase58() || ''
  const shortWallet = walletStr
    ? walletStr.length <= 10
      ? walletStr
      : `${walletStr.slice(0, 4)}…${walletStr.slice(-4)}`
    : ''

  return (
    <aside className="flex h-full w-56 flex-col border-r border-slate-200 bg-slate-900 text-slate-100">
      <div className="flex h-14 items-center border-b border-slate-800 px-4">
        <div className="text-sm font-semibold tracking-tight">InvoiceLift</div>
      </div>
      <nav className="flex-1 px-2 py-4 text-sm">
        <div className="space-y-1">
          {navItems
            .filter((item) => (item.to === '/admin' ? isAdmin : true))
            .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex items-center rounded-md px-3 py-2 font-medium transition',
                  isActive
                    ? 'bg-brand text-white'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Environment</span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Devnet
          </span>
        </div>
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Wallet</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-slate-200">
              {walletStr ? shortWallet : 'Not connected'}
            </span>
            <span className="whitespace-nowrap rounded-full border border-slate-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
              {mode === 'backend' ? 'Backend' : 'Wallet'}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="mt-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            Admin
          </div>
        )}
      </div>
    </aside>
  )
}
