import type { Metadata } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import './globals.css';

const bodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const displayFont = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700'],
});

export const metadata: Metadata = {
  title: 'Cost Watchdog',
  description: 'Intelligente Kostenueberwachungsplattform fuer den DACH-Mittelstand',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${bodyFont.variable} ${displayFont.variable} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
