import { useState } from 'react';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';





export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setStatus('error');
      setMessage('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setStatus('idle');

    try {
      // 👉 Simulate "submission" (no more Supabase)
      console.log("Waitlist form submitted:", { email });

      // Fake slight delay (optional)
      await new Promise((res) => setTimeout(res, 800));

      setStatus('success');
      setMessage("You're on the list! We'll notify you at launch.");
      setEmail('');

    } catch (err) {
      setStatus('error');
      setMessage('Failed to join waitlist. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative z-10 max-w-2xl mx-auto px-6 mb-20">
      <div className="bg-gradient-to-br from-[#0B172A]/80 to-[#0B172A]/40 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-purple-500/20 shadow-2xl">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center">
          Join the Waitlist
        </h2>
        <p className="text-gray-300 text-center mb-8">
          Be the first to know when we launch. Get exclusive early access.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-[#0B172A] hover:bg-[#0B172A]/80 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {isLoading ? 'Joining...' : 'Join Waitlist'}
          </button>

          {status !== 'idle' && (
            <div
              className={`flex items-center gap-2 p-4 rounded-xl animate-slide-up ${
                status === 'success'
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}
            >
              {status === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <p
                className={`text-sm ${
                  status === 'success' ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {message}
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}