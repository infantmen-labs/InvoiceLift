import React, { useState } from 'react'
import { useSignerMode } from '../state/signerMode'
import { useToast } from '../components/Toast'
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'

const backend = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080'

export function Admin(){
  const { isAdmin, adminWallet } = useSignerMode()
  const { show } = useToast()
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
      <div className="mt-6">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Admin</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-700">
              Admin features require an admin wallet configured in <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-mono text-slate-900">VITE_ADMIN_WALLETS</code>.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Connect an admin wallet to access KYC, documents, and credit score tools for this devnet sandbox.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Admin</h2>
        <p className="text-xs text-slate-500">Devnet-only tools for editing KYC, documents, and credit scores.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 md:items-start">
        {/* KYC */}
        <Card className="md:col-span-1 bg-white">
          <CardHeader>
            <CardTitle>KYC editor</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <form
              onSubmit={async (e) => {
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
                show({ text: `KYC upserted: ${j.kyc.wallet} → ${j.kyc.status}`, kind: 'success' })
                f.reset()
              }}
              className="grid gap-2"
            >
              <Input name="wallet" placeholder="Wallet (base58)" required />
              <select
                name="status"
                defaultValue="approved"
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
              >
                <option value="approved">approved</option>
                <option value="review">review</option>
                <option value="rejected">rejected</option>
              </select>
              <Input name="provider" placeholder="Provider (optional)" />
              <Input name="reference" placeholder="Reference (optional)" />
              <Textarea name="payload" placeholder="Payload JSON (optional)" rows={3} className="font-mono text-xs" />
              <Button type="submit" size="sm">Save KYC</Button>
            </form>

            <div className="border-t border-slate-200 pt-2">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const f = e.currentTarget as HTMLFormElement
                  const d = new FormData(f)
                  const wallet = String(d.get('wallet') || '')
                  const r = await fetch(`${backend}/api/kyc/${wallet}`)
                  if (r.status === 404) { setKycRead({ notFound: true, wallet }); return }
                  const j = await r.json()
                  setKycRead(j.kyc)
                }}
                className="flex flex-col gap-2"
              >
                <Input name="wallet" placeholder="Lookup KYC (wallet)" />
                <Button type="submit" size="sm" variant="secondary">Lookup</Button>
              </form>
              {kycRead && (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-100">{JSON.stringify(kycRead, null, 2)}</pre>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Documents */}
        <Card className="md:col-span-1 bg-white">
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const f = e.currentTarget as HTMLFormElement
                const d = new FormData(f)
                const invoice = String(d.get('invoice') || '')
                const hash = String(d.get('hash') || '')
                const cid = String(d.get('cid') || '') || undefined
                const j = await post(`/api/invoice/${invoice}/document`, { hash, cid, uploader: adminWallet || undefined })
                show({ text: `Document recorded: id=${j.document.id}`, kind: 'success' })
                f.reset()
                try {
                  const docs = await (await fetch(`${backend}/api/invoice/${invoice}/documents`)).json()
                  setDocCountHint(`${docs.documents.length} total docs for invoice`)
                } catch {}
              }}
              className="grid gap-2"
            >
              <Input name="invoice" placeholder="Invoice (pubkey)" required />
              <Input name="hash" placeholder="SHA-256 (64 hex)" required />
              <Input name="cid" placeholder="CID (optional)" />
              <Button type="submit" size="sm">Add document</Button>
              {docCountHint && <div className="text-xs text-slate-500">{docCountHint}</div>}
            </form>
          </CardBody>
        </Card>

        {/* Credit score */}
        <Card className="md:col-span-1 bg-white">
          <CardHeader>
            <CardTitle>Credit score</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const f = e.currentTarget as HTMLFormElement
                const d = new FormData(f)
                const invoice = String(d.get('invoice') || '')
                const score = Number(String(d.get('score') || '0'))
                const reason = String(d.get('reason') || '') || undefined
                const j = await post(`/api/invoice/${invoice}/score`, { score, reason })
                show({ text: `Score saved: ${j.score.score} (${j.score.riskLabel})`, kind: 'success' })
                f.reset()
              }}
              className="grid gap-2"
            >
              <Input name="invoice" placeholder="Invoice (pubkey)" required />
              <Input name="score" placeholder="Score (number)" required />
              <Input name="reason" placeholder="Reason (optional)" />
              <Button type="submit" size="sm">Save score</Button>
            </form>

            <div className="pt-2 border-t border-slate-800">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const f = e.currentTarget as HTMLFormElement
                  const d = new FormData(f)
                  const invoice = String(d.get('invoice') || '')
                  const r = await fetch(`${backend}/api/invoice/${invoice}/score`)
                  if (r.status === 404) { setScoreRead({ notFound: true, invoice }); return }
                  const j = await r.json()
                  setScoreRead(j.score)
                }}
                className="flex flex-col gap-2"
              >
                <Input name="invoice" placeholder="Lookup score (invoice)" />
                <Button type="submit" size="sm" variant="secondary">Lookup</Button>
              </form>
              {scoreRead && (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-100">{JSON.stringify(scoreRead, null, 2)}</pre>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <p className="pt-2 text-[11px] text-slate-500">
        These tools are intended for devnet testing only. Do not use real customer data.
      </p>
    </div>
  )
}
