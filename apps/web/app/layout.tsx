import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './lib/auth-context';

export const metadata: Metadata = {
  title: 'Cost Watchdog',
  description: 'Intelligente Kostenüberwachungsplattform für den DACH-Mittelstand',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
