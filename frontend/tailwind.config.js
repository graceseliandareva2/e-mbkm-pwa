/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        nprogress: {
          '0%':   { width: '0%',   opacity: '1' },
          '80%':  { width: '85%',  opacity: '1' },
          '100%': { width: '100%', opacity: '0' },
        },
      },
      animation: {
        nprogress: 'nprogress 1.8s ease-out forwards',
      },
    },
  },
  plugins: [],
}