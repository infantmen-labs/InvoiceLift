import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program, web3, Idl, BN } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { useSignerMode } from '../state/signerMode';
import { useToast } from '../components/Toast';
import { useDevnetGuard } from '../state/devnetGuard';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormGroup } from '../components/ui/FormGroup';

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080';

export function MintInvoice(){
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoice?: string; mintTx?: string; escrowTx?: string; error?: string } | null>(null);
  const [step, setStep] = useState(1);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { mode, adminWallet } = useSignerMode();
  const { show } = useToast();
  const navigate = useNavigate();
  const { requireDevnetAck } = useDevnetGuard();

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
      navigate(`/invoice/${invoice}`);
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
    if (requireDevnetAck) {
      setResult({ error: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before minting.' });
      return;
    }
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
      setStep(1);
      navigate(`/invoice/${invoiceId}`);
    }catch(err: any){
      setResult({ error: err?.message || String(err) });
    }finally{
      setLoading(false);
    }
  }
  const isLastStep = step === 3;

  return (
    <div className="mx-auto mt-6 max-w-xl space-y-4 px-6">
      <div>
        <h1 className="text-lg font-semibold text-[#8437EB]">Mint invoice</h1>
        <p className="text-xs text-slate-300">Create a new invoice and escrow account on devnet.</p>
      </div>
      

      <div className=' border-slate-200 bg-slate-100 rounded-md'>
        <div className=''>
          <Card>
            <CardHeader>
              <div className="flex w-full items-center justify-between">
                <CardTitle>Invoice details</CardTitle>
                <div className="text-[11px] font-medium text-slate-500">Step {step} of 3</div>
              </div>
            </CardHeader>

            <CardBody>
              <form onSubmit={handleMint} className="grid gap-4 text-sm">
                {(step >= 1) && (
                  <FormGroup
                    label="Metadata hash (CID)"
                    htmlFor="metadataHash"
                    required
                    help="ipfs://… or arbitrary hash identifying off-chain invoice data."
                  >
                    <Input id="metadataHash" name="metadataHash" placeholder="ipfs://… or arbitrary hash" required />
                  </FormGroup>
                )}

                {(step >= 2) && (
                  <FormGroup
                    label="Amount (USDC)"
                    htmlFor="amount"
                    required
                    help="Displayed in USDC, converted to 6-decimal base units on submit."
                  >
                    <Input id="amount" name="amount" placeholder="e.g. 5.0" required />
                  </FormGroup>
                )}

                {step === 3 && (
                  <FormGroup
                    label="Due date (UNIX timestamp)"
                    htmlFor="dueDate"
                    required
                    help="Seconds since epoch; passed directly to the backend."
                  >
                    <Input id="dueDate" name="dueDate" placeholder="e.g. 1734043200" required />
                  </FormGroup>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((s) => Math.max(1, s - 1))}
                      disabled={step === 1 || loading}
                    >
                      Back
                    </Button>
                    {!isLastStep && (
                      <Button
                        className=' text-black'
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setStep((s) => Math.min(3, s + 1))}
                        disabled={loading}
                      >
                        Next
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {mode === 'backend' ? (
                      <Button type="submit" loading={loading} disabled={!isLastStep || loading}>
                        {loading ? 'Minting…' : 'Mint (backend signer)'}
                      </Button>
                    ) : (
                      <Button
                        className='bg-gradient-to-r from-[#4D94CB] to-[#CD29EA]'
                        type="button"
                        onClick={handleMintWithWallet}
                        disabled={loading || !wallet.publicKey || !isLastStep}
                        loading={loading}
                        variant="secondary"
                      >
                        {wallet.publicKey ? 'Mint with wallet' : 'Connect wallet to mint'}
                      </Button>
                    )}
                  </div>
                </div>

                {result?.error && (
                  <div className="text-xs text-red-600">{result.error}</div>
                )}
                {result?.invoice && (
                  <div className="mt-2 grid gap-1 text-xs text-slate-800">
                    <div>
                      <span className="text-slate-500">Invoice:</span>{' '}
                      <span className="font-mono break-all">{result.invoice}</span>
                    </div>
                    {result.mintTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${result.mintTx}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:text-brand-dark"
                      >
                        Mint transaction
                      </a>
                    )}
                    {result.escrowTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${result.escrowTx}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:text-brand-dark"
                      >
                        Create escrow transaction
                      </a>
                    )}
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (result?.invoice) navigate(`/invoice/${result.invoice}`)
                        }}
                      >
                        View invoice details
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
