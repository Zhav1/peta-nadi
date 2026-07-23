import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PetaNadi — 4D Logistics Resilience Intelligence Platform',
  description:
    'Real-time AI-powered crisis map for North Sumatra corridor logistics. ' +
    'Monitor floods, port closures, and supply chain disruptions with live agent intelligence.',
  keywords: ['logistics', 'crisis', 'North Sumatra', 'supply chain', 'AI', 'PetaNadi'],
  icons: {
    icon: '/logo_petanadi.png',
    shortcut: '/logo_petanadi.png',
    apple: '/logo_petanadi.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark scroll-smooth">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
        <link rel="icon" href="/logo_petanadi.png" type="image/png" />
      </head>
      <body className="bg-[#080d14] text-slate-100 min-h-screen w-full font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
