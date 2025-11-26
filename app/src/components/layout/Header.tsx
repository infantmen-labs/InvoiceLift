import { useState }  from 'react'
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

  type toggleMenu = {
    flipToggle: ()=> void;
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
    <div className="lg:flex hidden items-center gap-2 text-xs text-slate-600 ">
      <span className="uppercase tracking-wide text-[10px] text-[#F0F5F9]">Signer</span>
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
        <span className="text-slate-400">Wallet</span>
      )}
    </div>
  )
}

export function Header({ flipToggle }: toggleMenu){
  const title = usePageTitle()

  return (
    <header className="border-b border-slate-200 bg-gradient-to-r from-[#022358] to-[#0B172A] ">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex justify-center item-center ml-5">
          <div className='flex flex-col justify-center item-center mr-6 ml-2 lg:hidden z-20'>
            {/* Hamburger Menu */}
            <label className="hamburger" >
              <input onClick={flipToggle} type="checkbox" className='cursor-pointer' />
              <svg viewBox="0 0 32 32">
                <path className="line line-top-bottom" d="M27 10 13 10C10.8 10 9 8.2 9 6 9 3.5 10.8 2 13 2 15.2 2 17 3.8 17 6L17 26C17 28.2 18.8 30 21 30 23.2 30 25 28.2 25 26 25 23.8 23.2 22 21 22L7 22"></path>
                <path className="line" d="M7 16 27 16"></path>
              </svg>
            </label>
          </div>
          <div className='hidden  w-[110px] sm:flex flex-col gap-0.5 lg:ml-5'>
            <div className="text-sm font-cursive font-bold uppercase tracking-wide text-[#F0F5F9]  border-b-2 border-[#8437EB]">InvoiceLift</div>
            <h1 className="text-sm mt-[-4px] font-semibold text-[#8437EB] font-mono whitespace-nowrap animate-pulse"><span className='ml-[30px]'>{title}</span></h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className='flex items-center gap-3 mr-[-20px]'>
            <Link
              to="/mint"
              className="hidden lg:inline-flex items-center"
            >
              <button className='button animate-UpDown'>Mint invoice</button>
            </Link>
            <SignerToggle />
          </div>
          <div className="">
            <WalletMultiButton>
              <button className="btn">
                <div className='flex gap-2'>
                  <div className='hidden sm:block'>Select</div> 
                  <div className=''>Wallet</div>
                </div> 
              </button>
            </WalletMultiButton>
          </div>
        </div>
      </div>
    </header>
  )
}
