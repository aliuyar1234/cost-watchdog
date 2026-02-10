import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cost Watchdog',
  description: 'Intelligente Kostenüberwachungsplattform für den DACH-Mittelstand',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-gray-50 font-sans antialiased">{children}</body>
    </html>
  );
}
