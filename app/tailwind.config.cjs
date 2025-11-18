module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design system colors (see docs/dev/design.md)
        brand: {
          DEFAULT: '#7c3aed', // primary violet
          soft: '#ede9fe',
          dark: '#6d28d9',
        },
        success: '#10b981', // emerald
        danger: '#ef4444', // red
        warning: '#f59e0b',
      },
      borderRadius: {
        xl: '0.75rem',
      },
    },
  },
  plugins: [],
}
