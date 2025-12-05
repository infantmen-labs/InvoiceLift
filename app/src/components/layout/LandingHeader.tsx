import React from 'react'
import { Link } from 'react-router-dom'
import { motion, Variants } from 'framer-motion'
// import { Rocket } from 'lucide-react';



const UpToDown: Variants = {
  hidden: { 
    opacity: 0, 
    y: '-50px' 
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', delay: 0.2 }
  },
};


export function LandingHeader(){
  return (
    <motion.header
      variants={UpToDown}
      initial="hidden"
      whileInView="visible"
      className="fixed w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur z-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          {/* Logo */}
          <div className="inline-flex items-center justify-center">
            <div className="p-3 bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-2xl backdrop-blur-sm border border-purple-500/30">
              <img
                width={24}
                src='../../favicon/logo-192.png'
                alt="InvoiceLift logo"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">InvoiceLift</span>
            <span className="text-[11px] text-slate-500">Invoice financing on Solana</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            to="/invoices"
            className="animate-bounce inline-flex items-center rounded-lg border border-brand/60 bg-brand px-3 py-1.5 font-medium text-white shadow-sm hover:bg-brand-dark"
          >
            Launch Demo
          </Link>
        </div>
      </div>
    </motion.header>
  )
}
