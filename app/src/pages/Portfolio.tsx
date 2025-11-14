import React, { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useToast } from '../components/Toast'

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'

type Holding = { invoice: string; sharesMint: string; amount: string }

export function Portfolio(){
  const wallet = useWallet()
  const { show } = useToast()
  const [items, setItems] = useState<Holding[]>([])
  const [loading, setLoading] = useState(false)
  const walletStr = useMemo(() => wallet.publicKey?.toBase58() || '', [wallet.publicKey])

  async function load(){
    if (!walletStr) return
    setLoading(true)
    try{
      const r = await fetch(`${backend}/api/portfolio/${walletStr}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      setItems(j.portfolio || [])
    }catch(e: any){ show({ text: e?.message || String(e), kind: 'error' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [walletStr])

  if (!walletStr) return (
    <div>
      <h2>Portfolio</h2>
      <div>Connect a wallet to view your portfolio.</div>
    </div>
  )

  function fmt(a: string){
    try { const n = Number(a) / 1_000_000; return n.toLocaleString(undefined, { maximumFractionDigits: 6 }) } catch { return a }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Portfolio</h2>
        <button onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>
      {items.length === 0 ? (
        <div style={{ marginTop: 8 }}>No holdings</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {items.map((h) => (
            <div key={`${h.invoice}:${h.sharesMint}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Invoice</div>
                <div style={{ fontFamily: 'monospace' }}>{h.invoice}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Shares</div>
                <div>{fmt(h.amount)} <a href={`https://solscan.io/address/${h.sharesMint}?cluster=devnet`} target="_blank">mint</a></div>
              </div>
              <div style={{ justifySelf: 'end' }}>
                <a href={`https://solscan.io/address/${h.invoice}?cluster=devnet`} target="_blank">View invoice on explorer</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
