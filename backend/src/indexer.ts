import { getProgram } from './anchor'
import { upsertInvoiceFromChain, setPositionsCache, getPositionsCache, recordPositionsDiffs, upsertListingFromChain } from './db'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export async function runIndexer() {
  const program = getProgram()
  const conn = (program.provider as any).connection

  // Track subscriptions per shares mint
  const subsByMint = new Map<string, number>()
  const mintToInvoice = new Map<string, string>()

  async function recomputePositionsForMint(invoicePk: string, sharesMintStr: string){
    try{
      const resp = await conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: sharesMintStr } },
        ],
      })
      const byOwner = new Map<string, bigint>()
      for (const r of resp) {
        try {
          const info: any = (r.account as any).data?.parsed?.info
          const owner: string = info?.owner || ''
          const amtStr: string = info?.tokenAmount?.amount ?? '0'
          const amt = BigInt(amtStr)
          if (owner && amt > 0n) {
            byOwner.set(owner, (byOwner.get(owner) ?? 0n) + amt)
          }
        } catch {}
      }
      const positions = Array.from(byOwner.entries()).map(([wallet, amount]) => ({ wallet, amount: amount.toString() }))
      // Diff vs cache
      try {
        const cache = getPositionsCache(invoicePk)
        const prev = new Map<string, bigint>()
        if (cache && Array.isArray(cache.positions)) {
          for (const p of cache.positions) {
            try { prev.set(String(p.wallet), BigInt(String(p.amount))) } catch {}
          }
        }
        const diffs: Array<{ wallet: string; delta: string; newAmount: string }> = []
        const wallets = new Set<string>([...prev.keys(), ...byOwner.keys()])
        for (const w of wallets) {
          const oldAmt = prev.get(w) ?? 0n
          const newAmt = byOwner.get(w) ?? 0n
          const delta = newAmt - oldAmt
          if (delta !== 0n) {
            diffs.push({ wallet: w, delta: delta.toString(), newAmount: newAmt.toString() })
          }
        }
        if (diffs.length) recordPositionsDiffs(invoicePk, diffs)
      } catch {}
      try { setPositionsCache(invoicePk, positions) } catch {}
    } catch {}
  }

  async function ensureSubscription(invoicePk: string, sharesMintStr: string){
    if (subsByMint.has(sharesMintStr)) return
    mintToInvoice.set(sharesMintStr, invoicePk)
    try{
      const subId = conn.onProgramAccountChange(
        TOKEN_PROGRAM_ID,
        async () => {
          const inv = mintToInvoice.get(sharesMintStr)
          if (inv) await recomputePositionsForMint(inv, sharesMintStr)
        },
        { filters: [ { dataSize: 165 }, { memcmp: { offset: 0, bytes: sharesMintStr } } ] } as any
      )
      subsByMint.set(sharesMintStr, subId)
    } catch {}
  }

  async function syncAll(){
    try{
      const invoices = await (program.account as any)['invoice'].all()
      let listings: Array<{ publicKey: any; account: any }> = []
      try {
        listings = await (program.account as any)['listing'].all()
      } catch {}

      for (const it of invoices){
        try { await upsertInvoiceFromChain(program, it.publicKey) } catch {}
        // Precompute positions for invoices with shares_mint
        try {
          const acct: any = it.account
          const sharesMintStr: string = acct?.sharesMint?.toBase58 ? acct.sharesMint.toBase58() : String(acct?.sharesMint || '')
          const DEFAULT_PK = '11111111111111111111111111111111'
          if (sharesMintStr && sharesMintStr !== DEFAULT_PK) {
            const resp = await conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
              filters: [
                { dataSize: 165 },
                { memcmp: { offset: 0, bytes: sharesMintStr } },
              ],
            })
            const byOwner = new Map<string, bigint>()
            for (const r of resp) {
              try {
                const info: any = (r.account as any).data?.parsed?.info
                const owner: string = info?.owner || ''
                const amtStr: string = info?.tokenAmount?.amount ?? '0'
                const amt = BigInt(amtStr)
                if (owner && amt > 0n) {
                  byOwner.set(owner, (byOwner.get(owner) ?? 0n) + amt)
                }
              } catch {}
            }
            const positions = Array.from(byOwner.entries()).map(([wallet, amount]) => ({ wallet, amount: amount.toString() }))
            // Diff vs cache
            try {
              const cache = getPositionsCache(it.publicKey.toBase58())
              const prev = new Map<string, bigint>()
              if (cache && Array.isArray(cache.positions)) {
                for (const p of cache.positions) {
                  try { prev.set(String(p.wallet), BigInt(String(p.amount))) } catch {}
                }
              }
              const diffs: Array<{ wallet: string; delta: string; newAmount: string }> = []
              const wallets = new Set<string>([...prev.keys(), ...byOwner.keys()])
              for (const w of wallets) {
                const oldAmt = prev.get(w) ?? 0n
                const newAmt = byOwner.get(w) ?? 0n
                const delta = newAmt - oldAmt
                if (delta !== 0n) {
                  diffs.push({ wallet: w, delta: delta.toString(), newAmount: newAmt.toString() })
                }
              }
              if (diffs.length) recordPositionsDiffs(it.publicKey.toBase58(), diffs)
            } catch {}
            try { setPositionsCache(it.publicKey.toBase58(), positions) } catch {}

            // Ensure live subscription for activity feed
            try { await ensureSubscription(it.publicKey.toBase58(), sharesMintStr) } catch {}
          }
        } catch {}
      }

      // Index on-chain listing accounts into SQLite listings table
      try {
        for (const lt of listings) {
          try {
            const acct: any = lt.account
            const invoicePk: string = acct?.invoice?.toBase58 ? acct.invoice.toBase58() : String(acct?.invoice || '')
            const sellerStr: string = acct?.seller?.toBase58 ? acct.seller.toBase58() : String(acct?.seller || '')
            if (!invoicePk || !sellerStr) continue
            const priceStr: string = acct?.price?.toString?.() ?? String(acct?.price ?? '0')
            const remainingStr: string = acct?.remainingQty?.toString?.() ?? String(acct?.remainingQty ?? '0')
            upsertListingFromChain({ invoicePk, seller: sellerStr, price: priceStr, remainingQty: remainingStr })
          } catch {}
        }
      } catch {}
    } catch (e: any) {
      try {
        console.error('indexer syncAll failed', e?.message || String(e))
      } catch {}
    }
  }
  await syncAll()
  const rawInterval = process.env.INDEXER_SYNC_MS ?? '30000'
  let intervalMs = Number(rawInterval)
  if (!Number.isFinite(intervalMs)) intervalMs = 30000
  if (intervalMs > 0) {
    setInterval(syncAll, intervalMs)
  }
}
