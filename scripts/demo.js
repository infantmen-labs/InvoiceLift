'use strict';
const { createHmac, randomBytes } = require('node:crypto');

const backend = process.env.BACKEND_URL || 'http://localhost:8080';
const signWebhook = process.env.SIGN_WEBHOOK === 'true';
const hmacSecret = process.env.HMAC_SECRET || '';

function txUrl(sig) { return `https://explorer.solana.com/tx/${sig}?cluster=devnet`; }

async function post(path, body, headers = {}) {
  const url = `${backend}${path}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `Request failed: ${res.status} ${res.statusText}`);
  return json;
}

async function get(path) {
  const url = `${backend}${path}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `Request failed: ${res.status} ${res.statusText}`);
  return json;
}

(async function main(){
  if (typeof fetch === 'undefined') {
    console.error('This script requires Node.js 18+ (global fetch).');
    process.exit(1);
  }

  const metadataHash = process.env.METADATA_HASH || 'demo-cid-or-hash';
  const amount = process.env.AMOUNT || '5000000';
  const dueDate = process.env.DUE_DATE || '1736294400';

  console.log('1) Minting sample invoice...');
  const mint = await post('/api/invoice/mint', { metadataHash, amount, dueDate });
  const invoice = mint.invoice;
  console.log('   invoice:', invoice);
  console.log('   mint tx:', txUrl(mint.tx));

  console.log('2) Creating escrow...');
  const escrow = await post(`/api/invoice/${invoice}/create-escrow`, {});
  console.log('   escrow tx:', txUrl(escrow.tx));

  console.log('3) Funding invoice...');
  const fund = await post(`/api/invoice/${invoice}/fund`, { amount });
  console.log('   fund tx:', txUrl(fund.tx));

  console.log('   fetching invoice state...');
  const inv1 = await get(`/api/invoice/${invoice}`);
  console.log('   status:', Object.keys(inv1.invoice.status)[0]);

  console.log('4) Settling via webhook...');
  const body = { invoice_id: invoice, amount };
  let headers = {};
  if (signWebhook) {
    if (!hmacSecret) throw new Error('SIGN_WEBHOOK=true but HMAC_SECRET missing');
    const ts = Date.now();
    const preimage = `${ts}.${JSON.stringify(body)}`;
    const sig = createHmac('sha256', hmacSecret).update(preimage).digest('hex');
    headers['x-hmac-timestamp'] = String(ts);
    headers['x-hmac-signature'] = sig;
    headers['x-idempotency-key'] = `demo-${ts}-${randomBytes(4).toString('hex')}`;
  }
  const settle = await post('/webhook/payment', body, headers);
  console.log('   settle tx:', txUrl(settle.tx));

  console.log('   fetching final invoice state...');
  const inv2 = await get(`/api/invoice/${invoice}`);
  console.log('   status:', Object.keys(inv2.invoice.status)[0]);

  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
