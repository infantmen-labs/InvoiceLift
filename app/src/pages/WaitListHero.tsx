import { Rocket } from 'lucide-react';
import Tilt from 'react-parallax-tilt'

export default function WaitListPage() {
  return (
    <div className="relative z-10 text-center px-6 mb-16 mt-[-40px] animate-fade-in">
      <div className="inline-flex items-center justify-center mb-8 animate-float">
        <div className="p-4 bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-2xl backdrop-blur-sm border border-purple-500/30">
          <img width={40} src='../../favicon/PRocket.png' alt="logo" className='animate-rocket' />
        </div>
      </div>

      <h1 className="text-5xl md:text-5xl font-bold mb-6 pb-2 bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent leading-tight">
        <span className="text-purple-400">InvoiceLift:</span> <span className="italic font-cursive">The Future of Decentralized Finance on Solana, powered by invoice-backed liquidity</span>
      </h1>

      <p className="text-xl md:text-xl text-gray-300 opacity-80 mb-4 max-w-3xl mx-auto leading-relaxed">
        Experience fast, secure, Solana-powered transactions as InvoiceLift enables invoice minting, USDC financing, and fractional trading within an on-chain managed marketplace 
      </p>

      <Tilt
        tiltMaxAngleX={10} 
        tiltMaxAngleY={10}
      >
        <div className="inline-block px-6 py-3 bg-purple-500/10 border border-purple-500/30 rounded-full mb-8">
          <p className="text-purple-300 text-sm md:text-base font-medium">
            🚀 Demo Version Now Live Visit For More Info • Full Launch Coming Soon
          </p>
        </div>
      </Tilt>
    </div>
  );
}
