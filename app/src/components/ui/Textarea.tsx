import React from 'react'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(props, ref){
  const { className = '', ...rest } = props
  return (
    <textarea
      ref={ref}
      className={[
        'w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50',
        'placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'min-h-[80px]',
        className,
      ].join(' ')}
      {...rest}
    />
  )
})
