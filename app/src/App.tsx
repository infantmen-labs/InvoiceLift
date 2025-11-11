import React from 'react';
import { MintInvoice } from './pages/MintInvoice';
import { FundInvoice } from './pages/FundInvoice';

export default function App(){
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>InvoiceLift</h1>
      <p>Devnet PoC UI (stubs)</p>
      <MintInvoice />
      <div style={{ height: 16 }} />
      <FundInvoice />
    </div>
  );
}
