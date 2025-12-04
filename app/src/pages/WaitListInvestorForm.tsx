import { useState } from 'react';
import { TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';

export default function InvestorForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    interest: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.email.includes('@')) {
      setStatus('error');
      setMessage('Please fill in all required fields correctly');
      return;
    }

    setIsLoading(true);
    setStatus('idle');

    try {
      // 👉 Replacing Supabase submission with console.log
      console.log("Investor interest submitted:", formData);

      // Optional small delay for UX
      await new Promise((res) => setTimeout(res, 700));

      setStatus('success');
      setMessage("Thank you! We'll be in touch soon.");
      setFormData({ name: '', email: '', interest: '' });

    } catch (err) {
      setStatus('error');
      setMessage('Failed to submit. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative z-10 max-w-2xl mx-auto px-6 mb-20">
      <div className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-purple-500/30 shadow-2xl">
        <div className="flex items-center justify-center mb-4">
          <TrendingUp className="w-8 h-8 text-purple-400" />
        </div>

        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center">
          Investor Interest
        </h2>
        <p className="text-gray-300 text-center mb-8">
          Join leading investors backing the future of DeFi on Solana
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Full Name *"
              className="w-full px-4 py-4 bg-white/5 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={isLoading}
            />
          </div>

          <div>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="Email Address *"
              className="w-full px-4 py-4 bg-white/5 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={isLoading}
            />
          </div>

          <div>
            <textarea
              value={formData.interest}
              onChange={(e) =>
                setFormData({ ...formData, interest: e.target.value })
              }
              placeholder="Tell us about your investment interest (optional)"
              rows={4}
              className="w-full px-4 py-4 bg-white/5 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-[#8437EB] hover:bg-[#8437EB]/90 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {isLoading ? 'Submitting...' : 'Submit Interest'}
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