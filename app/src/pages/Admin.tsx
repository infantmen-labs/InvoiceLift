import React, { useState } from 'react'
import { useSignerMode } from '../state/signerMode'

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'

export function Admin(){
  const { isAdmin, adminWallet } = useSignerMode()
  const [kycRead, setKycRead] = useState<any | null>(null)
  const [docCountHint, setDocCountHint] = useState<string>('')
  const [scoreRead, setScoreRead] = useState<any | null>(null)

  async function post(path: string, body: any){
    const r = await fetch(`${backend}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(adminWallet ? { 'x-admin-wallet': adminWallet } : {}) },
      body: JSON.stringify(body)
    })
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'request failed')
    return j
  }

  if (!isAdmin) {
    return (
      <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
        <h2>Admin</h2>
        <div style={{ color: '#888' }}>Admin features require an admin wallet configured in VITE_ADMIN_WALLETS.</div>
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
      <h2>Admin</h2>

      <div style={{ display: 'grid', gap: 16 }}>
        <section style={{ border: '1px solid #eee', padding: 12 }}>
          <h3>KYC Editor</h3>
          <form onSubmit={async (e) => {
            e.preventDefault()
            const f = e.currentTarget as HTMLFormElement
            const d = new FormData(f)
            const wallet = String(d.get('wallet') || '')
            const status = String(d.get('status') || '')
            const provider = String(d.get('provider') || '') || undefined
            const reference = String(d.get('reference') || '') || undefined
            const payloadStr = String(d.get('payload') || '')
            let payload: any = undefined
            if (payloadStr) { try { payload = JSON.parse(payloadStr) } catch { payload = undefined } }
            const j = await post('/api/kyc', { wallet, status, provider, reference, payload })
            alert(`KYC upserted: ${j.kyc.wallet} -> ${j.kyc.status}`)
            f.reset()
          }} style={{ display: 'grid', gap: 8 }}>
            <input name="wallet" placeholder="Wallet (base58)" required />
            <select name="status" defaultValue="approved">
              <option value="approved">approved</option>
              <option value="review">review</option>
              <option value="rejected">rejected</option>
            </select>
            <input name="provider" placeholder="Provider (optional)" />
            <input name="reference" placeholder="Reference (optional)" />
            <textarea name="payload" placeholder='Payload JSON (optional)' rows={3} />
            <button type="submit">Save KYC</button>
          </form>

          <div style={{ marginTop: 8 }}>
            <form onSubmit={async (e) => {
              e.preventDefault()
              const f = e.currentTarget as HTMLFormElement
              const d = new FormData(f)
              const wallet = String(d.get('wallet') || '')
              const r = await fetch(`${backend}/api/kyc/${wallet}`)
              if (r.status === 404) { setKycRead({ notFound: true, wallet }); return }
              const j = await r.json()
              setKycRead(j.kyc)
            }}>
              <input name="wallet" placeholder="Lookup KYC (wallet)" />
              <button type="submit">Lookup</button>
            </form>
            {kycRead && (
              <pre style={{ background: '#fafafa', padding: 8, marginTop: 8 }}>{JSON.stringify(kycRead, null, 2)}</pre>
            )}
          </div>
        </section>

        <section style={{ border: '1px solid #eee', padding: 12 }}>
          <h3>Documents</h3>
          <form onSubmit={async (e) => {
            e.preventDefault()
            const f = e.currentTarget as HTMLFormElement
            const d = new FormData(f)
            const invoice = String(d.get('invoice') || '')
            const hash = String(d.get('hash') || '')
            const cid = String(d.get('cid') || '') || undefined
            const j = await post(`/api/invoice/${invoice}/document`, { hash, cid, uploader: adminWallet || undefined })
            alert(`Doc recorded: id=${j.document.id}`)
            f.reset()
            try {
              const docs = await (await fetch(`${backend}/api/invoice/${invoice}/documents`)).json()
              setDocCountHint(`${docs.documents.length} total docs for invoice`)
            } catch {}
          }} style={{ display: 'grid', gap: 8 }}>
            <input name="invoice" placeholder="Invoice (pubkey)" required />
            <input name="hash" placeholder="SHA-256 (64 hex)" required />
            <input name="cid" placeholder="CID (optional)" />
            <button type="submit">Add Document</button>
            {docCountHint && <div style={{ color: '#555' }}>{docCountHint}</div>}
          </form>
        </section>

        <section style={{ border: '1px solid #eee', padding: 12 }}>
          <h3>Credit Score</h3>
          <form onSubmit={async (e) => {
            e.preventDefault()
            const f = e.currentTarget as HTMLFormElement
            const d = new FormData(f)
            const invoice = String(d.get('invoice') || '')
            const score = Number(String(d.get('score') || '0'))
            const reason = String(d.get('reason') || '') || undefined
            const j = await post(`/api/invoice/${invoice}/score`, { score, reason })
            alert(`Score saved: ${j.score.score} (${j.score.riskLabel})`)
            f.reset()
          }} style={{ display: 'grid', gap: 8 }}>
            <input name="invoice" placeholder="Invoice (pubkey)" required />
            <input name="score" placeholder="Score (number)" required />
            <input name="reason" placeholder="Reason (optional)" />
            <button type="submit">Save Score</button>
          </form>

          <div style={{ marginTop: 8 }}>
            <form onSubmit={async (e) => {
              e.preventDefault()
              const f = e.currentTarget as HTMLFormElement
              const d = new FormData(f)
              const invoice = String(d.get('invoice') || '')
              const r = await fetch(`${backend}/api/invoice/${invoice}/score`)
              if (r.status === 404) { setScoreRead({ notFound: true, invoice }); return }
              const j = await r.json()
              setScoreRead(j.score)
            }}>
              <input name="invoice" placeholder="Lookup Score (invoice)" />
              <button type="submit">Lookup</button>
            </form>
            {scoreRead && (
              <pre style={{ background: '#fafafa', padding: 8, marginTop: 8 }}>{JSON.stringify(scoreRead, null, 2)}</pre>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
