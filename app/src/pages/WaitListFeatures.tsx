import { Zap, Shield, Coins, Layers } from 'lucide-react';
import Tilt from 'react-parallax-tilt'

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Sub-second transaction finality powered by Solana',
  },
  {
    icon: Shield,
    title: 'Secure by Design',
    description: 'Institutional-grade security with advanced encryption',
  },
  {
    icon: Coins,
    title: 'Low Fees',
    description: 'Fraction-of-a-cent transaction costs',
  },
  {
    icon: Layers,
    title: 'Scalable',
    description: '50,000+ transactions per second capacity',
  },
];

export default function Features() {
  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 mb-20">
      <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
        Built for the Next Generation
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (

          <Tilt
            tiltMaxAngleX={20} 
            tiltMaxAngleY={20}
          >
            <div
              key={index}
              className="group bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:transform hover:scale-105 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="bg-purple-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
                <feature.icon className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          </Tilt>
        ))}
      </div>
    </div>
  );
}
