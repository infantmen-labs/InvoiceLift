import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export type DevnetGuardContextValue = {
  requireDevnetAck: boolean;
  devnetConfirmed: boolean;
  markDevnetConfirmed: () => void;
};

const DevnetGuardContext = createContext<DevnetGuardContextValue | null>(null);

export function DevnetGuardProvider({ children }: { children: React.ReactNode }){
  const wallet = useWallet();
  const [devnetConfirmed, setDevnetConfirmed] = useState(false);

  useEffect(() => {
    if (!wallet.publicKey){
      setDevnetConfirmed(false);
      return;
    }
    setDevnetConfirmed(false);
  }, [wallet.publicKey?.toBase58()]);

  const requireDevnetAck = !!wallet.publicKey && !devnetConfirmed;

  return (
    <DevnetGuardContext.Provider
      value={{
        requireDevnetAck,
        devnetConfirmed,
        markDevnetConfirmed: () => setDevnetConfirmed(true),
      }}
    >
      {children}
    </DevnetGuardContext.Provider>
  );
}

export function useDevnetGuard(){
  const ctx = useContext(DevnetGuardContext);
  if (!ctx) throw new Error('useDevnetGuard must be used within DevnetGuardProvider');
  return ctx;
}
