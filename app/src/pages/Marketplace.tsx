import React, { useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'
const PAGE_SIZE = 10

type Listing = { id: number; invoicePk: string; seller: string; price: string; qty: string; remainingQty: string; status: string; createdAt: number; escrowDeposited?: boolean; onChain?: boolean }

export function Marketplace(){
  const wallet = useWallet()
  const { connection } = useConnection()
  const { show } = useToast()
  const walletStr = useMemo(() => wallet.publicKey?.toBase58() || '', [wallet.publicKey])
  const [items, setItems] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [mineOnly, setMineOnly] = useState(false)
  const [invoiceFilter, setInvoiceFilter] = useState('')
  const [fillQtyById, setFillQtyById] = useState<Record<number, string>>({})
  const [fillLoadingId, setFillLoadingId] = useState<number | null>(null)
  const [depositLoadingId, setDepositLoadingId] = useState<number | null>(null)
  const [depositedIds, setDepositedIds] = useState<Record<number, boolean>>({})
  const [approveSharesLoadingId, setApproveSharesLoadingId] = useState<number | null>(null)
  const [approveUsdcLoadingId, setApproveUsdcLoadingId] = useState<number | null>(null)
  const [initV2LoadingId, setInitV2LoadingId] = useState<number | null>(null)
  const allowanceEnabled = (import.meta as any).env.VITE_FEATURE_ALLOWANCE_FILLS !== 'false'
  const [allowances, setAllowances] = useState<Record<number, { sellerShares?: { delegate?: string; amount?: string }; buyerUsdc?: { delegate?: string; amount?: string } }>>({})
  const [page, setPage] = useState(1)

  function bytesToBase64(bytes: Uint8Array){
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }

  async function handleRevokeUsdcV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-revoke-usdc`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-revoke-usdc failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Revoke USDC allowance submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      await load()
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function handleRevokeSharesV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-revoke-shares`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-revoke-shares failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Revoke shares allowance submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      await load()
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function handleCancelOnchainV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-cancel-v2-tx`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-cancel-v2 failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain cancel (V2) submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      await load()
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function sendB64Tx(b64: string){
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not ready')
    const raw = atob(b64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const tx = Transaction.from(bytes)
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    tx.feePayer = wallet.publicKey
    const signed = await wallet.signTransaction(tx)
    const sig = await connection.sendRawTransaction(signed.serialize())
    await connection.confirmTransaction(sig, 'confirmed')
    return sig
  }

  async function handleInitListingV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      setInitV2LoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-create-v2-tx`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-create-v2 failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Init listing (V2) submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      await load()
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setInitV2LoadingId(null) }
  }

  async function handleApproveSharesV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      setApproveSharesLoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-approve-shares`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-approve-shares failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Approve shares submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setApproveSharesLoadingId(null) }
  }

  async function handleApproveUsdcV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity first', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    try{
      setApproveUsdcLoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-approve-usdc`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': walletStr }, body: JSON.stringify({ qty: String(qtyBase) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-approve-usdc failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Approve USDC submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setApproveUsdcLoadingId(null) }
  }

  async function handleFulfillOnchainV2(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    setFillLoadingId(id)
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-fulfill-v2`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': walletStr }, body: JSON.stringify({ qty: String(qtyBase) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-fulfill-v2 failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain fill (V2) submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setFillQtyById((m) => ({ ...m, [id]: '' }))
      await load()
    }catch(e: any){ 
      const msg = e?.message || String(e)
      if (msg.includes('insufficient funds')){
        const l = items.find((x) => x.id === id)
        const price = l ? Number(l.price) / 1_000_000 : 0
        const total = price * (Number(fillQtyById[id] || '0'))
        show({ text: `Insufficient USDC or allowance. You need approximately ${total} USDC (+ fees).`, kind: 'error' })
      } else { show({ text: msg, kind: 'error' }) }
    }
    finally { setFillLoadingId(null) }
  }
  async function signMessageIfPossible(message: string){
    try{
      if (!wallet.publicKey || !wallet.signMessage) return null
      const sig = await wallet.signMessage(new TextEncoder().encode(message))
      return bytesToBase64(sig)
    }catch{ return null }
  }

  async function load(){
    setLoading(true)
    try{
      let url = ''
      if (mineOnly && walletStr) url = `${backend}/api/listings?seller=${walletStr}`
      else url = `${backend}/api/listings/open`
      const r = await fetch(url)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      const rows: Listing[] = (j.listings || []).map((x: any) => ({ id: x.id, invoicePk: x.invoicePk || x.invoice_pk || '', seller: x.seller, price: String(x.price), qty: String(x.qty), remainingQty: String(x.remainingQty || x.remaining_qty || '0'), status: String(x.status), createdAt: Number(x.createdAt || x.created_at || 0), escrowDeposited: !!x.escrowDeposited, onChain: !!x.onChain }))
      setItems(rows)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [mineOnly, walletStr])

  function short(x?: string){ if (!x) return ''; return x.slice(0, 4) + '…' + x.slice(-4) }
  function parsePk(x: any){ return x && (x.toBase58 ? x.toBase58() : String(x)) }
  function n6(x?: string){ try { return (Number(x || '0') / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 }) } catch { return x || '0' } }

  async function refreshAllowances(rows: Listing[]){
    try{
      if (!allowanceEnabled || rows.length === 0) return
      const uniqInvoices = Array.from(new Set(rows.map((r) => r.invoicePk))).filter(Boolean)
      const byInvoice: Record<string, { sharesMint?: string; usdcMint?: string }> = {}
      await Promise.all(uniqInvoices.map(async (inv) => {
        try{
          const resp = await fetch(`${backend}/api/invoice/${inv}`)
          const j = await resp.json()
          if (j.ok && j.invoice){
            const data = j.invoice
            const sharesMint = parsePk(data.sharesMint)
            const usdcMint = parsePk(data.usdcMint)
            byInvoice[inv] = { sharesMint, usdcMint }
          }
        }catch{}
      }))
      const out: Record<number, { sellerShares?: { delegate?: string; amount?: string }; buyerUsdc?: { delegate?: string; amount?: string } }> = {}
      await Promise.all(rows.map(async (row) => {
        try{
          const mints = byInvoice[row.invoicePk] || {}
          // Seller shares allowance
          if (mints.sharesMint){
            const sellerPk = new PublicKey(row.seller)
            const mintPk = new PublicKey(mints.sharesMint)
            const sellerAta = await getAssociatedTokenAddress(mintPk, sellerPk)
            const info = await connection.getParsedAccountInfo(sellerAta)
            const parsed: any = (info.value as any)?.data?.parsed?.info
            const delegate = parsed?.delegate || ''
            const amount = parsed?.delegatedAmount?.amount || '0'
            if (!out[row.id]) out[row.id] = {}
            out[row.id].sellerShares = { delegate, amount }
          }
          // Buyer USDC allowance (if wallet connected)
          if (wallet.publicKey && mints.usdcMint){
            const buyerPk = wallet.publicKey
            const mintPk = new PublicKey(mints.usdcMint)
            const buyerAta = await getAssociatedTokenAddress(mintPk, buyerPk)
            const info = await connection.getParsedAccountInfo(buyerAta)
            const parsed: any = (info.value as any)?.data?.parsed?.info
            const delegate = parsed?.delegate || ''
            const amount = parsed?.delegatedAmount?.amount || '0'
            if (!out[row.id]) out[row.id] = {}
            out[row.id].buyerUsdc = { delegate, amount }
          }
        }catch{}
      }))
      setAllowances(out)
    }catch{}
  }

  useEffect(() => { refreshAllowances(items) }, [items, walletStr])

  function fmt6(a: string){ try { const n = Number(a) / 1_000_000; return n.toLocaleString(undefined, { maximumFractionDigits: 6 }) } catch { return a } }

  async function handleCancel(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      const ts = Date.now()
      const msg = `listing:cancel\nid=${id}\nseller=${walletStr}\nts=${ts}`
      const signature = await signMessageIfPossible(msg)
      const r = await fetch(`${backend}/api/listings/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': walletStr }, body: JSON.stringify({ ts, signature }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'cancel failed')
      show({ text: 'Listing canceled', kind: 'success' })
      await load()
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  // Removed off-chain fill; using only on-chain fulfill


  async function handleDepositOnchain(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      setDepositLoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-create-tx`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-create failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Deposit shares submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setDepositedIds((m) => ({ ...m, [id]: true }))
      await load()
    }catch(e: any){
      const msg = e?.message || String(e)
      if (msg.includes('insufficient funds')) show({ text: 'Insufficient shares. Only wallets that funded this invoice have shares to list.', kind: 'error' })
      else show({ text: msg, kind: 'error' })
    } finally { setDepositLoadingId(null) }
  }

  async function handleFulfillOnchain(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    setFillLoadingId(id)
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-fulfill-tx`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': walletStr }, body: JSON.stringify({ qty: String(qtyBase) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-fulfill failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain fill submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setFillQtyById((m) => ({ ...m, [id]: '' }))
      await load()
    }catch(e: any){ 
      const msg = e?.message || String(e)
      if (msg.includes('insufficient funds')){
        const l = items.find((x) => x.id === id)
        const price = l ? Number(l.price) / 1_000_000 : 0
        const total = price * q
        show({ text: `Insufficient USDC. You need approximately ${total} USDC (+ fees). Use the faucet or fund your wallet and try again.`, kind: 'error' })
      } else {
        show({ text: msg, kind: 'error' })
      }
    }
    finally { setFillLoadingId(null) }
  }

  async function handleCancelOnchain(id: number){
    if (!walletStr) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-cancel-tx`, { method: 'POST', headers: { 'x-wallet': walletStr } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-cancel failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain cancel submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      await load()
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  const filtered = useMemo(() => {
    const f = (invoiceFilter || '').trim()
    if (!f) return items
    return items.filter((it) => it.invoicePk.includes(f))
  }, [items, invoiceFilter])

  const pageCount = filtered.length ? Math.ceil(filtered.length / PAGE_SIZE) : 0
  const currentPage = pageCount ? Math.min(page, pageCount) : 1
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pagedListings = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  useEffect(() => { setPage(1) }, [invoiceFilter, mineOnly])


  // Displaying the remaining details when an invoice is clicked 
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});

  const toggle = (index: number): void => {
    setOpenItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="mt-4 space-y-3 px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-[#8437EB]">Marketplace</h2>
          <p className="text-xs text-slate-300">Browse open listings and trade invoice shares.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="card">
            <Input
              className='bg'
              value={invoiceFilter}
              onChange={(e) => setInvoiceFilter(e.target.value)}
              placeholder="Filter by invoice"
            />
            <div className="blob"></div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              disabled={!walletStr}
              className="h-3 w-3 rounded border-slate-300 bg-white text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand disabled:opacity-40 " 
            />
            <span className='text-slate-300'>My listings only</span>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={load}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="">
          <div className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
            No listings
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,2fr)] text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:grid mt-6">
            <div>Invoice</div>
            <div>Seller</div>
            <div>Price</div>
            <div>Remaining</div>
            <div>Actions</div>
          </div>
          {pagedListings.map((l) => {
            const price = fmt6(l.price)
            const remain = fmt6(l.remainingQty)
            const total = fmt6(l.qty)
            const isMine = walletStr && walletStr === l.seller
            const canCancel = isMine && l.status === 'Open'
            const canFill = l.status === 'Open'
            const statusColor =
              l.status === 'Open'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : l.status === 'Filled'
                ? 'border-slate-200 bg-slate-100 text-slate-700'
                : l.status === 'Canceled'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-slate-100 text-slate-700'
            return (
              <div
                onClick={() => toggle(l.id)}
                key={l.id}
                className="grid grid-cols-1 items-start gap-3 rounded-xl cursor-pointer border border-slate-200 bg-white/90 px-4 py-3 text-xs shadow-sm transition hover:border-brand/40 hover:shadow-md sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,2fr)]"
              >
                <div className="font-mono text-slate-800" title={l.invoicePk}>{short(l.invoicePk)}</div>
                <div className="font-mono text-slate-700" title={l.seller}>
                  {short(l.seller)} {isMine ? <span className="ml-1 text-[10px] text-emerald-400">(you)</span> : null}
                </div>
                <div className="text-slate-900">
                  {price} <span className="text-slate-500">USDC/share</span>
                </div>
                <div className="text-slate-900">
                  {remain} <span className="text-slate-500">shares</span>{' '}
                  {l.escrowDeposited ? <span className="text-[10px] text-slate-500">(deposited)</span> : null}
                </div>
                <div className="flex flex-col gap-2 text-xs text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      {remain} / {total} shares listed · {price} USDC/share
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>
                      {l.status}
                    </span>
                  </div>
                  {isMine && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                        <span>Seller actions</span>
                        <span className="text-slate-400">{l.status}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {canCancel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(l.id)}
                          >
                            Cancel
                          </Button>
                        )}
                        {!allowanceEnabled && canCancel && !depositedIds[l.id] && !l.escrowDeposited && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDepositOnchain(l.id)}
                            loading={depositLoadingId === l.id}
                          >
                            Deposit shares
                          </Button>
                        )}
                        {allowanceEnabled && l.status === 'Open' && !l.onChain && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleInitListingV2(l.id)}
                            loading={initV2LoadingId === l.id}
                          >
                            Init on-chain (V2)
                          </Button>
                        )}
                        {allowanceEnabled && l.status === 'Open' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApproveSharesV2(l.id)}
                              loading={approveSharesLoadingId === l.id}
                            >
                              Approve shares
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeSharesV2(l.id)}
                            >
                              Revoke shares
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelOnchainV2(l.id)}
                            >
                              Cancel on-chain (V2)
                            </Button>
                          </>
                        )}
                      </div>
                      {allowanceEnabled && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Shares allowance:{' '}
                          {allowances[l.id]?.sellerShares?.delegate
                            ? short(allowances[l.id]?.sellerShares?.delegate)
                            : '—'}{' '}
                          {allowances[l.id]?.sellerShares?.amount
                            ? `(${n6(allowances[l.id]?.sellerShares?.amount)})`
                            : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {canFill ? (
                    <div
                    onClick={(e) => e.stopPropagation()}
                    className={`${openItems[l.id] ? 'block' : 'hidden'} z-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 cursor-default`}>
                      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                        <span>Buyer actions</span>
                        <span className="text-slate-400">You pay in USDC</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-28">
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            title="Quantity to buy in shares (6 decimals)."
                            value={fillQtyById[l.id] || ''}
                            onChange={(e) => setFillQtyById((m) => ({ ...m, [l.id]: e.target.value }))}
                            placeholder="Qty (shares)"
                            className="h-8 text-[11px] px-[5px]"
                          />
                        </div>
                        {allowanceEnabled ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApproveUsdcV2(l.id)}
                              loading={approveUsdcLoadingId === l.id}
                            >
                              Approve USDC
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeUsdcV2(l.id)}
                            >
                              Revoke USDC
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleFulfillOnchainV2(l.id)}
                              loading={fillLoadingId === l.id}
                            >
                              Fill on-chain (V2)
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleFulfillOnchain(l.id)}
                            loading={fillLoadingId === l.id}
                          >
                            Fill on-chain
                          </Button>
                        )}
                      </div>
                      {allowanceEnabled && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          USDC allowance:{' '}
                          {allowances[l.id]?.buyerUsdc?.delegate
                            ? short(allowances[l.id]?.buyerUsdc?.delegate)
                            : '—'}{' '}
                          {allowances[l.id]?.buyerUsdc?.amount
                            ? `(${n6(allowances[l.id]?.buyerUsdc?.amount)})`
                            : ''}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {startIndex + 1}–{Math.min(startIndex + pagedListings.length, filtered.length)} of {filtered.length}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === currentPage ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
