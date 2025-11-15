type Level = 'debug' | 'info' | 'warn' | 'error'

function envLevel(): Level {
  const v = String(process.env.LOG_LEVEL || 'info').toLowerCase()
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v
  return 'info'
}

const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const current = envLevel()

function shouldLog(l: Level){ return levelOrder[l] >= levelOrder[current] }

function write(level: Level, msg: string, meta?: any){
  if (!shouldLog(level)) return
  const entry: any = { level, msg, time: new Date().toISOString() }
  if (meta && typeof meta === 'object') {
    try {
      for (const k of Object.keys(meta)) entry[k] = (meta as any)[k]
    } catch {}
  }
  try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(entry)) } catch {
    try { console.log(`[${level}] ${msg}`) } catch {}
  }
}

export const logger = Object.freeze({
  level: current,
  debug(metaOrMsg: any, maybeMsg?: string){
    if (typeof metaOrMsg === 'string') return write('debug', metaOrMsg)
    return write('debug', maybeMsg || 'debug', metaOrMsg)
  },
  info(metaOrMsg: any, maybeMsg?: string){
    if (typeof metaOrMsg === 'string') return write('info', metaOrMsg)
    return write('info', maybeMsg || 'info', metaOrMsg)
  },
  warn(metaOrMsg: any, maybeMsg?: string){
    if (typeof metaOrMsg === 'string') return write('warn', metaOrMsg)
    return write('warn', maybeMsg || 'warn', metaOrMsg)
  },
  error(metaOrMsg: any, maybeMsg?: string){
    if (typeof metaOrMsg === 'string') return write('error', metaOrMsg)
    return write('error', maybeMsg || 'error', metaOrMsg)
  },
  child(bindings: Record<string, any>){
    return {
      debug: (metaOrMsg: any, maybeMsg?: string) => {
        if (typeof metaOrMsg === 'string') return write('debug', metaOrMsg, bindings)
        return write('debug', maybeMsg || 'debug', { ...bindings, ...metaOrMsg })
      },
      info: (metaOrMsg: any, maybeMsg?: string) => {
        if (typeof metaOrMsg === 'string') return write('info', metaOrMsg, bindings)
        return write('info', maybeMsg || 'info', { ...bindings, ...metaOrMsg })
      },
      warn: (metaOrMsg: any, maybeMsg?: string) => {
        if (typeof metaOrMsg === 'string') return write('warn', metaOrMsg, bindings)
        return write('warn', maybeMsg || 'warn', { ...bindings, ...metaOrMsg })
      },
      error: (metaOrMsg: any, maybeMsg?: string) => {
        if (typeof metaOrMsg === 'string') return write('error', metaOrMsg, bindings)
        return write('error', maybeMsg || 'error', { ...bindings, ...metaOrMsg })
      },
    }
  }
})
