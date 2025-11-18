import React from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'outline'

export function Badge({ children, variant = 'default', className = '' }: { children: React.ReactNode; variant?: BadgeVariant; className?: string }){
  const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium'
  const variants: Record<BadgeVariant, string> = {
    default: 'border-slate-200 bg-slate-100 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    outline: 'border-slate-300 text-slate-700',
  }
  return (
    <span className={[base, variants[variant], className].join(' ')}>{children}</span>
  )
}
