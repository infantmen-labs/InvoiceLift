import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type Toast = {
  id: string
  text: string
  href?: string
  linkText?: string
  kind?: 'info' | 'success' | 'error'
  ttlMs?: number
}

type ToastCtx = {
  show: (t: Omit<Toast, 'id'>) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }){
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const ttl = t.ttlMs ?? 7000
    const toast: Toast = { id, ...t }
    setToasts((arr) => [...arr, toast])
    setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== id))
    }, ttl)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => {
          const base = 'pointer-events-auto max-w-sm rounded-lg border px-3 py-2 shadow-md bg-white text-sm'
          const kind =
            t.kind === 'error'
              ? 'border-danger/40 bg-red-50 text-danger'
              : t.kind === 'success'
              ? 'border-success/40 bg-emerald-50 text-success'
              : 'border-slate-200 bg-slate-50 text-slate-900'
          return (
            <div
              key={t.id}
              className={[base, kind].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm leading-snug">{t.text}</div>
                {t.href ? (
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand hover:text-brand-dark"
                  >
                    {t.linkText || 'View'}
                  </a>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(){
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
