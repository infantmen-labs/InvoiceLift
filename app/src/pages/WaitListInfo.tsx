import React from 'react'
import Tilt from 'react-parallax-tilt'

export default function WaitListInfo() {
  return (
    <section className="bg-transparent mt-20">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-start mb-5">Info</h2>
          <ol className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            <Tilt
              tiltMaxAngleX={20} 
              tiltMaxAngleY={20}
            >
              <div className='group bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105 animate-fade-in'>
                <li className="">
                  <div className="mt-1 font-medium text-slate-50 text-lg">Vision</div>
                  <p className="mt-2 text-[15px] text-slate-300">
                    <span className='text-[#8E32E9]'>InvoiceLift</span> aims to bridge traditional trade finance with decentralized infrastructure by enabling businesses to tokenize their invoices and access instant liquidity globally. Using Solana's high-speed, low-cost blockchain and Finternet's Unified Ledger vision, InvoiceLift creates a transparent, programmable, and composable marketplace for invoice financing.                    </p>
                </li>
              </div>
            </Tilt>

            <Tilt
              tiltMaxAngleX={20} 
              tiltMaxAngleY={20}
            >
              <div className='group bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105 animate-fade-in'>
                <li className="">
                  <div className="mt-1 font-medium text-slate-50 text-lg">Problems</div>
                  <p className="mt-2 text-[15px] text-slate-300">
                    Small and medium enterprises (SMEs) often face long payment cycles... Sometimes 30 to 120 days, that restrict cash flow and growth. Traditional invoice financing is slow, limited to local institutions, and burdened by manual verification and opaque credit assessment processes. This leads to inefficiencies, high costs, and limited access to working capital.
                  </p>
                </li>
              </div>
            </Tilt>

            <Tilt
              tiltMaxAngleX={20} 
              tiltMaxAngleY={20}
            >
              <div className='group bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105 animate-fade-in'>
                <li className="">
                  <div className="mt-1 font-medium text-slate-50 text-lg">Solution</div>
                  <p className="mt-2 text-[15px] text-slate-300">
                    <span className='text-[#8E32E9]'>InvoiceLift</span> tokenizes verified invoices into on-chain assets that can be financed by global investors using stablecoins. Through Finternet rails, invoice data can be verified and shared securely between service providers, ensuring trust and composability. Automated settlement and smart contract–based escrow reduce counterparty risk, while on-chain reputation and analytics improve investor confidence.
                  </p>
                </li>
              </div>
            </Tilt>

            <Tilt
              tiltMaxAngleX={20} 
              tiltMaxAngleY={20}
            >
              <div className='group bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105 animate-fade-in'>
                <li className="relative">
                  <div className="mt-1 font-medium text-slate-50 text-lg">Core Features</div>
                  <p className="mt-2 text-[15px] text-slate-400 italic">
                    <span className='text-slate-200 not-italic'>Invoice Tokenization:</span> Convert invoices into on-chain token representing receivables. 
                    <br />
                    <span className='text-slate-200 not-italic'>Liquidity Pool / Marketplace:</span> Investors can fund invoices individually or through managed pools. 
                    <br />
                    <span className='text-slate-200 not-italic'>Automated settlement:</span> When invoices are paid, smart contract release funds to investors automatically. 
                    <br />
                    <span className='text-slate-200 not-italic'>Verification Layer:</span> Integrates KYC/AML to ensure legitimacy. 
                  </p>

                  <span className='absolute bottom-0 right-0 animate-float'>etc...</span>
                </li>
              </div>
            </Tilt>

          </ol>
        </div>
    </section>
  )
}
