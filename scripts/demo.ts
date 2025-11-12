// usage: npx ts-node scripts/demo.ts
// usage: BACKEND_URL=http://localhost:8080 HMAC_SECRET=dev-secret SIGN_WEBHOOK=true npx ts-node scripts/demo.ts
import crypto from 'crypto'
declare const fetch: any

const backend = process.env.BACKEND_URL || 'http://localhost:8080'
const signWebhook = process.env.SIGN_WEBHOOK === 'true'
const hmacSecret = process.env.HMAC_SECRET || ''

function txUrl(sig: string){
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`
}

async function post(path: string, body: any, headers: Record<string,string> = {}){
  const url = `${backend}${path}`
  const res = await (fetch as any)(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  const json = await res.json()
  if(!json.ok){
    throw new Error(json.error || `Request failed: ${res.status} ${res.statusText}`)
  }
  return json
}

async function get(path: string){
  const url = `${backend}${path}`
  const res = await (fetch as any)(url)
  const json = await res.json()
  if(!json.ok){
    throw new Error(json.error || `Request failed: ${res.status} ${res.statusText}`)
  }
  return json
}

async function main(){
  const metadataHash = 'demo-cid-or-hash'
  const amount = '5000000'
  const dueDate = '1736294400'

  console.log('1) Minting sample invoice...')
  const mint = await post('/api/invoice/mint', { metadataHash, amount, dueDate })
  const invoice: string = mint.invoice
  console.log('   invoice:', invoice)
  console.log('   mint tx:', txUrl(mint.tx))

  console.log('2) Creating escrow...')
  const escrow = await post(`/api/invoice/${invoice}/create-escrow`, {})
  console.log('   escrow tx:', txUrl(escrow.tx))
  console.log('3) Funding invoice...')
  const fund = await post(`/api/invoice/${invoice}/fund`, { amount })
  console.log('   fund tx:', txUrl(fund.tx))
  console.log('   fetching invoice state...')
  const inv1 = await get(`/api/invoice/${invoice}`)
  console.log('   status:', Object.keys(inv1.invoice.status)[0])
  console.log('4) Simulating buyer settlement via webhook...')
  const body = { invoice_id: invoice, amount }
  let headers: Record<string,string> = {}
  if(signWebhook){
    if(!hmacSecret) throw new Error('SIGN_WEBHOOK=true set but HMAC_SECRET is missing')
    const sig = crypto.createHmac('sha256', hmacSecret).update(JSON.stringify(body)).digest('hex')
    headers['x-hmac-signature'] = sig
  }
  const settle = await post('/webhook/payment', body, headers)
  console.log('   settle tx:', txUrl(settle.tx))
  console.log('   fetching final invoice state...')
  const inv2 = await get(`/api/invoice/${invoice}`)
  console.log('   status:', Object.keys(inv2.invoice.status)[0])
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
