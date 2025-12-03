import AnimatedBackground from './WaitListAnimatedBg';
import Hero from './WaitListHero';
import CTAButtons from './WaitListCTAButtons';
import Features from './WaitListFeatures';
import WaitListForm from './WaitListForm';
import InvestorForm from './WaitListInvestorForm';

export function WaitListPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#000617] to-[#0B1629]">
      <AnimatedBackground />

      <div className="relative z-10">
        <main className="container mx-auto pt-20 pb-12">
          <Hero />
          <CTAButtons />
          <Features />

          <div id="waitlist">
            <WaitListForm />
          </div>

          <InvestorForm />
        </main>

        <footer className="relative z-10 text-center py-8 px-6 border-t border-gray-800/50">
          <p className="text-gray-400 text-sm">
            © 2024 Solana DeFi. Built on Solana blockchain.
          </p>
        </footer>
      </div>
    </div>
  );
}

