import { logger } from './logger'

export function validateConfig(){
  const NODE_ENV = process.env.NODE_ENV || 'development'
  const issues: Array<{ level: 'warn' | 'error'; msg: string }> = []

  const REQUIREMENTS = [
    { key: 'PROGRAM_ID', required: true },
    { key: 'USDC_MINT', required: true },
  ] as const

  for (const r of REQUIREMENTS){
    const v = process.env[r.key]
    if (!v || String(v).trim().length === 0) {
      issues.push({ level: 'warn', msg: `missing ${r.key}` })
    }
  }

  if (process.env.ENABLE_HMAC === 'true' && !process.env.HMAC_SECRET){
    issues.push({ level: 'warn', msg: 'ENABLE_HMAC=true but HMAC_SECRET is not set' })
  }

  if ((process.env.LISTINGS_REQUIRE_SIG ?? 'true') !== 'false'){
    // Signature verification is enabled by default; ensure tolerance present
    const tol = Number(process.env.LISTING_SIG_TOL_SEC ?? '300')
    if (!Number.isFinite(tol) || tol <= 0) {
      issues.push({ level: 'warn', msg: 'invalid LISTING_SIG_TOL_SEC, defaulting to 300' })
    }
  }

  if (process.env.FAUCET_ENABLED === 'true' && NODE_ENV !== 'development'){
    issues.push({ level: 'warn', msg: 'FAUCET_ENABLED=true outside development' })
  }

  const admins = String(process.env.ADMIN_WALLETS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (admins.length === 0){
    issues.push({ level: 'info' as any, msg: 'ADMIN_WALLETS not set; admin-gated endpoints will be inaccessible' })
  }

  for (const it of issues){
    if (it.level === 'error') logger.error({ key: 'config' }, it.msg)
    else if (it.level === 'warn') logger.warn({ key: 'config' }, it.msg)
    else logger.info({ key: 'config' }, it.msg)
  }

  return { env: NODE_ENV, issues }
}
