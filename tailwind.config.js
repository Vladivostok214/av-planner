/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#581845',
          accent: '#C70039',
          warning: '#FF5733',
          highlight: '#FFC300',
          dark: '#0A132D',
          light: '#F8F9FA',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      boxShadow: {
        'glow': '0 0 15px -3px rgba(199, 0, 57, 0.3), 0 0 6px -2px rgba(199, 0, 57, 0.1)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      }
    },
  },
  plugins: [],
}
