import React from 'react'

export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return (
    <table className={['w-full border-separate border-spacing-y-1 text-sm', className].join(' ')}>
      {children}
    </table>
  )
}

export function TableHeader({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return <thead className={['text-xs font-medium uppercase tracking-wide text-slate-500', className].join(' ')}>{children}</thead>
}

export function TableBody({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return <tbody className={['align-middle text-sm text-slate-700', className].join(' ')}>{children}</tbody>
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  className?: string
}

export function TableRow({ children, className = '', ...rest }: TableRowProps){
  return (
    <tr
      className={['rounded-md bg-white shadow-sm transition hover:bg-slate-50', className].join(' ')}
      {...rest}
    >
      {children}
    </tr>
  )
}

export function TableHeadCell({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return <th className={['px-3 py-2 text-left', className].join(' ')}>{children}</th>
}

export function TableCell({ children, className = '' }: { children: React.ReactNode; className?: string }){
  return <td className={['px-3 py-2', className].join(' ')}>{children}</td>
}
