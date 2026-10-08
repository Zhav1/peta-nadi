import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/authContext';

export const metadata: Metadata = {
  title: 'PreHub — Sistem Peringatan Dini & Rekomendasi Mitigasi Gangguan Distribusi Pangan',
  description:
    'Sistem peringatan dini dan rekomendasi mitigasi gangguan distribusi pangan berbasis data multisumber. ' +
    'Memantau koridor distribusi, validasi bukti cuaca & lalu lintas, serta perbandingan mitigasi Continue, Reroute, dan Hold/Delay.',
  keywords: ['PreHub', 'distribusi pangan', 'logistik', 'mitigasi gangguan', 'early warning', 'Pulau Sumatera', 'Pan-Sumatera', 'AI'],
  icons: {
    icon: '/logo_prehub.png',
    shortcut: '/logo_prehub.png',
    apple: '/logo_prehub.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark scroll-smooth">
      <head>
        <link rel="icon" href="/logo_prehub.png" type="image/png" />
      </head>
      <body className="bg-[#080d14] text-slate-100 min-h-screen w-full font-sans antialiased selection:bg-white selection:text-[#080d14]">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
