module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0b5fff',
          50: '#eaf3ff',
          100: '#d6e9ff',
        },
        accent: '#0a66c2',
        brand: '#0f1724',
        highlight: '#06b6d4',
        success: '#10b981',
        danger: '#ef4444',
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          700: '#334155'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        heading: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui']
      }
    }
  },
  plugins: []
}
