import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PreHub — Sistem Peringatan Dini & Rekomendasi Mitigasi Gangguan Distribusi Pangan',
  description:
    'Sistem peringatan dini dan rekomendasi mitigasi gangguan distribusi pangan berbasis data multisumber. ' +
    'Memantau koridor distribusi, validasi bukti cuaca & lalu lintas, serta perbandingan mitigasi Continue, Reroute, dan Hold/Delay.',
  keywords: ['PreHub', 'distribusi pangan', 'logistik', 'mitigasi gangguan', 'early warning', 'Sumatera Utara', 'AI'],
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
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
        <link rel="icon" href="/logo_prehub.png" type="image/png" />
      </head>
      <body className="bg-[#080d14] text-slate-100 min-h-screen w-full font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
