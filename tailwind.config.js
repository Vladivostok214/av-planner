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
          dark: '#050D20',
          light: '#F8F9FA',
          tint: '#D1E1FF',    // High contrast tint for secondary text on blue
          gray: '#94A3B8',
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'none': '0',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
      }
    },
  },
  plugins: [],
}
