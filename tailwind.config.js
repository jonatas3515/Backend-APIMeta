/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        'nc-black': '#0D0D0D',
        'nc-dark': '#111111',
        'nc-surface': '#FAFAFA',
        'nc-white': '#FFFFFF',
        'nc-gray': {
          50: '#F9F9F9',
          100: '#F5F5F5',
          150: '#F1F1F1',
          200: '#EEEEEE',
          300: '#E5E5E5',
          350: '#D8D8D8',
          400: '#D6D6D6',
          500: '#888888',
          600: '#707070',
          700: '#555555',
          800: '#333333',
          900: '#171717',
        },
        'nc-text': {
          DEFAULT: '#171717',
          title: '#111111',
          secondary: '#666666',
          muted: '#888888',
          placeholder: '#999999',
        },
        'nc-yellow': {
          DEFAULT: '#D4A418',
          50: '#FFF9E6',
          100: '#FFF0CC',
          200: '#FFE29E',
          300: '#FFD36E',
          400: '#E6B21A',
          500: '#D4A418',
          600: '#B08A12',
          700: '#8C6F0E',
          800: '#6B540B',
          900: '#4A3A07',
        },
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'card': '0 1px 2px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)',
      },
      borderRadius: {
        'nc': '10px',
      },
    },
  },
  plugins: [],
};
