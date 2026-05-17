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
          primary: 'rgb(var(--color-primary) / <alpha-value>)', 
          accent: 'rgb(var(--color-accent) / <alpha-value>)',  
          dark: 'rgb(var(--color-dark) / <alpha-value>)',
          paper: 'rgb(var(--color-paper) / <alpha-value>)',   
          hairline: 'rgb(var(--color-hairline) / <alpha-value>)', 
          light: 'rgb(var(--color-light) / <alpha-value>)',
          tint: 'rgb(var(--color-tint) / <alpha-value>)',    
          gray: 'rgb(var(--color-gray) / <alpha-value>)', 
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
