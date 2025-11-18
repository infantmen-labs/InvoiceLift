import React from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function MainLayout({ children }: { children: React.ReactNode }){
  return (
    <div className="h-screen bg-slate-50 text-slate-900">
      <div className="flex h-full">
        <Sidebar />
        <div className="flex h-full flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
