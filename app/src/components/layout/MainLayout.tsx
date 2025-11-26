import React from 'react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function MainLayout({ children }: { children: React.ReactNode }){
  // Toggle Menu
  const [toggle, setToggle] = useState<boolean>(false);

  const flipToggle = () => {
    setToggle(prev => !prev)
  }



  return (
    <div className=" h-screen bg-gradient-to-r from-[#030509] to-[#022358]">
      <div className="relative flex h-full">
        <div className='absolute lg:static flex h-full z-10'>
          <Sidebar toggle={toggle} />
        </div>
        <div className="flex h-full flex-1 flex-col">
          <Header flipToggle={flipToggle}/>
          <main className="flex-1 overflow-y-auto px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
