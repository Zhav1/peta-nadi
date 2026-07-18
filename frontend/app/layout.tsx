import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PetaNadi — Logistics Resilience Intelligence Platform',
  description:
    'Real-time AI-powered crisis map for North Sumatra corridor logistics. ' +
    'Monitor floods, port closures, and supply chain disruptions with live agent intelligence.',
  keywords: ['logistics', 'crisis', 'North Sumatra', 'supply chain', 'AI'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body className="bg-[#080d14] text-slate-100 h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
