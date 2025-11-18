import React from 'react'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return (
    <div className={['rounded-lg border border-slate-200 bg-slate-100 shadow-sm', className].join(' ')}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return (
    <div className={['flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3', className].join(' ')}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }){
  return <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
}

export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return <div className={['px-4 py-3 text-sm text-slate-700', className].join(' ')}>{children}</div>
}
