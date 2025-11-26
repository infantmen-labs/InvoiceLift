module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    "./node_modules/@solana/wallet-adapter-react-ui/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7c3aed',
          soft: '#ede9fe',
          dark: '#6d28d9',
        },
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      },

      borderRadius: {
        xl: '0.75rem',
      },

      keyframes: {
        dangle: {
          '0%,100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },

        UpDown: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },

        jump: {
          '0%,20%,50%,80%,100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-10px)' },
          '60%': { transform: 'translateY(-5px)' },
        },
      },

      animation: {
        dangle: 'dangle 3s ease-in-out infinite',
        UpDown: 'UpDown 3s ease-in-out infinite',
        jump: 'jump 3s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};
