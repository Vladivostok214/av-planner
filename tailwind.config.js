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
          primary: '#003A7A', // Azul más profundo para contraste
          accent: '#F7941E',  
          dark: '#050D20',
          paper: '#FBFBFA',   
          hairline: '#D1D5DB', // Gris más oscuro para bordes visibles
          light: '#F8F9FA',
          tint: '#D1E1FF',    
          gray: '#475569', // Texto secundario más legible
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
