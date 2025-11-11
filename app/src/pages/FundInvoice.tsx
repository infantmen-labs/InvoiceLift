import React from 'react';

export function FundInvoice(){
  async function handleFund(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    alert('funding (demo stub)');
  }
  return (
    <form onSubmit={handleFund} style={{ display: 'grid', gap: 8 }}>
      <h2>Fund Invoice</h2>
      <input name="invoice" placeholder="Invoice ID" />
      <input name="amount" placeholder="Amount (USDC)" />
      <button type="submit">Fund</button>
    </form>
  );
}
