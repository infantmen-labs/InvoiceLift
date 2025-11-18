import React from 'react'

export interface FormGroupProps {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  help?: string
  className?: string
  children: React.ReactNode
}

export function FormGroup({ label, htmlFor, required, error, help, className = '', children }: FormGroupProps){
  return (
    <div className={['space-y-1 text-sm', className].join(' ')}>
      <label
        htmlFor={htmlFor}
        className="flex items-center justify-between text-xs font-medium text-slate-700"
      >
        <span>
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </span>
        {error ? <span className="text-[11px] font-medium text-red-600">{error}</span> : null}
      </label>
      {children}
      {help && !error ? (
        <p className="text-[11px] text-slate-500">{help}</p>
      ) : null}
    </div>
  )
}
