import React, { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
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
  const [items, setItems] = useState<Holding[]>([])
  const [loading, setLoading] = useState(false)

  function fmt(a: string){
    try { const n = Number(a) / 1_000_000; return n.toLocaleString(undefined, { maximumFractionDigits: 6 }) } catch { return a }
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
    try{
      const r = await fetch(`${backend}/api/portfolio/${walletStr}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      setItems(j.portfolio || [])
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
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
      <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Positions" value={stats.count.toString()} />
        <StatCard
          label="Total shares"
          value={stats.totalShares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">No holdings found for this wallet.</div>
      ) : (
        <div className="grid gap-3">
          {items.map((h) => (
            <Card key={`${h.invoice}:${h.sharesMint}`}>
              <CardBody className="grid gap-2 text-sm sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.6fr)] sm:items-center">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Invoice</div>
                  <div className="font-mono break-all text-slate-800">{h.invoice}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Shares</div>
                  <div className="text-slate-800">
                    {fmt(h.amount)}{' '}
                    <a
                      href={`https://solscan.io/address/${h.sharesMint}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:text-brand-dark"
                    >
                      mint
                    </a>
                  </div>
                </div>
                <div className="mt-2 justify-self-start text-xs text-brand sm:mt-0 sm:justify-self-end">
                  <a
                    href={`https://solscan.io/address/${h.invoice}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-brand-dark"
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
