import { useRef } from 'react';
import AnimatedBackground from './WaitListAnimatedBg';
import Hero from './WaitListHero';
import CTAButtons from './WaitListCTAButtons';
import Features from './WaitListFeatures';
import WaitListForm from './WaitListForm';
import InvestorForm from './WaitListInvestorForm';
import FAQ from './WaitListFAQ';

import { 
  Twitter,
  Linkedin,
  Github,
  Send as TelegramIcon,
} from "lucide-react"



export function WaitListPage() {
  const scrollTop = useRef<HTMLDivElement | null>(null);

  const smoothScrollTop = () => {
    scrollTop.current?.scrollIntoView({
      behavior: "smooth",
    });
  };




  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#000617] to-[#0B1629]">
      <AnimatedBackground />

      <div ref={scrollTop} className="relative z-10">
        <main className="container mx-auto pt-20 pb-12">
          <Hero />
          <CTAButtons />
          <Features />
          

          <div id="waitList" className='pt-20' >
            <WaitListForm />
          </div>

          <InvestorForm />
          <FAQ/>
        </main>

        <footer className="relative z-10 text-center py-6 px-6 border-t border-gray-800/50">
          <p className="text-gray-400 text-sm">
            © 2025 Solana Defi. Built On Solana By{' '}
            <a
              href="https://github.com/infantmen-labs"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 decoration-gray-500 hover:text-gray-200 hover:decoration-gray-300"
            >
              Infantmen-Labs
            </a>
            .
          </p>

          <div className="mt-5 flex gap-5 justify-center items-center animate-fade-in">
            {/* Add each Social Media Url to each anchor tag */}
            <a href="https://x.com/involift">
              <Twitter className="w-7 h-7 text-blue-400 cursor-pointer hover:scale-110" />
            </a>
            <a href="#">
              <TelegramIcon className="w-7 h-7 text-sky-400 cursor-pointer hover:scale-110" />
            </a>
            <a
              href="https://github.com/infantmen-labs/InvoiceLift"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="w-7 h-7 text-blue-700 cursor-pointer hover:scale-110 " />
            </a>

            {/* If you want to add LinkIn you can Uncomment this part below */}
            {/* <a href="#">
              <Linkedin className="w-7 h-7 text-blue-700 cursor-pointer hover:scale-110 " />
            </a> */}
          </div>

          {/* // <!-- Go To Top Btn -->  */}
          <div onClick={() => smoothScrollTop()} className=" absolute bottom-[130px] right-[60px] animate-bounce">
            <button className="GoToBtn">
              <svg height="1.2em" className="arrow" viewBox="0 0 512 512"><path d="M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"></path></svg>
              <p className="text">Back to Top</p>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

