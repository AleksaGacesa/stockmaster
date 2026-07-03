/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Structural surfaces/text read from CSS variables (see
        // index.css) so they can flip between the dark and light
        // theme. Brand/status colors stay flat hex in both themes.
        bg: {
          0: 'rgb(var(--bg-0) / <alpha-value>)',
          1: 'rgb(var(--bg-1) / <alpha-value>)',
          2: 'rgb(var(--bg-2) / <alpha-value>)',
          3: 'rgb(var(--bg-3) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        amber: {
          DEFAULT: '#e8821c',
          dim: 'var(--color-amber-dim)',
        },
        green: {
          DEFAULT: 'rgb(var(--color-green) / <alpha-value>)',
          dim: 'var(--color-green-dim)',
        },
        red: {
          DEFAULT: 'rgb(var(--color-red) / <alpha-value>)',
          dim: 'var(--color-red-dim)',
        },
        blue: {
          DEFAULT: '#4a90d9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease both',
        'fade-in': 'fadeIn 0.4s ease both',
        'scale-in': 'scaleIn 0.25s ease both',
        'slide-left': 'slideLeft 0.4s ease both',
        'float': 'float 2.6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shine': 'shine 3.2s ease-in-out infinite',
        'ring-spin': 'ringSpin 4s linear infinite',
        'tagline-type': 'taglineType 6s steps(25,end) infinite',
        'blink': 'blink 1s steps(1) infinite',
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        scaleIn: { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        slideLeft: { from: { opacity: 0, transform: 'translateX(-16px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 0 0 rgba(232,130,28,0.35)' }, '50%': { boxShadow: '0 0 0 6px rgba(232,130,28,0)' } },
        shine: { '0%,100%': { backgroundPosition: '-150% 0' }, '50%': { backgroundPosition: '250% 0' } },
        ringSpin: { to: { transform: 'rotate(360deg)' } },
        taglineType: {
          '0%':   { clipPath: 'inset(0 100% 0 0)' },
          '30%':  { clipPath: 'inset(0 0% 0 0)' },
          '70%':  { clipPath: 'inset(0 0% 0 0)' },
          '90%':  { clipPath: 'inset(0 100% 0 0)' },
          '100%': { clipPath: 'inset(0 100% 0 0)' },
        },
        blink: { '0%,49%': { opacity: 1 }, '50%,100%': { opacity: 0 } },
      },
    },
  },
  plugins: [],
}
