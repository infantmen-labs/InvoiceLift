import React from 'react';

export function MintInvoice(){
  async function handleMint(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    alert('minting (demo stub)');
  }
  return (
    <form onSubmit={handleMint} style={{ display: 'grid', gap: 8 }}>
      <h2>Mint Invoice</h2>
      <input name="metadataHash" placeholder="Metadata hash (CID)" />
      <input name="amount" placeholder="Amount (USDC)" />
      <input name="dueDate" placeholder="Due date (unix)" />
      <button type="submit">Mint Invoice</button>
    </form>
  );
}
