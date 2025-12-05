import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDevnetGuard } from '../state/devnetGuard';

export function DevnetHint(){
  const wallet = useWallet();
  const { requireDevnetAck, markDevnetConfirmed } = useDevnetGuard();

  if (!wallet.publicKey) return null;

  if (!requireDevnetAck){
    return (
      <span className="hidden text-[10px] font-medium text-emerald-300 sm:inline">
        Devnet demo
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        markDevnetConfirmed();
      }}
      className="rounded-full border border-amber-400/70 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-500/20"
      title="This demo runs only on Solana devnet. Switch your wallet network to Devnet/Testnet, then click this to continue."
    >
      I'm on devnet
    </button>
  );
}
