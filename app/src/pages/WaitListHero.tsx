import { Rocket } from 'lucide-react';
import Tilt from 'react-parallax-tilt'

export default function WaitListPage() {
  return (
    <div className="relative z-10 text-center px-6 mb-16 mt-[-40px] animate-fade-in">
      <div className="inline-flex items-center justify-center mb-8 animate-float">
        <div className="p-4 bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-2xl backdrop-blur-sm border border-purple-500/30">
          <img src='../../favicon/logo-192.png' className="w-12 h-12" alt="InvoiceLift logo" />
        </div>
      </div>

      <h1 className="text-5xl md:text-5xl font-bold mb-6 pb-2 bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent leading-tight">
        <span className="text-[#8437EB]">InvoiceLift:</span>{' '}
        <span className="italic font-cursive">
          Turn unpaid invoices into on-chain, tradeable assets on Solana
        </span>
      </h1>

      <p className="text-xl md:text-xl text-gray-300 opacity-80 mb-4 max-w-3xl mx-auto leading-relaxed">
        Mint invoices as tokens on Solana, unlock upfront USDC financing, and let investors buy and trade invoice
        shares in a managed on-chain marketplace.
      </p>

      <Tilt
        tiltMaxAngleX={10} 
        tiltMaxAngleY={10}
      >
        <div className="inline-block px-6 py-3 bg-purple-500/10 border border-purple-500/30 rounded-full mb-8">
          <p className="text-purple-300 text-sm md:text-base font-medium">
            🚀 Demo Version Now Live • Full Launch Coming Soon
          </p>
        </div>
      </Tilt>
    </div>
  );
}
