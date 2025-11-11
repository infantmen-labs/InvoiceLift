import React from 'react';
import { MintInvoice } from './pages/MintInvoice';
import { FundInvoice } from './pages/FundInvoice';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function App(){
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1>InvoiceLift</h1>
        <WalletMultiButton />
      </div>
      <p>Devnet PoC UI (stubs)</p>
      <MintInvoice />
      <div style={{ height: 16 }} />
      <FundInvoice />
    </div>
  );
}
