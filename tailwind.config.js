/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{html,js}',
    './main.js',
    './preload.js',
    './renderer.js',
    './src/**/*.{html,js,ts,tsx}',
    './src/views/**/*.html',
    './src/js/**/*.js',
    './src/components/**/*.{html,js,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00B8D4',
        darkBg: '#1E1E2F',
        darkSidebar: '#2C2C3E',
        lightBg: '#F5F6FA',
        lightSidebar: '#FFFFFF',
        textDark: '#E0E0E0',
        textLight: '#333333',
        background: { light: '#F9FAFB', dark: '#111827' },
        surface: { light: '#FFFFFF', dark: '#1F2937' },
        textColor: { light: '#111827', dark: '#F9FAFB' },
        textSecondary: { light: '#4B5563', dark: '#9CA3AF' },
        uiPrimary: { light: '#2563EB', dark: '#3B82F6' },
        uiPrimaryHover: { light: '#1E40AF', dark: '#60A5FA' },
        accent: { light: '#10B981', dark: '#34D399' },
        borderColor: { light: '#E5E7EB', dark: '#374151' },
      },
    },
  },
  plugins: [],
  // pokud skládáš classnames v JS (např. `text-${color}-500`), nech si tohle:
  safelist: [
    'dark', 'hidden', 'block', 'flex', 'grid', 'container', 'z-50',
    { pattern: /(bg|text|border|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[1-9]00/ },
    { pattern: /(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-\d+/ },
    { pattern: /(w|h)-(screen|full)/ },
  ],
};
