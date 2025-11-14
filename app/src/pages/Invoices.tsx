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

export function Invoices() {
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

  function bytesToBase64(bytes: Uint8Array){
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }

  async function handleRevokeSharesV2(id: number){
    if (!walletAdapter.publicKey) { show({ text: 'Connect wallet first', kind: 'error' }); return }
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
    const priceBase = Math.round(p * 1_000_000)
    const qtyBase = Math.round(q * 1_000_000)
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
              <button onClick={() => { setSelected(null); setDetail(null); setPositions([]); setHistory([]); setListings([]) }}>Close</button>
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
                <div>{detailDb?.status || (detail.status ? Object.keys(detail.status)[0] : 'unknown')}</div>
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
                <div>{(() => {
                  const raw = (detailDb?.amount ?? (detail?.amount as any))
                  if (raw && typeof raw === 'object' && 'toNumber' in raw) return fmt6((raw as any).toNumber())
                  return fmt6(raw)
                })()} USDC</div>
                <div>Funded</div>
                <div>{(() => {
                  const raw = (detailDb?.fundedAmount ?? (detail?.fundedAmount as any))
                  if (raw && typeof raw === 'object' && 'toNumber' in raw) return fmt6((raw as any).toNumber())
                  return fmt6(raw)
                })()} USDC</div>
                <div>Due Date</div>
                <div>{fmtDateSmart(detail.dueDate)}</div>
                <div>Links</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`https://solscan.io/address/${selected}?cluster=devnet`} target="_blank">Invoice</a>
                  {detail.usdcMint ? <a href={`https://solscan.io/address/${detail.usdcMint}?cluster=devnet`} target="_blank">USDC Mint</a> : null}
                </div>
                <div>Listings</div>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(() => {
                      const me = walletAdapter.publicKey?.toBase58()
                      const canList = !!me
                      return (
                        <>
                          <input type="number" min="0" step="0.000001" title="Price per share in USDC (6 decimals). Converted to base units on submit." value={listPrice} onChange={(e) => setListPrice(e.target.value)} placeholder="Price (USDC/share)" style={{ width: 160 }} />
                          <input type="number" min="0" step="0.000001" title="Quantity in shares (6 decimals). Converted to base units on submit." value={listQty} onChange={(e) => setListQty(e.target.value)} placeholder="Qty (shares)" style={{ width: 160 }} />
                          <button onClick={handleCreateListing} disabled={!canList || createListingLoading}>{createListingLoading ? 'Creating...' : 'Create Listing'}</button>
                          {!canList ? <span style={{ color: '#6b7280' }}>Connect wallet to list shares</span> : null}
                        </>
                      )
                    })()}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {listingsLoading ? 'Loading listings...' : (
                      listings.length === 0 ? 'No listings' : (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {listings.map((l) => {
                            const price = Number(l.price) / 1_000_000
                            const remain = Number(l.remainingQty) / 1_000_000
                            const me = walletAdapter.publicKey?.toBase58()
                            const isMyListing = me === l.seller
                            const canCancel = isMyListing && l.status === 'Open'
                            const canFill = l.status === 'Open'
                            return (
                              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', alignItems: 'center', gap: 8 }}>
                                <div><span style={{ fontFamily: 'monospace' }}>{l.seller}</span> {isMyListing ? <span style={{ color: '#10b981', fontSize: '0.85em' }}>(you)</span> : null}</div>
                                <div>{price} USDC/share</div>
                                <div>{remain} shares {l.escrowDeposited ? <span style={{ color: '#6b7280', fontSize: '0.85em' }}>(deposited)</span> : null}</div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  {canCancel ? <button onClick={() => handleCancelListing(l.id)}>Cancel</button> : null}
                                  {!allowanceEnabled && canCancel && !depositedIds[l.id] && !l.escrowDeposited ? (
                                    <button onClick={() => handleDepositListingOnchain(l.id)} disabled={depositLoadingId === l.id}>{depositLoadingId === l.id ? 'Depositing...' : 'Deposit Shares'}</button>
                                  ) : null}
                                  {allowanceEnabled && isMyListing && l.status === 'Open' && !l.onChain ? (
                                    <button onClick={() => handleInitListingV2(l.id)} disabled={initV2LoadingId === l.id}>{initV2LoadingId === l.id ? 'Initializing...' : 'Init On-chain (V2)'}</button>
                                  ) : null}
                                  {allowanceEnabled && isMyListing && l.status === 'Open' ? (
                                    <button onClick={() => handleApproveSharesV2(l.id)} disabled={approveSharesLoadingId === l.id}>{approveSharesLoadingId === l.id ? 'Approving...' : 'Approve Shares'}</button>
                                  ) : null}
                                  {allowanceEnabled && isMyListing && l.status === 'Open' ? (
                                    <button onClick={() => handleRevokeSharesV2(l.id)}>Revoke Shares</button>
                                  ) : null}
                                  {allowanceEnabled && isMyListing && l.status === 'Open' ? (
                                    <button onClick={() => handleCancelListingOnchainV2(l.id)}>Cancel On-chain (V2)</button>
                                  ) : null}
                                  {canFill ? (
                                    <>
                                      <input type="number" min="0" step="0.000001" title="Quantity to buy in shares (6 decimals)." value={fillQtyById[l.id] || ''} onChange={(e) => setFillQtyById((m) => ({ ...m, [l.id]: e.target.value }))} placeholder="Qty (shares)" style={{ width: 100 }} />
                                      {allowanceEnabled ? (
                                        <>
                                          <button onClick={() => handleApproveUsdcV2(l.id)} disabled={approveUsdcLoadingId === l.id}>{approveUsdcLoadingId === l.id ? 'Approving...' : 'Approve USDC'}</button>
                                          <button onClick={() => handleRevokeUsdcV2(l.id)}>Revoke USDC</button>
                                          <button onClick={() => handleFulfillListingOnchainV2(l.id)} disabled={fillLoadingId === l.id}>{fillLoadingId === l.id ? 'Filling...' : 'Fill On-chain (V2)'}</button>
                                        </>
                                      ) : (
                                        <button onClick={() => handleFulfillListingOnchain(l.id)} disabled={fillLoadingId === l.id}>{fillLoadingId === l.id ? 'Filling...' : 'Fill On-chain'}</button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span>{l.status}</span>
                                      {canCancel ? <button onClick={() => handleCancelListingOnchain(l.id)}>Cancel On-chain</button> : null}
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}
                  </div>
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
                          type="number"
                          min="0"
                          step="0.000001"
                          title="Amount in USDC (6 decimals). Converted to base units on submit."
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
                    <div style={{ display: 'grid', gap: 4 }}>
                      {positions.map(p => (
                        <div key={p.wallet} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace' }}>{p.wallet}</span>
                          <span>—</span>
                          <span>{Number(p.amount)/1_000_000} shares</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>Positions History</div>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => selected && loadHistory(selected)} disabled={historyLoading}>{historyLoading ? 'Loading...' : 'Refresh history'}</button>
                  </div>
                  {history.length === 0 ? (
                    <div style={{ marginTop: 4 }}>No recent changes</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                      {history.map((h: { wallet: string; delta: string; newAmount: string; ts: number }, i: number) => {
                        const delta = (() => { try { const n = Number(h.delta)/1_000_000; return (n>=0?'+':'') + n.toLocaleString(undefined,{maximumFractionDigits:6}) } catch { return h.delta } })()
                        const na = (() => { try { const n = Number(h.newAmount)/1_000_000; return n.toLocaleString(undefined,{maximumFractionDigits:6}) } catch { return h.newAmount } })()
                        const when = new Date(h.ts).toLocaleString()
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <span style={{ fontFamily: 'monospace' }}>{h.wallet}</span>
                            <span>Δ {delta} → {na}</span>
                            <span style={{ color: '#6b7280' }}>{when}</span>
                          </div>
                        )
                      })}
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
