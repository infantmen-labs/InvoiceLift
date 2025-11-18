import React from 'react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(props, ref){
  const { className = '', children, ...rest } = props
  return (
    <select
      ref={ref}
      className={[
        'flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
        'shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </select>
  )
})
