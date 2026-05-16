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
          paper: '#FBFBFA',   // Sunsama-inspired calm background
          hairline: '#EAEAEA', // Subtle 1px border color
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
        'sm': '2px',
        'md': '4px',
        'lg': '8px',
        'xl': '12px',
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0,0,0,0.04)',
        'focus': '0 4px 20px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
}
