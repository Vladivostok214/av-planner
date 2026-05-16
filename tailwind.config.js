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
          primary: '#004A99', // Azul Puntaje Oficial
          accent: '#F7941E',  // Naranja Puntaje (Energy)
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
        'lg': '0.5rem',
      }
    },
  },
  plugins: [],
}
