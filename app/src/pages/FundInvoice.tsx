import React, { useEffect } from 'react';
import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN, Program, web3, Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import { useToast } from '../components/Toast';
import { useDevnetGuard } from '../state/devnetGuard';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormGroup } from '../components/ui/FormGroup';

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080';

export function FundInvoice(){
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoice?: string; fundTx?: string; status?: string; error?: string; lastAmount?: string } | null>(null);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { show } = useToast();
  const { requireDevnetAck } = useDevnetGuard();

  function toBaseUnits(v: string){
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return Math.round(n * 1e6).toString();
  }

  
  async function handleFaucet(){
    if (!wallet.publicKey) {
      show({ text: 'Connect wallet first', kind: 'error' });
      return;
    }
    setFaucetLoading(true);
    try{
      const r = await fetch(`${backend}/api/faucet/usdc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: wallet.publicKey.toBase58() })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'faucet failed');
      let amountUsdc = 100;
      if (j.amount) {
        const n = Number(j.amount);
        if (Number.isFinite(n) && n > 0) {
          amountUsdc = n / 1_000_000;
        }
      }
      const amountLabel = amountUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 });
      show({
        text: `Requested ${amountLabel} devnet USDC from faucet`,
        href: `https://explorer.solana.com/tx/${j.tx}?cluster=devnet`,
        linkText: 'View Tx',
        kind: 'success',
      });
    }catch(e: any){
      const msg = e?.message || String(e);
      if (msg.toLowerCase().includes('faucet disabled')){
        show({ text: 'Faucet is disabled in this environment. Set FAUCET_ENABLED=true on the backend to enable it.', kind: 'error' });
      } else {
        show({ text: msg, kind: 'error' });
      }
    }finally{
      setFaucetLoading(false);
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
    if (requireDevnetAck) {
      setResult({ error: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before funding.' });
      return;
    }
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
          Send USDC into the invoice escrow directly from your wallet. The funds will be locked in escrow until the invoice is settled.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <span>Need devnet USDC for this demo?</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleFaucet}
            loading={faucetLoading}
            disabled={faucetLoading || !wallet.publicKey}
          >
            {wallet.publicKey ? 'Request devnet USDC' : 'Connect wallet to request'}
          </Button>
        </div>
      </div>
      
      <div className='cardFundInvoice'>
        <div className='bgFundInvoice'>
          <Card>
            <CardHeader>
              <CardTitle>Funding details</CardTitle>
            </CardHeader>

            <CardBody>
              <form className="grid gap-4 text-sm">
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
                <div className="mt-2">
                  <Button
                    className='w-full bg-gradient-to-r from-[#4D94CB] to-[#CD29EA]'
                    type="button"
                    variant="secondary"
                    onClick={handleFundWithWallet}
                    disabled={loading || !wallet.publicKey}
                    loading={loading}
                  >
                    {wallet.publicKey ? 'Fund with wallet' : 'Connect wallet to fund'}
                  </Button>
                </div>
                {result?.error && <div className="mt-2 text-xs text-red-600">{result.error}</div>}
                {(result?.fundTx || result?.status) && (
                  <div className="mt-2 grid gap-1 text-xs text-slate-800">
                    {result.fundTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${result.fundTx}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:text-brand-dark"
                      >
                        View transaction on Solana Explorer
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
