import { Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CTAButtons() {
  const scrollToWaitList = () => {
    window.scrollTo({
      top: document.getElementById('waitList')?.offsetTop || 0,
      behavior: 'smooth',
    });
  };

  const scrollToInfo = () => {
    window.scrollTo({
      top: document.getElementById('Info')?.offsetTop || 0,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-4 px-6 mb-16 mt-20">
      {/* <!-- Scroll to Info button -->  */}
      <div className='absolute top-[-70px] left-0 right-0 flex justify-center items-center'>
        <button
          onClick={scrollToInfo}
          className=" cursor-pointer bg-gray-900 hover:bg-gray-800 px-3 py-3 rounded-full text-white tracking-wider shadow-xl hover:scale-105 animate-bounce hover:animate-none"
        >
          <svg
            className="w-5 h-5"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
              stroke-linejoin="round"
              stroke-linecap="round"
            ></path>
          </svg>
        </button>
      </div>

      <button
        onClick={scrollToWaitList}
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
