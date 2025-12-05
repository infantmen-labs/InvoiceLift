import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program, web3, Idl, BN } from '@coral-xyz/anchor'
import { getAccount, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useSignerMode } from '../state/signerMode'
import { useToast } from '../components/Toast'
import { useDevnetGuard } from '../state/devnetGuard'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card'
import { StatCard } from '../components/ui/StatCard'
import { Table, TableBody, TableCell, TableHeader, TableHeadCell, TableRow } from '../components/ui/Table'
import { motion, Variants } from 'framer-motion'





const UpToDown: Variants = {
  hidden: { 
    opacity: 0, 
    y: '-100%' 
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', delay: 0.2 }
  },
  exit: {
    opacity: 0,
    y: "100%",
    transition: { ease: 'easeInOut' }
  }
};



const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'
const PAGE_SIZE = 10

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

export function Invoices() {
  const [items, setItems] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [walletFilter, setWalletFilter] = useState<string>('')
  const [auto, setAuto] = useState<boolean>(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [positions, setPositions] = useState<Array<{ wallet: string; amount: string }>>([])
  const [history, setHistory] = useState<Array<{ wallet: string; delta: string; newAmount: string; ts: number }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [listings, setListings] = useState<Array<{ id: number; seller: string; price: string; qty: string; remainingQty: string; status: string; createdAt: number; escrowDeposited?: boolean; onChain?: boolean }>>([])
  const [listingsLoading, setListingsLoading] = useState(false)
  const [listPrice, setListPrice] = useState('')
  const [listQty, setListQty] = useState('')
  const [createListingLoading, setCreateListingLoading] = useState(false)
  const [depositLoadingId, setDepositLoadingId] = useState<number | null>(null)
  const [depositedIds, setDepositedIds] = useState<Record<number, boolean>>({})
  const [detailDb, setDetailDb] = useState<InvoiceRow | null>(null)
  const [fillQtyById, setFillQtyById] = useState<Record<number, string>>({})
  const [fillLoadingId, setFillLoadingId] = useState<number | null>(null)
  const [approveSharesLoadingId, setApproveSharesLoadingId] = useState<number | null>(null)
  const [approveUsdcLoadingId, setApproveUsdcLoadingId] = useState<number | null>(null)
  const [initV2LoadingId, setInitV2LoadingId] = useState<number | null>(null)
  const allowanceEnabled = (import.meta as any).env.VITE_FEATURE_ALLOWANCE_FILLS !== 'false'
  const [fracAmount, setFracAmount] = useState<string>('')
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [initLoading, setInitLoading] = useState(false)
  const [initWalletLoading, setInitWalletLoading] = useState(false)
  const [fxWalletLoading, setFxWalletLoading] = useState(false)
  const walletAdapter = useWallet()
  const { connection } = useConnection()
  const { mode, adminWallet } = useSignerMode()
  const { show } = useToast()
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [globalTotalsBase, setGlobalTotalsBase] = useState<{ totalAmountBase: number; totalFundedBase: number } | null>(null)
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const initialInvoiceId = params.id
  const { requireDevnetAck } = useDevnetGuard()

  function shortAddress(x?: string | null){
    if (!x) return ''
    const s = String(x)
    if (s.length <= 10) return s
    return `${s.slice(0, 4)}…${s.slice(-4)}`
  }

  function bytesToBase64(bytes: Uint8Array){
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }

  async function handleRevokeSharesV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-revoke-shares`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-revoke-shares failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Revoke shares allowance submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function handleRevokeUsdcV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-revoke-usdc`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-revoke-usdc failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Revoke USDC allowance submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function handleCancelListingOnchainV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-cancel-v2-tx`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-cancel-v2 failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain cancel (V2) submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      if (selected) await loadListings(selected)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function handleInitListingV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      setInitV2LoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-create-v2-tx`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-create-v2 failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Init listing (V2) submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      if (selected) await loadListings(selected)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setInitV2LoadingId(null) }
  }
  async function signMessageIfPossible(message: string){
    try{
      if (!walletAdapter.publicKey || !walletAdapter.signMessage) return null
      const sig = await walletAdapter.signMessage(new TextEncoder().encode(message))
      return bytesToBase64(sig)
    }catch{ return null }
  }

  async function handleApproveSharesV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      setApproveSharesLoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-approve-shares`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-approve-shares failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Approve shares submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setApproveSharesLoadingId(null) }
  }

  async function handleApproveUsdcV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity first', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    try{
      setApproveUsdcLoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-approve-usdc`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': me }, body: JSON.stringify({ qty: String(qtyBase) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-approve-usdc failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Approve USDC submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setApproveUsdcLoadingId(null) }
  }

  async function handleFulfillListingOnchainV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    setFillLoadingId(id)
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-fulfill-v2`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': me }, body: JSON.stringify({ qty: String(qtyBase) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-fulfill-v2 failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain fill (V2) submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setFillQtyById((m) => ({ ...m, [id]: '' }))
      if (selected) await loadListings(selected)
    }catch(e: any){ 
      const msg = e?.message || String(e)
      if (msg.includes('insufficient funds')){
        const l = listings.find((x) => x.id === id)
        const price = l ? Number(l.price) / 1_000_000 : 0
        const total = price * q
        show({ text: `Insufficient USDC or allowance. You need approximately ${total} USDC (+ fees). Use the faucet or approve sufficient allowance and try again.`, kind: 'error' })
      } else {
        show({ text: msg, kind: 'error' })
      }
    }
    finally { setFillLoadingId(null) }
  }
  function decodeB64(b64: string){
    const raw = atob(b64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes
  }
  async function sendB64Tx(b64: string){
    if (!walletAdapter.publicKey || !walletAdapter.signTransaction) throw new Error('Wallet not ready')
    const tx = web3.Transaction.from(decodeB64(b64))
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    tx.feePayer = walletAdapter.publicKey
    const signed = await walletAdapter.signTransaction(tx)
    const sig = await connection.sendRawTransaction(signed.serialize())
    await connection.confirmTransaction(sig, 'confirmed')
    return sig
  }
  function fmt6val(v: any){
    try{
      if (typeof v === 'number') return v / 1_000_000
      if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); if (!isNaN(n)) return n / 1_000_000 }
      if (v && v.toString) { const s = v.toString(); const n = Number(s); if (!isNaN(n)) return n / 1_000_000 }
    }catch{}
    return 0
  }
  function fmt6(v: any){ const n = fmt6val(v); return n.toLocaleString(undefined, { maximumFractionDigits: 6 }) }
  function fmtDateSmart(v: any){
    try{
      if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toLocaleString()
      if (typeof v === 'string'){
        const s = v.trim()
        if (/^\d+$/.test(s)) { const n = Number(s); return new Date(n > 1e12 ? n : n * 1000).toLocaleString() }
        if (/^[0-9a-fA-F]+$/.test(s)) { const n = parseInt(s, 16); return new Date(n > 1e12 ? n : n * 1000).toLocaleString() }
      }
    }catch{}
    return String(v)
  }

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (walletFilter) p.set('wallet', walletFilter)
    p.set('page', String(page))
    p.set('pageSize', String(PAGE_SIZE))
    return p.toString() ? '?' + p.toString() : ''
  }, [status, walletFilter, page])

  const stats = useMemo(() => {
    if (globalTotalsBase) {
      const totalAmount = globalTotalsBase.totalAmountBase / 1_000_000
      const totalFunded = globalTotalsBase.totalFundedBase / 1_000_000
      const avgFundedPct = totalAmount > 0 ? (totalFunded / totalAmount) * 100 : 0
      return { totalAmount, totalFunded, avgFundedPct }
    }
    if (!items.length) return { totalAmount: 0, totalFunded: 0, avgFundedPct: 0 }
    let totalAmount = 0
    let totalFunded = 0
    for (const it of items){
      const amt = Number(it.amount || '0') / 1_000_000
      const funded = Number(it.fundedAmount || '0') / 1_000_000
      if (Number.isFinite(amt)) totalAmount += amt
      if (Number.isFinite(funded)) totalFunded += funded
    }
    const avgFundedPct = totalAmount > 0 ? (totalFunded / totalAmount) * 100 : 0
    return { totalAmount, totalFunded, avgFundedPct }
  }, [items, globalTotalsBase])

  const pageCount = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 0
  const currentPage = pageCount ? Math.min(page, pageCount) : 1
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pagedItems = items

  useEffect(() => {
    // Reset to first page when filters change
    setPage(1)
  }, [status, walletFilter])

  useEffect(() => {
    if (initialInvoiceId) {
      setSelected(initialInvoiceId)
    }
  }, [initialInvoiceId])

  function handleCloseDetail(){
    setSelected(null)
    setDetail(null)
    setPositions([])
    setHistory([])
    setListings([])
    if (initialInvoiceId) {
      navigate('/invoices', { replace: true })
    }
  }

  async function load(){
    setLoading(true)
    try{
      const r = await fetch(`${backend}/api/invoices${qs}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      setItems(j.invoices || [])
      if (j.pagination && typeof j.pagination.total === 'number') {
        setTotalCount(j.pagination.total)
      } else {
        setTotalCount((j.invoices || []).length || 0)
      }
      if (j.stats) {
        const totalAmountBaseRaw =
          typeof j.stats.totalAmountBase !== 'undefined'
            ? j.stats.totalAmountBase
            : j.stats.totalAmount
        const totalFundedBaseRaw =
          typeof j.stats.totalFundedBase !== 'undefined'
            ? j.stats.totalFundedBase
            : j.stats.totalFunded
        const totalAmountBase = Number(totalAmountBaseRaw || 0)
        const totalFundedBase = Number(totalFundedBaseRaw || 0)
        setGlobalTotalsBase({ totalAmountBase, totalFundedBase })
      } else {
        setGlobalTotalsBase(null)
      }
    }finally{
      setLoading(false)
    }
  }

  async function loadHistory(id: string){
    setHistoryLoading(true)
    try{
      const r = await fetch(`${backend}/api/invoice/${id}/positions/history?limit=50`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'history load failed')
      setHistory(j.history || [])
    }catch(e: any){ /* keep UI resilient; show only detail error */ }
    finally { setHistoryLoading(false) }
  }
  
  async function loadListings(id: string){
    setListingsLoading(true)
    try{
      const r = await fetch(`${backend}/api/invoice/${id}/listings`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'listings load failed')
      const rows = (j.listings || []).map((x: any) => ({ id: x.id, seller: x.seller, price: String(x.price), qty: String(x.qty), remainingQty: String(x.remainingQty), status: String(x.status), createdAt: Number(x.createdAt), escrowDeposited: !!x.escrowDeposited, onChain: !!x.onChain }))
      setListings(rows)
    }catch{}
    finally{ setListingsLoading(false) }
  }

  async function handleCreateListing(){
    if (!selected) return
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    const p = Number(listPrice)
    const q = Number(listQty)
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) { show({ text: 'Enter valid price and quantity', kind: 'error' }); return }

    const myPos = positions.find((pos) => pos.wallet === me)
    const myAmountBase = myPos ? Number(myPos.amount || '0') : 0
    if (!Number.isFinite(myAmountBase) || myAmountBase <= 0) {
      show({ text: 'You have no shares to list for this invoice', kind: 'error' })
      return
    }

    // Subtract any already-open listings for this seller on this invoice
    let reservedBase = 0
    for (const l of listings) {
      if (l.seller !== me || l.status !== 'Open') continue
      try {
        const raw = (l as any).remainingQty ?? (l as any).qty
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) reservedBase += n
      } catch {}
    }
    const availableBase = Math.max(myAmountBase - reservedBase, 0)

    const qtyBase = Math.round(q * 1_000_000)
    if (qtyBase > availableBase) {
      const maxShares = availableBase / 1_000_000
      show({
        text: `Quantity cannot exceed your balance of ${maxShares.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares`,
        kind: 'error',
      })
      return
    }

    const priceBase = Math.round(p * 1_000_000)
    setCreateListingLoading(true)
    try{
      const ts = Date.now()
      const msg = `listing:create\ninvoicePk=${selected}\nseller=${me}\nprice=${priceBase}\nqty=${qtyBase}\nts=${ts}`
      const signature = await signMessageIfPossible(msg)
      const r = await fetch(`${backend}/api/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet': me },
        body: JSON.stringify({ invoicePk: selected, seller: me, price: String(priceBase), qty: String(qtyBase), ts, signature })
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'create failed')
      show({ text: 'Listing created', kind: 'success' })
      setListPrice(''); setListQty('')
      await loadListings(selected)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setCreateListingLoading(false) }
  }

  async function handleCancelListing(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      const ts = Date.now()
      const msg = `listing:cancel\nid=${id}\nseller=${me}\nts=${ts}`
      const signature = await signMessageIfPossible(msg)
      const r = await fetch(`${backend}/api/listings/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': me }, body: JSON.stringify({ ts, signature }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'cancel failed')
      show({ text: 'Listing canceled', kind: 'success' })
      if (selected) await loadListings(selected)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }

  async function handleFillListing(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    setFillLoadingId(id)
    try{
      const ts = Date.now()
      const msg = `listing:fill\nid=${id}\nbuyer=${me}\nqty=${qtyBase}\nts=${ts}`
      const signature = await signMessageIfPossible(msg)
      const r = await fetch(`${backend}/api/listings/${id}/fill`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': me }, body: JSON.stringify({ qty: String(qtyBase), ts, signature }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'fill failed')
      show({ text: 'Fill submitted', kind: 'success' })
      setFillQtyById((m) => ({ ...m, [id]: '' }))
      if (selected) await loadListings(selected)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setFillLoadingId(null) }
  }

  async function handleDepositListingOnchain(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      setDepositLoadingId(id)
      const r = await fetch(`${backend}/api/listings/${id}/build-create-tx`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-create failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'Deposit shares submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setDepositedIds((m) => ({ ...m, [id]: true }))
      if (selected) await loadListings(selected)
    }catch(e: any){ 
      const msg = e?.message || String(e)
      if (msg.includes('insufficient funds')) {
        show({ text: 'Insufficient shares. Only wallets that funded this invoice have shares to list.', kind: 'error' })
      } else {
        show({ text: msg, kind: 'error' })
      }
    } finally { setDepositLoadingId(null) }
  }

  async function handleFulfillListingOnchain(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    const q = Number(fillQtyById[id] || '0')
    if (!Number.isFinite(q) || q <= 0) { show({ text: 'Enter a valid quantity', kind: 'error' }); return }
    const qtyBase = Math.round(q * 1_000_000)
    setFillLoadingId(id)
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-fulfill-tx`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': me }, body: JSON.stringify({ qty: String(qtyBase) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-fulfill failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain fill submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      setFillQtyById((m) => ({ ...m, [id]: '' }))
      if (selected) await loadListings(selected)
    }catch(e: any){ 
      const msg = e?.message || String(e)
      if (msg.includes('insufficient funds')){
        const l = listings.find((x) => x.id === id)
        const price = l ? Number(l.price) / 1_000_000 : 0
        const total = price * q
        show({ text: `Insufficient USDC. You need approximately ${total} USDC (+ fees). Use the faucet or fund your wallet and try again.`, kind: 'error' })
      } else {
        show({ text: msg, kind: 'error' })
      }
    }
    finally { setFillLoadingId(null) }
  }

  async function handleCancelListingOnchain(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
    if (requireDevnetAck) { show({ text: 'This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before listing or trading.', kind: 'error' }); return }
    const me = walletAdapter.publicKey.toBase58()
    try{
      const r = await fetch(`${backend}/api/listings/${id}/build-cancel-tx`, { method: 'POST', headers: { 'x-wallet': me } })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'build-cancel failed')
      const sig = await sendB64Tx(j.tx)
      show({ text: 'On-chain cancel submitted', href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
      if (selected) await loadListings(selected)
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
  }


  async function handleInitSharesWithWallet(){
    if (!selected) return
    if (!walletAdapter.publicKey) { setFxError('Connect wallet first'); return }
    if (requireDevnetAck) { setFxError('This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before initializing shares.'); return }
    const seller = (detail && (detail as any).seller) as string | undefined
    const me = walletAdapter.publicKey.toBase58()
    if (!seller || me !== seller) {
      setFxError('Only the seller of this invoice can initialize shares.')
      return
    }
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
    if (requireDevnetAck) { setFxError('This demo only works on Solana devnet. Switch your wallet network to Devnet/Testnet, then click "I\'m on devnet" next to the wallet button before funding.'); return }
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


  async function loadDetail(id: string){
    setDetailLoading(true)
    setDetailError(null)
    try{
      const r = await fetch(`${backend}/api/invoice/${id}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'detail failed')
      setDetail(j.invoice)
      try{
        const rr = await fetch(`${backend}/api/invoice/${id}/positions`)
        const jj = await rr.json()
        if (jj.ok) setPositions(jj.positions || [])
      }catch{}
      try { await loadHistory(id) } catch {}
      try { await loadListings(id) } catch {}
      try {
        const lr = await fetch(`${backend}/api/invoices`)
        const lj = await lr.json()
        if (lj.ok && Array.isArray(lj.invoices)){
          const row = (lj.invoices as InvoiceRow[]).find((x) => x.invoicePk === id)
          if (row) setDetailDb(row)
        }
      } catch {}
    }catch(e: any){ setDetailError(e?.message || String(e)) }
    finally{ setDetailLoading(false) }
  }

  useEffect(() => { load() }, [qs])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [auto, qs])

  useEffect(() => {
    if (!selected) return
    loadDetail(selected)
  }, [selected])

  useEffect(() => {
    if (!selected) return
    const row = items.find((x) => x.invoicePk === selected)
    if (row) setDetailDb(row)
  }, [selected, items])

  useEffect(() => {
    if (!selected || !auto) return
    const id = setInterval(() => { loadDetail(selected); loadHistory(selected); loadListings(selected) }, 10000)
    return () => clearInterval(id)
  }, [selected, auto])



       // Monitoring the window.innerWidth to make Sidebar Static
      const [ windowWidth, setWindowWidth ]= useState<number>(window.innerWidth);
  
      useEffect(() => {
        function watchWindowWidth() {
          setWindowWidth(window.innerWidth)
        }
        window.addEventListener("resize", watchWindowWidth);
  
  
        return function() {
          window.removeEventListener("resize", watchWindowWidth)
          // console.log(windowWidth)
        }
      }, [windowWidth])


      // Open & Close Summary
      const [showSummary, setShowSummary] = useState<boolean>(false)

      function openSummary(): void {
        setShowSummary(prev => !prev)
      }

  return (
    <div className="space-y-4 mx-[10px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

        <div className='cardInvoice1'>
          <Card className="bgInvoice1 flex-1 bg-white">
          <CardHeader className="border-b bg-white px-4 py-3">
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap items-center gap-3 ">
            <div className="w-32">
              <Select className='bg-white' value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="Open">Open</option>
                <option value="Funded">Funded</option>
                <option value="Settled">Settled</option>
              </Select>
            </div>
            <div className="w-64 min-w-[220px] flex-1 ">
              <Input
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                placeholder="Filter by wallet (seller/investor)"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={load}
              loading={loading}
            >
              Refresh
            </Button>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                className="h-3 w-3 rounded border-slate-300 bg-white text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
              />
              Auto refresh
            </label>
          </CardBody>
          </Card>
          <div className="blobInvoice1"></div>
        </div>
        <div className="grid w-full max-w-md flex-none grid-cols-1 gap-3 sm:grid-cols-3">

          <div className='cardInvoice2'>
            <div className='bgInvoice2'>
              <StatCard label="Total invoices" value={totalCount.toString()} />
            </div>
            <div className="blobInvoice2"></div>
          </div>

          <div className='cardInvoice2'>
            <div className='bgInvoice2 whitespace-nowrap'>
              <StatCard
                label="Total amount"
                value={`${stats.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
              />
            </div>
            <div className="blobInvoice2"></div>
          </div>

          <div className='cardInvoice2'>
            <div className='bgInvoice2'>
              <StatCard
                label="Avg funded"
                value={`${stats.avgFundedPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}
              />
            </div>
            <div className="blobInvoice2"></div>
          </div>
        </div>
      </div>

      <div className='max-w-full h-auto flex justify-center items-center'>
        <div className='Table overflow-auto sm:overflow-x-auto w-[360px] h-auto py-5'>
          <div className="overflow-x-auto">
            {items.length === 0 ? (
              <div className='cardInvoice2'>
                <div className="bgInvoiceAlone rounded-lg border border-slate-200 bg-transparent px-4 py-6 text-sm text-slate-500">
                  No invoices found for the current filters.
                </div>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHeadCell className="w-[40px] text-green-500">#</TableHeadCell>
                      <TableHeadCell className='text-white/90'>Invoice</TableHeadCell>
                      <TableHeadCell className='text-white/90'>Status</TableHeadCell>
                      <TableHeadCell className='text-white/90'>Seller</TableHeadCell>
                      <TableHeadCell className='text-white/90'>Funded / Amount</TableHeadCell>
                      <TableHeadCell className='text-white/90'>Links</TableHeadCell>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((it, idx) => {
                      const amount = Number(it.amount || '0') / 1_000_000
                      const funded = Number(it.fundedAmount || '0') / 1_000_000
                      const fundedPct = amount > 0 ? (funded / amount) * 100 : 0
                      const rowNumber = startIndex + idx + 1
                      return (
                        <TableRow
                          key={it.invoicePk}
                          className="cursor-pointer"
                          onClick={() => setSelected(it.invoicePk)}
                        >
                          <TableCell className="text-xs text-slate-500">
                            {rowNumber}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-800">
                            {shortAddress(it.invoicePk)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={it.status === 'Open' ? 'warning' : it.status === 'Funded' ? 'success' : 'default'}
                            >
                              {it.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-700">
                            {shortAddress(it.seller)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-800">
                            <span className="font-medium">{funded.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            <span className="text-slate-500"> / {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span>
                            {amount > 0 && (
                              <span className="ml-1 text-slate-500">
                                · {fundedPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={`https://solscan.io/address/${it.invoicePk}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#8437EB] hover:text-[#7105fe]"
                              >
                                Invoice
                              </a>
                              <a
                                href={`https://solscan.io/address/${it.escrowToken}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#8437EB] hover:text-[#7105fe]"
                              >
                                Escrow
                              </a>
                              {it.lastSig ? (
                                <a
                                  href={`https://solscan.io/tx/${it.lastSig}?cluster=devnet`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#002356] hover:text-brand-dark"
                                >
                                  Last tx
                                </a>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {pageCount > 1 && (
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <div>
                      Showing {startIndex + 1}–{Math.min(startIndex + pagedItems.length, items.length)} of {items.length}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      > 
                        <span className='text-black'>Prev</span>
                      </Button>
                      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                        <Button
                          className='hover:bg-[#012d4f]'
                          key={p}
                          variant={p === currentPage ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      ))}
                      <Button
                        className=''
                        variant="ghost"
                        size="sm"
                        disabled={currentPage === pageCount}
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      >
                        <span className='text-black'>Next</span>
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {selected ? (
            <div className='fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40'>
              <motion.div
                variants={UpToDown}
                initial="hidden"
                whileInView="visible"
                exit="exit"
                viewport={{ once: false }}
                className="fixed inset-0 z-40 flex items-center justify-center">
                <div
                  className="absolute inset-0"
                  onClick={handleCloseDetail}
                />
                <div className="relative z-10 w-full max-w-3xl px-4">
                  <Card className="max-h-[80vh] overflow-hidden bg-white shadow-xl">
                    <CardHeader className="border-b border-slate-200">
                      <div className="flex w-full items-center justify-between gap-2">
                        <CardTitle>INVOICE DETAILS</CardTitle>
                        <div className="flex items-center gap-2 text-xs">
                          <Button
                            className='animate-dangle'
                            variant="secondary"
                            size="sm"
                            onClick={() => loadDetail(selected)}
                            disabled={detailLoading}
                          >
                            {detailLoading ? 'Loading…' : 'Refresh'}
                          </Button>
                          <Button
                            className='animate-UpDown'
                            variant="ghost"
                            size="sm"
                            onClick={handleCloseDetail}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody className="max-h-[70vh] overflow-y-auto">
                      {detailError ? (
                        <div className="mb-2 text-xs text-red-600">{detailError}</div>
                      ) : null}
                      {!detail || detailLoading ? (
                        <div className="text-sm text-slate-500">
                          {detailLoading ? 'Loading…' : 'No data'}
                        </div>
                      ) : (
                        <div className="space-y-6 text-sm">
                          {/* Summary */}
                          <div className='flex flex-col justify-center items-center'>
                            <h3
                            onClick={openSummary}
                            className={`${showSummary ? 'mb-3 opacity-100' : 'mb-[-15px] opacity-70'} mx-7 px-32 text-sm font-bold uppercase tracking-wide text-slate-200 rounded-lg  text-center bg-[#03182E] hover:opacity-100 cursor-pointer whitespace-nowrap`}>
                              Summary {showSummary ? <i className="fa-solid fa-angle-down text-[#0268f7] text-xl"></i> : <i className="fa-solid fa-angle-up text-[#0268f7] text-xl "></i>}
                            </h3>
                            <div className={`${showSummary ? 'block' : 'hidden'} grid grid-cols-[140px_minmax(0,1fr)] gap-y-2 pl-10  `}>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Invoice
                              </div>
                              <div
                                className="flex items-center gap-2 break-all font-mono text-xs text-slate-800"
                                title={selected || undefined}
                              >
                                <span>{shortAddress(selected)}</span>
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-200"
                                  onClick={() => {
                                    if (!selected) return
                                    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                                      navigator.clipboard.writeText(selected)
                                        .then(() => {
                                          show({ text: 'Invoice address copied', kind: 'success' })
                                        })
                                        .catch(() => {
                                          show({ text: 'Failed to copy invoice address', kind: 'error' })
                                        })
                                    }
                                  }}
                                >
                                  Copy
                                </button>
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Status
                              </div>
                              <div className="text-xs text-slate-900">
                                {(() => {
                                  const raw = (detailDb?.status || (detail.status ? Object.keys(detail.status)[0] : 'unknown')) as string
                                  const normalized = String(raw || '').toLowerCase()
                                  let cls = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium '
                                  if (normalized === 'open') cls += 'bg-emerald-50 text-emerald-700'
                                  else if (normalized === 'funded') cls += 'bg-blue-50 text-blue-700'
                                  else if (normalized === 'repaid' || normalized === 'settled') cls += 'bg-slate-900 text-slate-50'
                                  else if (normalized === 'cancelled' || normalized === 'canceled') cls += 'bg-slate-100 text-slate-600'
                                  else cls += 'bg-slate-100 text-slate-700'
                                  return <span className={cls}>{raw || 'Unknown'}</span>
                                })()}
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Seller
                              </div>
                              <div
                                className="break-all font-mono text-xs text-slate-800"
                                title={detail.seller || undefined}
                              >
                                {detail.seller ? shortAddress(detail.seller) : '—'}
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Investor
                              </div>
                              <div
                                className="break-all font-mono text-xs text-slate-800"
                                title={(() => {
                                  const inv = detail.investor || ''
                                  return inv && inv !== '11111111111111111111111111111111' ? inv : undefined
                                })()}
                              >
                                {(() => {
                                  const inv = detail.investor || ''
                                  if (!inv || inv === '11111111111111111111111111111111') return 'Not set'
                                  return shortAddress(inv)
                                })()}
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                USDC Mint
                              </div>
                              <div
                                className="break-all font-mono text-xs text-slate-800"
                                title={(() => {
                                  const mint = detail.usdcMint || ''
                                  return mint && mint !== '11111111111111111111111111111111' ? mint : undefined
                                })()}
                              >
                                {(() => {
                                  const mint = detail.usdcMint || ''
                                  return mint && mint !== '11111111111111111111111111111111' ? shortAddress(mint) : '—'
                                })()}
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Shares Mint
                              </div>
                              <div
                                className="flex items-center gap-2 break-all font-mono text-xs text-slate-800"
                                title={(() => {
                                  const v = detail.sharesMint
                                  const s = v && v.toBase58 ? v.toBase58() : (v || '')
                                  return s && s !== '11111111111111111111111111111111' ? s : undefined
                                })()}
                              >
                                {(() => {
                                  const v = detail.sharesMint
                                  const s = v && v.toBase58 ? v.toBase58() : (v || '')
                                  if (!s || s === '11111111111111111111111111111111') return '—'
                                  return shortAddress(s)
                                })()}
                                {(() => {
                                  const v = detail.sharesMint
                                  const s = v && v.toBase58 ? v.toBase58() : (v || '')
                                  return s && s !== '11111111111111111111111111111111'
                                    ? <a href={`https://solscan.io/address/${s}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-brand hover:text-brand-dark">View</a>
                                    : null
                                })()}
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Amount
                              </div>
                              <div className="text-xs text-slate-900">
                                {(() => {
                                  const raw = (detailDb?.amount ?? (detail?.amount as any))
                                  if (raw && typeof raw === 'object' && 'toNumber' in raw) return fmt6((raw as any).toNumber())
                                  return fmt6(raw)
                                })()} USDC
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Funded
                              </div>
                              <div className="text-xs text-slate-900">
                                {(() => {
                                  const raw = (detailDb?.fundedAmount ?? (detail?.fundedAmount as any))
                                  if (raw && typeof raw === 'object' && 'toNumber' in raw) return fmt6((raw as any).toNumber())
                                  return fmt6(raw)
                                })()} USDC
                              </div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Due Date
                              </div>
                              <div className="text-xs text-slate-900">{fmtDateSmart(detail.dueDate)}</div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600 italic font-serif">
                                Links
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <a
                                  href={`https://solscan.io/address/${selected}?cluster=devnet`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand hover:text-brand-dark"
                                >
                                  Invoice
                                </a>
                                {detail.usdcMint ? (
                                  <a
                                    href={`https://solscan.io/address/${detail.usdcMint}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-brand hover:text-brand-dark"
                                  >
                                    USDC Mint
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {/* Listings */}
                          <div className="border-t border-slate-400 pt-4">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-800">Listings</h3>
                              {(() => {
                                const me = walletAdapter.publicKey?.toBase58()
                                if (!me) return null
                                const pos = positions.find((p) => p.wallet === me)
                                if (!pos) return null
                                let balanceBase = 0
                                try {
                                  balanceBase = Number(pos.amount || '0')
                                } catch {}
                                if (!Number.isFinite(balanceBase) || balanceBase <= 0) return null

                                // Subtract already-open listings for this seller on this invoice
                                let reservedBase = 0
                                for (const l of listings) {
                                  if (l.seller !== me || l.status !== 'Open') continue
                                  try {
                                    const raw = (l as any).remainingQty ?? (l as any).qty
                                    const n = Number(raw)
                                    if (Number.isFinite(n) && n > 0) reservedBase += n
                                  } catch {}
                                }
                                const availableBase = Math.max(balanceBase - reservedBase, 0)
                                if (availableBase <= 0) return null
                                const shares = availableBase / 1_000_000
                                return (
                                  <span className="text-[11px] text-slate-500">
                                    Available: <span className="font-medium text-slate-700">{shares.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares</span>
                                  </span>
                                )
                              })()}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {(() => {
                                const me = walletAdapter.publicKey?.toBase58()
                                const canList = !!me
                                return (
                                  <>
                                    <div className="w-40">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.000001"
                                        title="Price per share in USDC (6 decimals). Converted to base units on submit."
                                        value={listPrice}
                                        onChange={(e) => setListPrice(e.target.value)}
                                        placeholder="Price (USDC/share)"
                                        className="h-8 text-[11px] bg-[#e7e7e7]"
                                      />
                                    </div>
                                    <div className="w-40">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.000001"
                                        title="Quantity in shares (6 decimals). Converted to base units on submit."
                                        value={listQty}
                                        onChange={(e) => setListQty(e.target.value)}
                                        placeholder="Qty (shares)"
                                        className="h-8 text-[11px] bg-[#e7e7e7]"
                                      />
                                    </div>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={handleCreateListing}
                                      loading={createListingLoading}
                                      disabled={!canList}
                                    >
                                      Create listing
                                    </Button>
                                    {!canList ? (
                                      <span className="text-[11px] text-slate-500">Connect wallet to list shares</span>
                                    ) : null}
                                  </>
                                )
                              })()}
                            </div>
                            <div className="mt-3 text-xs text-slate-700">
                              {listingsLoading ? (
                                <div>Loading listings...</div>
                              ) : listings.length === 0 ? (
                                <div className="text-slate-500">No listings</div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)] text-[11px] font-medium uppercase tracking-wide text-slate-500 md:grid">
                                    <div>Seller</div>
                                    <div>Price</div>
                                    <div>Remaining</div>
                                    <div>Actions</div>
                                  </div>
                                  {listings.map((l) => {
                                    const price = Number(l.price) / 1_000_000
                                    const remain = Number(l.remainingQty) / 1_000_000
                                    const me = walletAdapter.publicKey?.toBase58()
                                    const isMyListing = me === l.seller
                                    const canCancel = isMyListing && l.status === 'Open'
                                    const canFill = l.status === 'Open'
                                    return (
                                      <div
                                        key={l.id}
                                        className="grid grid-cols-1 items-center gap-2 rounded-md border border-slate-500 px-3 py-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)] bg-[#e7e7e7]"
                                      >
                                        <div className="break-all font-mono text-xs text-slate-800">
                                          {l.seller}{' '}
                                          {isMyListing ? <span className="ml-1 text-[10px] text-emerald-500">(you)</span> : null}
                                        </div>
                                        <div className="text-xs text-slate-900">
                                          {price} <span className="text-slate-500">USDC/share</span>
                                        </div>
                                        <div className="text-xs text-slate-900">
                                          {remain} <span className="text-slate-500">shares</span>{' '}
                                          {l.escrowDeposited ? <span className="text-[10px] text-slate-500">(deposited)</span> : null}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                          {canCancel && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleCancelListing(l.id)}
                                            >
                                              Cancel
                                            </Button>
                                          )}
                                          {!allowanceEnabled && canCancel && !depositedIds[l.id] && !l.escrowDeposited && (
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => handleDepositListingOnchain(l.id)}
                                              loading={depositLoadingId === l.id}
                                            >
                                              Deposit shares
                                            </Button>
                                          )}
                                          {allowanceEnabled && isMyListing && l.status === 'Open' && !l.onChain && (
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => handleInitListingV2(l.id)}
                                              loading={initV2LoadingId === l.id}
                                            >
                                              Init on-chain (V2)
                                            </Button>
                                          )}
                                          {allowanceEnabled && isMyListing && l.status === 'Open' && (
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
                                                onClick={() => handleCancelListingOnchainV2(l.id)}
                                              >
                                                Cancel on-chain (V2)
                                              </Button>
                                            </>
                                          )}
                                          {canFill ? (
                                            <>
                                              <div className="w-[100px]">
                                                <Input
                                                  type="number"
                                                  min="0"
                                                  step="0.000001"
                                                  title="Quantity to buy in shares (6 decimals)."
                                                  value={fillQtyById[l.id] || ''}
                                                  onChange={(e) => setFillQtyById((m) => ({ ...m, [l.id]: e.target.value }))}
                                                  placeholder="Qty"
                                                  className="h-8 text-[11px] bg-[#c7c7c7] px-[7px]"
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
                                                    onClick={() => handleFulfillListingOnchainV2(l.id)}
                                                    loading={fillLoadingId === l.id}
                                                  >
                                                    Fill on-chain (V2)
                                                  </Button>
                                                </>
                                              ) : (
                                                <Button
                                                  variant="primary"
                                                  size="sm"
                                                  onClick={() => handleFulfillListingOnchain(l.id)}
                                                  loading={fillLoadingId === l.id}
                                                >
                                                  Fill on-chain
                                                </Button>
                                              )}
                                            </>
                                          ) : (
                                            <span className="text-[11px] text-slate-500">{l.status}</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Fractional */}
                          <div className="border-t border-slate-400 pt-4">
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-800">Fractional</h3>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {(() => {
                                const v = detail.sharesMint; const s = v && v.toBase58 ? v.toBase58() : (v || '')
                                const hasShares = !!s && s !== '11111111111111111111111111111111'
                                if (!hasShares) {
                                  return (
                                    <>
                                      {mode === 'backend' ? (
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={async () => {
                                            if (!selected) return
                                            setFxError(null)
                                            setInitLoading(true)
                                            try{
                                              const r = await fetch(`${backend}/api/invoice/${selected}/init-shares`, { method: 'POST', headers: { ...(adminWallet ? { 'x-admin-wallet': adminWallet } : {}) } })
                                              const j = await r.json()
                                              if (!j.ok) throw new Error(j.error || 'init failed')
                                              show({ text: 'Init shares submitted', href: `https://explorer.solana.com/tx/${j.tx}?cluster=devnet`, linkText: 'View Tx', kind: 'success' })
                                              await loadDetail(selected)
                                              await load()
                                            }catch(e: any){ setFxError(e?.message || String(e)) }
                                            finally{ setInitLoading(false) }
                                          }}
                                          disabled={initLoading}
                                        >
                                          {initLoading ? 'Initializing…' : 'Init shares (Backend)'}
                                        </Button>
                                      ) : (
                                        (() => {
                                          const me = walletAdapter.publicKey?.toBase58()
                                          const seller = (detail && (detail as any).seller) as string | undefined
                                          const isSeller = !!me && !!seller && me === seller
                                          return (
                                            <>
                                              <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={handleInitSharesWithWallet}
                                                disabled={initWalletLoading || !walletAdapter.publicKey || !isSeller}
                                              >
                                                {initWalletLoading ? 'Initializing…' : 'Init shares (Wallet)'}
                                              </Button>
                                              {!isSeller && (
                                                <span className="text-[11px] text-slate-500">
                                                  Only the seller of this invoice can initialize shares.
                                                </span>
                                              )}
                                            </>
                                          )
                                        })()
                                      )}
                                      {fxError ? <span className="text-[11px] text-red-600">{fxError}</span> : null}
                                    </>
                                  )
                                }
                                return (
                                  <>
                                    <div className="w-40">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.000001"
                                        title="Amount in USDC (6 decimals). Converted to base units on submit."
                                        value={fracAmount}
                                        onChange={(e) => setFracAmount(e.target.value)}
                                        placeholder="Amount (USDC)"
                                        className="h-8 text-[11px] bg-[#e7e7e7]"
                                      />
                                    </div>
                                    {mode === 'backend' ? (
                                      <Button
                                        variant="primary"
                                        size="sm"
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
                                              headers: { 'Content-Type': 'application/json', ...(adminWallet ? { 'x-admin-wallet': adminWallet } : {}) },
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
                                      >
                                        {fxLoading ? 'Funding…' : 'Fund fraction (Backend)'}
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={handleFundFractionWithWallet}
                                        disabled={fxWalletLoading || !walletAdapter.publicKey}
                                      >
                                        {fxWalletLoading ? 'Funding…' : 'Fund fraction (Wallet)'}
                                      </Button>
                                    )}
                                    {fxError ? <span className="text-[11px] text-red-600">{fxError}</span> : null}
                                  </>
                                )
                              })()}
                            </div>
                          </div>

                          {/* Positions */}
                          <div className="border-t border-slate-400 pt-4">
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-800">Positions</h3>
                            <div className="text-xs text-slate-700">
                              {positions.length === 0 ? (
                                <span className="text-slate-500">None</span>
                              ) : (
                                <div className="grid gap-2">
                                  {positions.map((p) => {
                                    const balanceLabel = (() => {
                                      try {
                                        const n = Number(p.amount) / 1_000_000
                                        return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares`
                                      } catch {
                                        return `${p.amount} shares`
                                      }
                                    })()
                                    return (
                                      <div
                                        key={p.wallet}
                                        className="rounded-md border border-slate-500 px-3 py-2 bg-[#e7e7e7]"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2 ">
                                          <span className="break-all font-mono text-xs text-slate-800 ">{p.wallet}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-slate-700">
                                          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                                            Balance
                                          </span>
                                          <span className="font-medium text-slate-800">{balanceLabel}</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Positions history */}
                          <div className="border-t border-slate-400 pt-4">
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-800">Positions history</h3>
                            <div className="text-xs text-slate-700">
                              <div className="mb-2 flex items-center gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => selected && loadHistory(selected)}
                                  loading={historyLoading}
                                >
                                  Refresh history
                                </Button>
                              </div>
                              {history.length === 0 ? (
                                <div className="text-slate-500">No recent changes</div>
                              ) : (
                                <div className="mt-1 grid gap-2">
                                  {history.map((h: { wallet: string; delta: string; newAmount: string; ts: number }, i: number) => {
                                    const parsed = (() => {
                                      try {
                                        const d = Number(h.delta) / 1_000_000
                                        const n = Number(h.newAmount) / 1_000_000
                                        return {
                                          deltaLabel: `${d >= 0 ? '+' : ''}${d.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares`,
                                          newLabel: `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares`,
                                          positive: d > 0,
                                          negative: d < 0,
                                        }
                                      } catch {
                                        return {
                                          deltaLabel: `${h.delta} shares`,
                                          newLabel: `${h.newAmount} shares`,
                                          positive: false,
                                          negative: false,
                                        }
                                      }
                                    })()
                                    const when = new Date(h.ts).toLocaleString()
                                    const changeBadgeClasses =
                                      'rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                                      (parsed.positive
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : parsed.negative
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-slate-100 text-slate-700')
                                    return (
                                      <div
                                        key={i}
                                        className="rounded-md border border-slate-500 px-3 py-2 bg-[#e7e7e7]"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="break-all font-mono text-xs text-slate-800">{h.wallet}</span>
                                          <span className="text-[11px] text-slate-700">{when}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                                              Change
                                            </span>
                                            <span className={changeBadgeClasses}>{parsed.deltaLabel}</span>
                                          </div>
                                          <div className="flex items-center gap-2 text-slate-600">
                                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                                              New balance
                                            </span>
                                            <span className="font-medium text-slate-800">{parsed.newLabel}</span>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              </motion.div>
            </div>
          ) : null}
        </div>
      </div>


    </div>
  )
}
