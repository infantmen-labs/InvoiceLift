import React from 'react';
import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program, web3, Idl, BN } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { useSignerMode } from '../state/signerMode';
import { useToast } from '../components/Toast';

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080';

export function MintInvoice(){
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoice?: string; mintTx?: string; escrowTx?: string; error?: string } | null>(null);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { mode, adminWallet } = useSignerMode();
  const { show } = useToast();

  function toBaseUnits(v: string){
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return Math.round(n * 1e6).toString();
  }

  async function handleMint(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const metadataHash = String(data.get('metadataHash') || '');
    const amount = toBaseUnits(String(data.get('amount') || '0'));
    const dueDate = String(data.get('dueDate') || '0');
    setLoading(true);
    setResult(null);
    try{
      const r = await fetch(`${backend}/api/invoice/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(adminWallet ? { 'x-admin-wallet': adminWallet } : {}) },
        body: JSON.stringify({ metadataHash, amount, dueDate })
      });
      const j = await r.json();
      if(!j.ok) throw new Error(j.error || 'mint failed');
      const invoice: string = j.invoice;
      const mintTx: string = j.tx;
      show({ text: 'Mint submitted', href: `https://explorer.solana.com/tx/${mintTx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });
      const r2 = await fetch(`${backend}/api/invoice/${invoice}/create-escrow`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(adminWallet ? { 'x-admin-wallet': adminWallet } : {}) } });
      const j2 = await r2.json();
      if(!j2.ok) throw new Error(j2.error || 'create-escrow failed');
      show({ text: 'Create Escrow submitted', href: `https://explorer.solana.com/tx/${j2.tx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });
      setResult({ invoice, mintTx, escrowTx: j2.tx });
      form.reset();
    }catch(err: any){
      setResult({ error: err?.message || String(err) });
    }finally{
      setLoading(false);
    }
  }
  
  async function handleMintWithWallet(e: React.MouseEvent<HTMLButtonElement>){
    e.preventDefault();
    const form = (e.currentTarget.form as HTMLFormElement);
    if(!form) return;
    const data = new FormData(form);
    const metadataHash = String(data.get('metadataHash') || '');
    const amountStr = String(data.get('amount') || '0');
    const dueDateStr = String(data.get('dueDate') || '0');
    if(!wallet.publicKey) { setResult({ error: 'Connect wallet first' }); return; }
    const amount = toBaseUnits(amountStr);
    const dueDate = dueDateStr;
    setLoading(true);
    setResult(null);
    try{
      // Load IDL and program
      const idlRes = await fetch(`${backend}/idl/invoice_manager`);
      const idl = await idlRes.json();
      const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
      const program = new Program(idl as Idl, provider as any) as Program;

      // Use devnet USDC mint (constant)
      const usdcMint = new web3.PublicKey('5Ni6yhgyxdj89BPxcGLid8sg4Qtgayb1WhhxnrGNWRCT');

      // Create invoice and mint it
      const invoice = web3.Keypair.generate();
      const tx1 = await (program.methods as any)
        .mintInvoice(metadataHash, new BN(String(amount)), new BN(String(dueDate)))
        .accounts({
          invoice: invoice.publicKey,
          seller: wallet.publicKey,
          usdcMint,
          systemProgram: web3.SystemProgram.programId,
        })
        .transaction();
      tx1.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx1.feePayer = wallet.publicKey;
      tx1.partialSign(invoice);
      const signed1 = await wallet.signTransaction!(tx1);
      const mintSig = await connection.sendRawTransaction(signed1.serialize());
      await connection.confirmTransaction(mintSig, 'confirmed');
      show({ text: 'Mint submitted', href: `https://explorer.solana.com/tx/${mintSig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });

      // Derive escrow PDA and token account, then create escrow
      const escrowSeed = new TextEncoder().encode('escrow');
      const [escrowAuthority] = web3.PublicKey.findProgramAddressSync([escrowSeed, invoice.publicKey.toBuffer()], program.programId);
      const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true);
      const tx2 = await (program.methods as any)
        .createEscrow()
        .accounts({
          invoice: invoice.publicKey,
          seller: wallet.publicKey,
          usdcMint,
          escrowAuthority,
          escrowToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .transaction();
      tx2.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx2.feePayer = wallet.publicKey;
      const signed2 = await wallet.signTransaction!(tx2);
      const escrowSig = await connection.sendRawTransaction(signed2.serialize());
      await connection.confirmTransaction(escrowSig, 'confirmed');
      show({ text: 'Create Escrow submitted', href: `https://explorer.solana.com/tx/${escrowSig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' });

      const invoiceId = invoice.publicKey.toBase58();
      setResult({ invoice: invoiceId, mintTx: mintSig, escrowTx: escrowSig });
      // Trigger backend upsert so the list reflects immediately
      try { await fetch(`${backend}/api/invoice/${invoiceId}`); } catch {}
      form.reset();
    }catch(err: any){
      setResult({ error: err?.message || String(err) });
    }finally{
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleMint} style={{ display: 'grid', gap: 8 }}>
      <h2>Mint Invoice</h2>
      <input name="metadataHash" placeholder="Metadata hash (CID)" />
      <input name="amount" placeholder="Amount (USDC)" />
      <input name="dueDate" placeholder="Due date (unix)" />
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'backend' ? (
          <button type="submit" disabled={loading}>{loading ? 'Minting...' : 'Mint (Backend)'}</button>
        ) : (
          <button type="button" onClick={handleMintWithWallet} disabled={loading || !wallet.publicKey}>Mint with Wallet</button>
        )}
      </div>
      {result?.error && <div style={{ color: 'red' }}>{result.error}</div>}
      {result?.invoice && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div>Invoice: {result.invoice}</div>
          {result.mintTx && <a href={`https://explorer.solana.com/tx/${result.mintTx}?cluster=devnet`} target="_blank">Mint Tx</a>}
          {result.escrowTx && <a href={`https://explorer.solana.com/tx/${result.escrowTx}?cluster=devnet`} target="_blank">Create Escrow Tx</a>}
        </div>
      )}
    </form>
  );
}
