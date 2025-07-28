/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#00B8D4',
        darkBg: '#1E1E2F',
        darkSidebar: '#2C2C3E',
        lightBg: '#F5F6FA',
        lightSidebar: '#FFFFFF',
        textDark: '#E0E0E0',
        textLight: '#333333'
      },
      animation: {
        loading: 'loading 1.5s linear infinite'
      },
      keyframes: {
        loading: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        }
      }
    }
  },
  plugins: [],
}
