/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'nc-yellow': {
          DEFAULT: '#ffbd59',
          50: '#fff9ed',
          100: '#fff2d4',
          200: '#ffe2a8',
          300: '#ffcb71',
          400: '#ffbd59',
          500: '#ffa820',
          600: '#f08a07',
          700: '#c76b08',
          800: '#9e530e',
          900: '#7f450f',
        },
      },
    },
  },
  plugins: [],
};
