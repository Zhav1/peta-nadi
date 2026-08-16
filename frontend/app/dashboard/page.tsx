'use client';

import dynamic from 'next/dynamic';

const DashboardClient = dynamic(() => import('../../components/dashboard/DashboardClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-[#080d14] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm tracking-widest uppercase font-mono">
          Initializing PreHub Command Center...
        </span>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  return <DashboardClient />;
}
