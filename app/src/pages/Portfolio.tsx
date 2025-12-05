import React, { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card'
import { StatCard } from '../components/ui/StatCard'

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'

type Holding = { invoice: string; sharesMint: string; amount: string }

export function Portfolio(){
  const wallet = useWallet()
  const walletStr = useMemo(() => wallet.publicKey?.toBase58() || '', [wallet.publicKey])

  if (!walletStr) return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-300">
            Connect a wallet to view your invoice share holdings.
          </p>
        </CardBody>
      </Card>
    </div>
  )

  return <PortfolioConnected walletStr={walletStr} />
}

function PortfolioConnected({ walletStr }: { walletStr: string }){
  const { show } = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState<Holding[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fmt(a: string){
    try { const n = Number(a) / 1_000_000; return n.toLocaleString(undefined, { maximumFractionDigits: 6 }) } catch { return a }
  }

  function friendlyError(msg: string){
    const m = (msg || '').toString()
    const lower = m.toLowerCase()
    if (lower.includes('failed to fetch') || lower.includes('networkerror')){
      return 'Could not reach the InvoiceLift backend. Make sure the backend server is running and reachable from this browser.'
    }
    if (m.includes('429')){
      return 'The RPC or indexer is currently rate-limited. Wait a few seconds, then press Refresh.'
    }
    if (m.includes('getProgramAccounts is not available on the Free tier')){
      return 'The configured RPC provider free tier is blocking indexer queries. Use a different or upgraded RPC URL to see portfolio data.'
    }
    return m
  }

  const stats = useMemo(() => {
    if (!items.length) return { count: 0, totalShares: 0 }
    let totalShares = 0
    for (const h of items){
      const n = Number(h.amount || '0') / 1_000_000
      if (Number.isFinite(n)) totalShares += n
    }
    return { count: items.length, totalShares }
  }, [items])

  async function load(){
    setLoading(true)
    setError(null)
    try{
      const r = await fetch(`${backend}/api/portfolio/${walletStr}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      setItems(j.portfolio || [])
    }catch(e: any){
      const msg = e?.message || String(e)
      const friendly = friendlyError(msg)
      setError(friendly)
      show({ text: friendly, kind: 'error' })
      setItems([])
    }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
  }, [walletStr])

  return (
    <div className="mt-6 space-y-4 px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-[#8437EB]">Portfolio</h2>
          <p className="text-xs text-slate-300">
            Invoice share positions held by the connected wallet on devnet.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          loading={loading}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          {error}
        </div>
      )}
      <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Positions" value={stats.count.toString()} />
        <StatCard
          label="Total shares"
          value={stats.totalShares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
      </div>
      {loading && !items.length ? (
        <div className="mt-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 w-full max-w-2xl rounded-xl border border-slate-800/60 bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-2 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-400">
          No holdings found for this wallet yet. After you fund an invoice or buy shares in the Marketplace, your
          positions will appear here.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((h) => (
            <Card
              key={`${h.invoice}:${h.sharesMint}`}
              className="border-slate-700/70 bg-slate-900/40 shadow-sm shadow-slate-900/40 backdrop-blur-sm"
            >
              <CardBody className="grid gap-2 text-sm text-slate-100 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.6fr)] sm:items-center">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Invoice</div>
                  <button
                    type="button"
                    className="font-mono break-all text-left text-slate-50 hover:text-indigo-300 underline-offset-2 hover:underline"
                    onClick={() => navigate(`/invoice/${h.invoice}`)}
                  >
                    {h.invoice}
                  </button>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Shares</div>
                  <div className="text-slate-50">
                    {fmt(h.amount)}{' '}
                    <a
                      href={`https://solscan.io/address/${h.sharesMint}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                    >
                      mint
                    </a>
                  </div>
                </div>
                <div className="mt-2 justify-self-start text-xs text-indigo-300 sm:mt-0 sm:justify-self-end">
                  <a
                    href={`https://solscan.io/address/${h.invoice}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-indigo-200 underline-offset-2 hover:underline"
                  >
                    View invoice on explorer
                  </a>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
