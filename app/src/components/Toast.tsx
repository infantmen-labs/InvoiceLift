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
      <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, display: 'grid', gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: t.kind === 'error' ? '#fee2e2' : t.kind === 'success' ? '#ecfdf5' : '#f3f4f6',
            color: '#111827',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            borderRadius: 8,
            padding: '10px 12px',
            maxWidth: 420,
            wordBreak: 'break-word'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <div style={{ fontSize: 14 }}>{t.text}</div>
              {t.href ? <a style={{ fontSize: 12 }} href={t.href} target="_blank" rel="noreferrer">{t.linkText || 'View'}</a> : null}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(){
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
