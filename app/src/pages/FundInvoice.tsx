import React, { useEffect } from 'react';
import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN, Program, web3, Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import { useSignerMode } from '../state/signerMode';
import { useToast } from '../components/Toast';

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080';

export function FundInvoice(){
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoice?: string; fundTx?: string; settleTx?: string; status?: string; error?: string; lastAmount?: string } | null>(null);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { mode, adminWallet } = useSignerMode();
  const { show } = useToast();
  const [isSeller, setIsSeller] = useState(false);

  function toBaseUnits(v: string){
    return v.includes('.') ? Math.round(Number(v) * 1e6).toString() : v;
  }
  
  async function handleSettleWithWallet(){
    if(!result?.invoice || !result?.lastAmount) return;
    if(!wallet.publicKey) { setResult({ ...result, error: 'Connect wallet first' }); return; }
    try{
      const invRes = await fetch(`${backend}/api/invoice/${result.invoice}`);
      const invJson = await invRes.json();
      if (!invJson.ok) throw new Error(invJson.error || 'fetch invoice failed');
      const sellerStr: string = invJson.invoice.seller;
      if (!sellerStr || sellerStr !== wallet.publicKey.toBase58()) throw new Error('Only seller can settle');

      const idlRes = await fetch(`${backend}/idl/invoice_manager`);
      const idl = await idlRes.json();
      const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
      const program = new Program(idl as Idl, provider as any) as Program;
      const invoicePk = new web3.PublicKey(result.invoice);
      const usdcMint = new web3.PublicKey(invJson.invoice.usdcMint);
      const seller = wallet.publicKey;
      const [escrowAuthority] = web3.PublicKey.findProgramAddressSync([new TextEncoder().encode('escrow'), invoicePk.toBuffer()], program.programId);
      const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true);
      const sellerAta = await getAssociatedTokenAddress(usdcMint, seller);

      const tx = await (program.methods as any)
        .setSettled(new BN(String(result.lastAmount)))
        .accounts({
          invoice: invoicePk,
          operator: seller,
          sellerAta,
          escrowToken,
          escrowAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction!(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      show({ text: 'Settle submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });
      const r2 = await fetch(`${backend}/api/invoice/${result.invoice}`);
      const j2 = await r2.json();
      const status = j2?.invoice?.status ? Object.keys(j2.invoice.status)[0] : 'unknown';
      setResult({ ...result, settleTx: sig, status });
    }catch(err: any){
      setResult({ ...result, error: err?.message || String(err) });
    }
  }

  useEffect(() => {
    (async () => {
      if (!result?.invoice || !wallet.publicKey) { setIsSeller(false); return }
      try{
        const invRes = await fetch(`${backend}/api/invoice/${result.invoice}`)
        const invJson = await invRes.json()
        const sellerStr: string = invJson?.invoice?.seller || ''
        setIsSeller(!!sellerStr && sellerStr === wallet.publicKey!.toBase58())
      }catch{ setIsSeller(false) }
    })()
  }, [result?.invoice, wallet.publicKey])

  async function handleFund(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const invoice = String(data.get('invoice') || '');
    const amount = toBaseUnits(String(data.get('amount') || '0'));
    setLoading(true);
    setResult(null);
    try{
      const r = await fetch(`${backend}/api/invoice/${invoice}/fund`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const j = await r.json();
      if(!j.ok) throw new Error(j.error || 'fund failed');
      show({ text: 'Fund submitted', href: `https://explorer.solana.com/tx/${j.tx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });
      const r2 = await fetch(`${backend}/api/invoice/${invoice}`);
      const j2 = await r2.json();
      const status = j2?.invoice?.status ? Object.keys(j2.invoice.status)[0] : 'unknown';
      setResult({ invoice, fundTx: j.tx, status, lastAmount: amount });
    }catch(err: any){
      setResult({ error: err?.message || String(err) });
    }finally{
      setLoading(false);
    }
  }

  async function handleSettle(){
    if(!result?.invoice || !result?.lastAmount) return;
    setLoading(true);
    try{
      const r = await fetch(`${backend}/webhook/payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: result.invoice, amount: result.lastAmount })
      });
      const j = await r.json();
      if(!j.ok) throw new Error(j.error || 'settle failed');
      show({ text: 'Settle submitted', href: `https://explorer.solana.com/tx/${j.tx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });
      const r2 = await fetch(`${backend}/api/invoice/${result.invoice}`);
      const j2 = await r2.json();
      const status = j2?.invoice?.status ? Object.keys(j2.invoice.status)[0] : 'unknown';
      setResult({ ...result, settleTx: j.tx, status });
    }catch(err: any){
      setResult({ ...result, error: err?.message || String(err) });
    }finally{
      setLoading(false);
    }
  }
  
  async function handleFundWithWallet(e: React.MouseEvent<HTMLButtonElement>){
    e.preventDefault();
    const form = (e.currentTarget.form as HTMLFormElement);
    if(!form) return;
    const data = new FormData(form);
    const invoiceStr = String(data.get('invoice') || '');
    const amountStr = toBaseUnits(String(data.get('amount') || '0'));
    if(!wallet.publicKey) { setResult({ error: 'Connect wallet first' }); return; }
    setLoading(true);
    setResult(null);
    try{
      // Fetch IDL and invoice data
      const idlRes = await fetch(`${backend}/idl/invoice_manager`);
      const idl = await idlRes.json();
      const programId = new web3.PublicKey(idl.address);
      const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
      const program = new Program(idl as Idl, provider as any) as Program;

      const invRes = await fetch(`${backend}/api/invoice/${invoiceStr}`);
      const invJson = await invRes.json();
      if(!invJson.ok) throw new Error(invJson.error || 'fetch invoice failed');
      const usdcMint = new web3.PublicKey(invJson.invoice.usdcMint);

      const invoice = new web3.PublicKey(invoiceStr);
      const escrowSeed = new TextEncoder().encode('escrow');
      const [escrowAuthority] = web3.PublicKey.findProgramAddressSync([escrowSeed, invoice.toBuffer()], program.programId);
      const investorAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey, false);
      const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true);

      // Check if investor ATA exists, create if not
      let ataExists = false;
      try {
        await getAccount(connection, investorAta);
        ataExists = true;
      } catch (e) {
        // ATA doesn't exist, need to create it
      }

      const tx = await (program.methods as any)
        .fundInvoice(new BN(String(amountStr)))
        .accounts({
          invoice,
          investor: wallet.publicKey,
          investorAta,
          escrowToken,
          escrowAuthority,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction();

      // If ATA doesn't exist, prepend create instruction
      if (!ataExists) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          investorAta,
          wallet.publicKey,
          usdcMint
        );
        tx.instructions.unshift(createAtaIx);
      }

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction!(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      show({ text: 'Fund submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });

      const r2 = await fetch(`${backend}/api/invoice/${invoiceStr}`);
      const j2 = await r2.json();
      const status = j2?.invoice?.status ? Object.keys(j2.invoice.status)[0] : 'unknown';
      setResult({ invoice: invoiceStr, fundTx: sig, status, lastAmount: amountStr });
    }catch(err: any){
      setResult({ error: err?.message || String(err) });
    }finally{
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleFund} style={{ display: 'grid', gap: 8 }}>
      <h2>Fund Invoice</h2>
      <input name="invoice" placeholder="Invoice ID" />
      <input name="amount" placeholder="Amount (USDC)" />
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'backend' ? (
          <>
            <button type="submit" disabled={loading}>{loading ? 'Funding...' : 'Fund'}</button>
            <button type="button" onClick={handleSettle} disabled={loading || !result?.invoice}>Settle (Webhook)</button>
          </>
        ) : (
          <>
            <button type="button" onClick={handleFundWithWallet} disabled={loading || !wallet.publicKey}>Fund with Wallet</button>
            <button type="button" onClick={handleSettleWithWallet} disabled={loading || !result?.invoice || !isSeller}>Settle with Wallet</button>
          </>
        )}
      </div>
      {result?.error && <div style={{ color: 'red' }}>{result.error}</div>}
      {result?.fundTx && <a href={`https://explorer.solana.com/tx/${result.fundTx}?cluster=devnet`} target="_blank">Fund Tx</a>}
      {result?.settleTx && <a href={`https://explorer.solana.com/tx/${result.settleTx}?cluster=devnet`} target="_blank">Settle Tx</a>}
      {result?.status && <div>Status: {result.status}</div>}
    </form>
  );
}
