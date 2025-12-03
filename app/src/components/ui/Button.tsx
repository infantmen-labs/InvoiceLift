import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const base = 'inline-flex items-center justify-center rounded-lg border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-[#012d4f] text-slate-100 border-slate-300 border-transparent hover:bg-[#00192E]',
  secondary: 'bg-[#012d4f] text-slate-100 border-slate-300 hover:bg-[#00192E]',
  ghost: 'bg-transparent text-slate-700 border-transparent hover:bg-slate-100',
  danger: 'bg-danger text-white border-transparent hover:bg-red-600',
}
const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, ...rest }: ButtonProps){
  return (
    <button
      className={[base, variants[variant], sizes[size], className].join(' ')}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? 'Loading…' : children}
    </button>
  )
}
