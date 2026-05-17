/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--color-primary)', 
          accent: 'var(--color-accent)',  
          dark: 'var(--color-dark)',
          paper: 'var(--color-paper)',   
          hairline: 'var(--color-hairline)', 
          light: 'var(--color-light)',
          tint: 'var(--color-tint)',    
          gray: 'var(--color-gray)', 
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
