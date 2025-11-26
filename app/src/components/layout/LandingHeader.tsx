import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'


const UpToDown = {
  hidden: { 
    opacity: 0, 
    y: '-50px' 
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', delay: 1 }
  },
  exit: {
    y: "-50px",
    transition: { ease: 'easeInOut' }
  }
};


export function LandingHeader(){
  return (
    <motion.header
      variants={UpToDown}
      initial="hidden"
      whileInView="visible"
      exit="exit"
      viewport={{
        once: false
      }}
      className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand/20 ring-1 ring-brand/40" />
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
            Launch App
          </Link>
        </div>
      </div>
    </motion.header>
  )
}
