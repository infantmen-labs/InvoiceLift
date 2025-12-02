import React, { useEffect } from 'react';
import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN, Program, web3, Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import { useSignerMode } from '../state/signerMode';
import { useToast } from '../components/Toast';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormGroup } from '../components/ui/FormGroup';

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080';

export function FundInvoice(){
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoice?: string; fundTx?: string; settleTx?: string; status?: string; error?: string; lastAmount?: string } | null>(null);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { mode, adminWallet } = useSignerMode();
  const { show } = useToast();

  function toBaseUnits(v: string){
    return v.includes('.') ? Math.round(Number(v) * 1e6).toString() : v;
  }

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
    <div className="mx-auto mt-6 max-w-xl space-y-4 px-6">
      <div>
        <h1 className="text-lg font-semibold text-[#8437EB]">Fund invoice</h1>
        <p className="text-xs text-slate-300">
          Send USDC into the invoice escrow. Settlement is performed by the backend relayer via the payment webhook
          once off-chain payment is confirmed; it is not executed directly by the connected wallet.
        </p>
      </div>
      

      <div className='cardFundInvoice'>
        <div className='bgFundInvoice'>
          <Card>
            <CardHeader>
              <CardTitle>Funding details</CardTitle>
            </CardHeader>

            <CardBody>
              <form onSubmit={handleFund} className="grid gap-4 text-sm">
                <FormGroup
                  label="Invoice ID"
                  htmlFor="invoice"
                  required
                  help="Invoice public key of the invoice you want to fund."
                >
                  <Input id="invoice" name="invoice" placeholder="Invoice public key" required />
                </FormGroup>
                <FormGroup
                  label="Amount (USDC)"
                  htmlFor="amount"
                  required
                  help="Displayed in USDC, converted to 6-decimal base units on submit."
                >
                  <Input id="amount" name="amount" placeholder="e.g. 5.0" required />
                </FormGroup>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {mode === 'backend' ? (
                    <>
                      <Button type="submit" loading={loading}>
                        {loading ? 'Funding…' : 'Fund (backend signer)'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleSettle}
                        disabled={loading || !result?.invoice}
                      >
                        Settle (webhook)
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        className='bg-gradient-to-r from-[#4D94CB] to-[#CD29EA]'
                        type="button"
                        variant="secondary"
                        onClick={handleFundWithWallet}
                        disabled={loading || !wallet.publicKey}
                        loading={loading}
                      >
                        {wallet.publicKey ? 'Fund with wallet' : 'Connect wallet to fund'}
                      </Button>
                    </>
                  )}
                </div>
                {result?.error && <div className="text-xs text-red-600">{result.error}</div>}
                {(result?.fundTx || result?.settleTx || result?.status) && (
                  <div className="mt-2 grid gap-1 text-xs text-slate-800">
                    {result.fundTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${result.fundTx}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:text-brand-dark"
                      >
                        Fund transaction
                      </a>
                    )}
                    {result.settleTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${result.settleTx}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:text-brand-dark"
                      >
                        Settle transaction
                      </a>
                    )}
                    {result.status && (
                      <div className="text-slate-800">
                        <span className="text-slate-500">Status:</span>{' '}
                        <span>{result.status}</span>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </CardBody>
          </Card>
        </div>
        <div className="blobFundInvoice"></div>
      </div>
    </div>
  );
}
