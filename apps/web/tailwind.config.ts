import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
      },
      boxShadow: {
        soft: '0 20px 45px -28px rgba(15, 23, 42, 0.55)',
        card: '0 12px 36px -22px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
