/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 38px rgba(99, 102, 241, .25)',
        board: '0 22px 55px rgba(8, 15, 46, .38)',
      },
      animation: {
        'drop-disc': 'drop-disc .42s cubic-bezier(.15,.8,.35,1)',
        'pop-in': 'pop-in .28s cubic-bezier(.2,1.4,.4,1)',
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
        'float': 'float 5s ease-in-out infinite',
      },
      keyframes: {
        'drop-disc': { '0%': { transform: 'translateY(-360px)' }, '100%': { transform: 'translateY(0)' } },
        'pop-in': { '0%': { transform: 'scale(.76)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'pulse-ring': { '0%': { transform: 'scale(.88)', opacity: '.7' }, '100%': { transform: 'scale(1.25)', opacity: '0' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-9px)' } },
      },
    },
  },
  plugins: [],
}
