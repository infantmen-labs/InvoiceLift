import { Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CTAButtons() {
  const scrollToWaitlist = () => {
    window.scrollTo({
      top: document.getElementById('waitlist')?.offsetTop || 0,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-4 px-6 mb-16">
      <button
        onClick={scrollToWaitlist}
        className="group flex justify-center items-center gap-2 px-8 py-4 bg-[#0B172A] hover:bg-[#0B172A]/80 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl w-full sm:w-auto"
      >
        <Sparkles className="w-5 h-5" />
        Join WaitList
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
      
      <Link to='/try-demo'>
        <a
          href="#demo"
          className="flex items-center gap-2 px-8 py-4 bg-[#8437EB] hover:bg-[#8437EB]/90 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl w-full sm:w-auto text-center justify-center"
        >
          Try Demo
          <ArrowRight className="w-5 h-5" />
        </a>
      </Link>
    </div>
  );
}
