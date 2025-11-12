import { getProgram } from './anchor'
import { upsertInvoiceFromChain, setPositionsCache } from './db'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export async function runIndexer() {
  const program = getProgram()
  async function syncAll(){
    try{
      const all = await (program.account as any)['invoice'].all()
      for (const it of all){
        try { await upsertInvoiceFromChain(program, it.publicKey) } catch {}
        // Precompute positions for invoices with shares_mint
        try {
          const acct: any = it.account
          const sharesMintStr: string = acct?.sharesMint?.toBase58 ? acct.sharesMint.toBase58() : String(acct?.sharesMint || '')
          const DEFAULT_PK = '11111111111111111111111111111111'
          if (sharesMintStr && sharesMintStr !== DEFAULT_PK) {
            const conn = (program.provider as any).connection
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
            try { setPositionsCache(it.publicKey.toBase58(), positions) } catch {}
          }
        } catch {}
      }
    }catch{}
  }
  await syncAll()
  setInterval(syncAll, 30000)
}
