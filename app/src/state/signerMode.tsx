import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

export type SignerMode = 'backend' | 'wallet'

type Ctx = {
  mode: SignerMode
  setMode: (m: SignerMode) => void
  isAdmin: boolean
  adminWallet: string | null
}

const SignerModeContext = createContext<Ctx | null>(null)

export function SignerModeProvider({ children }: { children: React.ReactNode }){
  const [mode, setMode] = useState<SignerMode>('backend')
  const wallet = useWallet()
  const adminList = useMemo(() => {
    const raw = (import.meta as any).env.VITE_ADMIN_WALLETS || ''
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
  }, [])
  const isAdmin = !!(wallet.publicKey && adminList.includes(wallet.publicKey.toBase58()))
  const adminWallet = isAdmin && wallet.publicKey ? wallet.publicKey.toBase58() : null

  // Default to Wallet if a wallet is connected and user hasn't switched yet
  useEffect(() => {
    if (wallet.publicKey && mode === 'backend') {
      setMode('wallet')
    }
  }, [wallet.publicKey])

  // Enforce wallet mode for non-admins
  useEffect(() => {
    if (!isAdmin && mode !== 'wallet') {
      setMode('wallet')
    }
  }, [isAdmin])

  return (
    <SignerModeContext.Provider value={{ mode, setMode, isAdmin, adminWallet }}>
      {children}
    </SignerModeContext.Provider>
  )
}

export function useSignerMode(){
  const ctx = useContext(SignerModeContext)
  if (!ctx) throw new Error('useSignerMode must be used within SignerModeProvider')
  return ctx
}
