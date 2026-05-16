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
          primary: '#0F216D', // Azul Puntaje
          accent: '#FEC526',  // Amarillo Nacional
          dark: '#0A0A0A',
          light: '#F8F9FA',
          gray: '#666666',
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'none': '0',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      }
    },
  },
  plugins: [],
}
