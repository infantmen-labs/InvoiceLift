import React, { useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program, web3, Idl, BN } from '@coral-xyz/anchor'
import { getAccount, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useSignerMode } from '../state/signerMode'
import { useToast } from '../components/Toast'

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'

type InvoiceRow = {
  invoicePk: string
  seller: string
  investor: string | null
  usdcMint: string
  amount: string
  fundedAmount: string
  status: string
  metadataHash: string
  dueDate: number
  escrowAuthority: string
  escrowToken: string
  createdAt: number
  updatedAt: number
  lastSig: string | null
}

export function Invoices(){
  const [items, setItems] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [walletFilter, setWalletFilter] = useState<string>('')
  const [auto, setAuto] = useState<boolean>(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [positions, setPositions] = useState<Array<{ wallet: string; amount: string }>>([])
  const [fracAmount, setFracAmount] = useState<string>('')
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [initLoading, setInitLoading] = useState(false)
  const [initWalletLoading, setInitWalletLoading] = useState(false)
  const [fxWalletLoading, setFxWalletLoading] = useState(false)
  const walletAdapter = useWallet()
  const { connection } = useConnection()
  const { mode } = useSignerMode()
  const { show } = useToast()

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (walletFilter) p.set('wallet', walletFilter)
    return p.toString() ? '?' + p.toString() : ''
  }, [status, walletFilter])

  async function load(){
    setLoading(true)
    try{
      const r = await fetch(`${backend}/api/invoices${qs}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      setItems(j.invoices || [])
    }finally{
      setLoading(false)
    }
  }

  async function handleInitSharesWithWallet(){
    if (!selected) return
    if (!walletAdapter.publicKey) { setFxError('Connect wallet first'); return }
    setFxError(null)
    setInitWalletLoading(true)
    try{
      const idlRes = await fetch(`${backend}/idl/invoice_manager`)
      const idl = await idlRes.json()
      const provider = new AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' })
      const program = new Program(idl as Idl, provider as any) as any
      const invoice = new web3.PublicKey(selected)
      const escrowSeed = new TextEncoder().encode('escrow')
      const [escrowAuthority] = web3.PublicKey.findProgramAddressSync([escrowSeed, invoice.toBuffer()], program.programId)
      const sharesMint = web3.Keypair.generate()
      const tx = await (program.methods as any)
        .initShares()
        .accounts({
          invoice,
          payer: walletAdapter.publicKey,
          escrowAuthority,
          sharesMint: sharesMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .transaction()
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = walletAdapter.publicKey
      tx.partialSign(sharesMint)
      const signed = await walletAdapter.signTransaction!(tx)
      const sig = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, 'confirmed')
      show({ text: 'Init shares submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      await loadDetail(selected)
      await load()
    } catch(e: any){ setFxError(e?.message || String(e)) }
    finally { setInitWalletLoading(false) }
  }

  async function handleFundFractionWithWallet(){
    if (!selected) return
    if (!walletAdapter.publicKey) { setFxError('Connect wallet first'); return }
    const n = Number(fracAmount)
    if (!Number.isFinite(n) || n <= 0) { setFxError('Enter a valid amount'); return }
    const base = Math.round(n * 1_000_000)
    setFxError(null)
    setFxWalletLoading(true)
    try{
      const idlRes = await fetch(`${backend}/idl/invoice_manager`)
      const idl = await idlRes.json()
      const provider = new AnchorProvider(connection, walletAdapter as any, { commitment: 'confirmed' })
      const program = new Program(idl as Idl, provider as any) as any
      const invoice = new web3.PublicKey(selected)
      // fetch invoice for mints
      const invRes = await fetch(`${backend}/api/invoice/${selected}`)
      const invJson = await invRes.json()
      if (!invJson.ok) throw new Error(invJson.error || 'fetch invoice failed')
      const usdcMint = new web3.PublicKey(invJson.invoice.usdcMint)
      const sharesMint = new web3.PublicKey(invJson.invoice.sharesMint)
      const escrowSeed = new TextEncoder().encode('escrow')
      const [escrowAuthority] = web3.PublicKey.findProgramAddressSync([escrowSeed, invoice.toBuffer()], program.programId)
      const investorAta = await getAssociatedTokenAddress(usdcMint, walletAdapter.publicKey!, false)
      const escrowToken = await getAssociatedTokenAddress(usdcMint, escrowAuthority, true)
      const investorSharesAta = await getAssociatedTokenAddress(sharesMint, walletAdapter.publicKey!, false)

      // ensure investor USDC ATA exists
      let ataExists = false
      try { await getAccount(connection, investorAta); ataExists = true } catch {}

      const tx = await (program.methods as any)
        .fundInvoiceFractional(new BN(String(base)))
        .accounts({
          invoice,
          investor: walletAdapter.publicKey,
          investorAta,
          escrowToken,
          escrowAuthority,
          sharesMint,
          investorSharesAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .transaction()

      if (!ataExists) {
        const createIx = createAssociatedTokenAccountInstruction(
          walletAdapter.publicKey!,
          investorAta,
          walletAdapter.publicKey!,
          usdcMint
        )
        tx.instructions.unshift(createIx)
      }

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = walletAdapter.publicKey
      const signed = await walletAdapter.signTransaction!(tx)
      const sig = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, 'confirmed')
      show({ text: 'Fund fraction submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setFracAmount('')
      await loadDetail(selected)
      await load()
    } catch(e: any){ setFxError(e?.message || String(e)) }
    finally { setFxWalletLoading(false) }
  }


  useEffect(() => { load() }, [qs])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [auto, qs])

  async function loadDetail(id: string){
    setDetailLoading(true)
    setDetailError(null)
    try{
      const r = await fetch(`${backend}/api/invoice/${id}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load detail failed')
      setDetail(j.invoice)
      try {
        const r2 = await fetch(`${backend}/api/invoice/${id}/positions`)
        const j2 = await r2.json()
        setPositions(j2.ok ? (j2.positions || []) : [])
      } catch {
        setPositions([])
      }
    } catch(e: any){
      setDetailError(e?.message || String(e))
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!selected) return
    loadDetail(selected)
  }, [selected])

  useEffect(() => {
    if (!selected || !auto) return
    const id = setInterval(() => loadDetail(selected), 10000)
    return () => clearInterval(id)
  }, [selected, auto])

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Invoices</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="Open">Open</option>
          <option value="Funded">Funded</option>
          <option value="Settled">Settled</option>
        </select>
        <input value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)} placeholder="Filter by wallet" style={{ width: 360 }} />
        <button onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto refresh
        </label>
      </div>
      <div>
        {items.length === 0 ? (
          <div>No invoices</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 140px 1fr', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Invoice</div>
            <div style={{ fontWeight: 600 }}>Status</div>
            <div style={{ fontWeight: 600 }}>Amount</div>
            <div style={{ fontWeight: 600 }}>Links</div>
            {items.map((it) => (
              <React.Fragment key={it.invoicePk}>
                <div style={{ wordBreak: 'break-all' }}>{it.invoicePk}</div>
                <div>{it.status}</div>
                <div>{Number(it.fundedAmount) / 1_000_000} / {Number(it.amount) / 1_000_000} USDC</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`https://solscan.io/address/${it.invoicePk}?cluster=devnet`} target="_blank">Invoice</a>
                  <a href={`https://solscan.io/address/${it.escrowToken}?cluster=devnet`} target="_blank">Escrow</a>
                  {it.lastSig ? <a href={`https://solscan.io/tx/${it.lastSig}?cluster=devnet`} target="_blank">Last Tx</a> : null}
                  <button onClick={() => setSelected(it.invoicePk)}>View</button>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Invoice Detail</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => loadDetail(selected)} disabled={detailLoading}>{detailLoading ? 'Loading...' : 'Refresh'}</button>
              <button onClick={() => { setSelected(null); setDetail(null); setPositions([]) }}>Close</button>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            {detailError ? <div style={{ color: 'red' }}>{detailError}</div> : null}
            {!detail || detailLoading ? (
              <div>{detailLoading ? 'Loading...' : 'No data'}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 6 }}>
                <div>Invoice</div>
                <div style={{ wordBreak: 'break-all' }}>{selected}</div>
                <div>Status</div>
                <div>{detail.status ? Object.keys(detail.status)[0] : 'unknown'}</div>
                <div>Seller</div>
                <div style={{ wordBreak: 'break-all' }}>{detail.seller || ''}</div>
                <div>Investor</div>
                <div style={{ wordBreak: 'break-all' }}>{detail.investor || ''}</div>
                <div>USDC Mint</div>
                <div style={{ wordBreak: 'break-all' }}>{detail.usdcMint || ''}</div>
                <div>Shares Mint</div>
                <div style={{ wordBreak: 'break-all', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(() => { const v = detail.sharesMint; const s = v && v.toBase58 ? v.toBase58() : (v || ''); return s })() || '—'}
                  {(() => { const v = detail.sharesMint; const s = v && v.toBase58 ? v.toBase58() : (v || ''); return s && s !== '11111111111111111111111111111111' ? <a href={`https://solscan.io/address/${s}?cluster=devnet`} target="_blank">View</a> : null })()}
                </div>
                <div>Amount</div>
                <div>{(() => { const v = detail.amount; const s = typeof v === 'string' ? v : v?.toString ? v.toString() : '0'; return Number(s)/1_000_000 })()} USDC</div>
                <div>Funded</div>
                <div>{(() => { const v = detail.fundedAmount; const s = typeof v === 'string' ? v : v?.toString ? v.toString() : '0'; return Number(s)/1_000_000 })()} USDC</div>
                <div>Due Date</div>
                <div>{(() => { const v = detail.dueDate; const n = typeof v === 'number' ? v : Number(v); if (!isNaN(n)) { try { return new Date(n).toLocaleString() } catch { return String(v) } } return String(v) })()}</div>
                <div>Links</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`https://solscan.io/address/${selected}?cluster=devnet`} target="_blank">Invoice</a>
                  {detail.usdcMint ? <a href={`https://solscan.io/address/${detail.usdcMint}?cluster=devnet`} target="_blank">USDC Mint</a> : null}
                </div>
                <div>Fractional</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(() => {
                    const v = detail.sharesMint; const s = v && v.toBase58 ? v.toBase58() : (v || '')
                    const hasShares = !!s && s !== '11111111111111111111111111111111'
                    if (!hasShares) {
                      return (
                        <>
                          {mode === 'backend' ? (
                            <button
                              onClick={async () => {
                                if (!selected) return
                                setFxError(null)
                                setInitLoading(true)
                                try{
                                  const r = await fetch(`${backend}/api/invoice/${selected}/init-shares`, { method: 'POST' })
                                  const j = await r.json()
                                  if (!j.ok) throw new Error(j.error || 'init failed')
                                  show({ text: 'Init shares submitted', href: `https://explorer.solana.com/tx/${j.tx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
                                  await loadDetail(selected)
                                  await load()
                                }catch(e: any){ setFxError(e?.message || String(e)) }
                                finally{ setInitLoading(false) }
                              }}
                              disabled={initLoading}
                            >{initLoading ? 'Initializing...' : 'Init Shares (Backend)'}</button>
                          ) : (
                            <button onClick={handleInitSharesWithWallet} disabled={initWalletLoading || !walletAdapter.publicKey}>{initWalletLoading ? 'Initializing...' : 'Init Shares (Wallet)'}</button>
                          )}
                        </>
                      )
                    }
                    return (
                      <>
                        <input
                          value={fracAmount}
                          onChange={(e) => setFracAmount(e.target.value)}
                          placeholder="Amount (USDC)"
                          style={{ width: 160 }}
                        />
                        {mode === 'backend' ? (
                          <button
                            onClick={async () => {
                              if (!selected) return
                              const n = Number(fracAmount)
                              if (!Number.isFinite(n) || n <= 0) { setFxError('Enter a valid amount'); return }
                              const base = Math.round(n * 1_000_000)
                              setFxError(null)
                              setFxLoading(true)
                              try{
                                const r = await fetch(`${backend}/api/invoice/${selected}/fund-fractional`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ amount: String(base) })
                                })
                                const j = await r.json()
                                if (!j.ok) throw new Error(j.error || 'fund failed')
                                show({ text: 'Fund fraction submitted', href: `https://explorer.solana.com/tx/${j.tx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
                                setFracAmount('')
                                await loadDetail(selected)
                                await load()
                              }catch(e: any){ setFxError(e?.message || String(e)) }
                              finally{ setFxLoading(false) }
                            }}
                            disabled={fxLoading}
                          >{fxLoading ? 'Funding...' : 'Fund fraction (Backend)'}</button>
                        ) : (
                          <button onClick={handleFundFractionWithWallet} disabled={fxWalletLoading || !walletAdapter.publicKey}>{fxWalletLoading ? 'Funding...' : 'Fund fraction (Wallet)'}</button>
                        )}
                        {fxError ? <span style={{ color: 'red' }}>{fxError}</span> : null}
                      </>
                    )
                  })()}
                </div>
                <div>Positions</div>
                <div>
                  {positions.length === 0 ? (
                    <span>None</span>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', rowGap: 4 }}>
                      <div style={{ fontWeight: 600 }}>Wallet</div>
                      <div style={{ fontWeight: 600 }}>Amount</div>
                      {positions.map((p) => (
                        <React.Fragment key={p.wallet}>
                          <div style={{ wordBreak: 'break-all' }}>{p.wallet}</div>
                          <div>{(() => { const s = String(p.amount); return Number(s)/1_000_000 })()} USDC</div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
