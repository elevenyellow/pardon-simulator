/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'trump-gold': '#FFD700',
        'trump-red': '#DC143C',
        'trump-blue': '#0047AB',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { 
            transform: 'translateX(100%)',
            opacity: '0'
          },
          '100%': { 
            transform: 'translateX(0)',
            opacity: '1'
          }
        },
        'slide-out-right': {
          '0%': { 
            transform: 'translateX(0)',
            opacity: '1'
          },
          '100%': { 
            transform: 'translateX(100%)',
            opacity: '0'
          }
        }
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-out-right': 'slide-out-right 0.3s ease-in'
      }
    },
  },
  plugins: [],
}

