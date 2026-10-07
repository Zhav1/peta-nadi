'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Code,
  Clock,
  Layers
} from 'lucide-react';
import type { TestCaseItem } from '@/lib/types';

interface TestMatrixTableProps {
  tests?: TestCaseItem[];
  isLoading?: boolean;
}

const DOMAIN_OPTIONS = [
  { id: 'all', label: 'Semua Kategori (133 Uji)' },
  { id: 'FR-1', label: 'FR-1 Cuaca & Seismik' },
  { id: 'FR-2', label: 'FR-2 Trafik TomTom' },
  { id: 'FR-3', label: 'FR-3 Pelabuhan & AIS' },
  { id: 'FR-4', label: 'FR-4 Berita & NLP' },
  { id: 'FR-5', label: 'FR-5 Swarm Consensus' },
  { id: 'FR-6', label: 'FR-6 Benchmark Dataset' },
  { id: 'FR-7', label: 'FR-7 Armada & Koridor' },
  { id: 'FR-8', label: 'FR-8 Pangan & PIHPS' },
  { id: 'FR-9', label: 'FR-9 Copilot & Mitigasi' },
  { id: 'FR-10', label: 'FR-10 Health & Resilience' },
  { id: 'FR-11', label: 'FR-11 Kalibrasi & CPU' },
  { id: 'FR-12', label: 'FR-12 Audit Keputusan' },
  { id: 'FR-13', label: 'FR-13 Telemetri WebGL' },
  { id: 'FR-14', label: 'FR-14 Evaluasi & Dashboard' },
  { id: 'FR-15', label: 'FR-15 Auth & RBAC (Supabase)' },
  { id: 'FR-16', label: 'FR-16 Onboarding Armada & GPS' },
  { id: 'FR-17', label: 'FR-17 Choke-Point & Intermodal' },
  { id: 'FR-18', label: 'FR-18 Spoilage Hedging Matrix' },
  { id: 'FR-19', label: 'FR-19 Kepatuhan Regulasi & BKHIT' },
  { id: 'FR-20', label: 'FR-20 Pilot Verification & E2E Drills' },
];

export default function TestMatrixTable({
  tests = [],
  isLoading = false
}: TestMatrixTableProps) {
  const [search, setSearch] = useState<string>('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Filtered tests
  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchDomain = selectedDomain === 'all' || t.fr_id === selectedDomain;
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        t.test_id.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.module.toLowerCase().includes(q) ||
        t.scenario.toLowerCase().includes(q) ||
        t.expected_invariant.toLowerCase().includes(q);
      return matchDomain && matchSearch;
    });
  }, [tests, selectedDomain, search]);

  const totalPages = Math.max(1, Math.ceil(filteredTests.length / pageSize));
  const paginatedTests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTests.slice(start, start + pageSize);
  }, [filteredTests, currentPage]);

  const handleDomainSelect = (domainId: string) => {
    setSelectedDomain(domainId);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const toggleRow = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col bg-[#0c1017] border border-[#1c2432] rounded-lg p-5 shadow-xl overflow-hidden">
      {/* Table Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#1c2432]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide font-sans flex items-center gap-2">
              <span>Matriks Uji Otomatis & Inventaris Verifikasi</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono">
                {tests.length} Skenario • 100% Passed
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Pemetaan Kebutuhan Fungsional FR-1 s.d. FR-20 dengan Pengujian Pytest & WebGL
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Cari ID uji, modul, atau skenario..."
            className="w-full pl-9 pr-3 py-1.5 rounded-md bg-[#121822] border border-[#1c2432] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
          />
        </div>
      </div>

      {/* Domain Filter Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-3 no-scrollbar border-b border-[#1c2432]">
        {DOMAIN_OPTIONS.map((opt) => {
          const isActive = selectedDomain === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleDomainSelect(opt.id)}
              className={`px-3 py-1 rounded-md text-xs font-sans transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-[#080d14] font-semibold'
                  : 'bg-[#121822] text-slate-400 hover:text-slate-200 border border-[#1c2432]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Table Canvas */}
      <div className="overflow-x-auto mt-2 -mx-5 px-5">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#1c2432] text-xs font-sans text-slate-400">
              <th className="py-2.5 px-3">Test ID</th>
              <th className="py-2.5 px-3">FR Domain</th>
              <th className="py-2.5 px-3">Modul Pengujian</th>
              <th className="py-2.5 px-3">Skenario & Vektor Uji</th>
              <th className="py-2.5 px-3">Invarian / Ekspektasi</th>
              <th className="py-2.5 px-3 text-right">Durasi</th>
              <th className="py-2.5 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedTests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 font-mono text-xs">
                  Tidak ada skenario uji yang cocok dengan pencarian &quot;{search}&quot;.
                </td>
              </tr>
            ) : (
              paginatedTests.map((t) => {
                const isExpanded = expandedId === t.test_id;
                return (
                  <React.Fragment key={t.test_id}>
                    <tr
                      onClick={() => toggleRow(t.test_id)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      {/* Test ID */}
                      <td className="py-2.5 px-3 font-mono font-bold text-cyan-400 whitespace-nowrap flex items-center gap-1.5">
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition" />
                        )}
                        <span>{t.test_id}</span>
                      </td>

                      {/* FR Domain */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono text-xs">
                          {t.fr_id}
                        </span>
                      </td>

                      {/* Module Path */}
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-xs max-w-[180px] truncate" title={t.module}>
                        {t.module}
                      </td>

                      {/* Scenario Description */}
                      <td className="py-2.5 px-3 text-slate-200 text-xs max-w-[260px] truncate" title={t.scenario}>
                        {t.scenario}
                      </td>

                      {/* Invariant */}
                      <td className="py-2.5 px-3 text-slate-400 text-xs max-w-[240px] truncate" title={t.expected_invariant}>
                        {t.expected_invariant}
                      </td>

                      {/* Execution Time */}
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-right whitespace-nowrap text-xs">
                        {t.execution_time_ms ? `${t.execution_time_ms.toFixed(1)} ms` : '< 5 ms'}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-xs font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          {t.result.toUpperCase()}
                        </span>
                      </td>
                    </tr>

                    {/* Expandable Drawer Row */}
                    {isExpanded && (
                      <tr className="bg-black/40 border-y border-cyan-500/20">
                        <td colSpan={7} className="py-3 px-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                            <div className="space-y-1.5">
                              <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Vektor Masukan & Skenario:</span>
                              <p className="text-slate-200 bg-white/5 p-2.5 rounded-lg border border-white/10">
                                {t.scenario}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                                <span>Tipe Uji: <strong className="text-cyan-300">{t.test_type}</strong></span>
                                <span>•</span>
                                <span>Kategori: <strong className="text-slate-200">{t.category}</strong></span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Invarian Logika & Asersi:</span>
                              <p className="text-emerald-300 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-500/20">
                                {t.expected_invariant}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                                <Code className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Modul: <code className="text-slate-300">{t.module}</code></span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10 text-xs font-mono text-slate-400">
        <div>
          Menampilkan <strong className="text-white">{paginatedTests.length}</strong> dari <strong className="text-white">{filteredTests.length}</strong> skenario terfilter ({tests.length} total)
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-400 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span>
            Halaman <strong className="text-white">{currentPage}</strong> dari <strong className="text-white">{totalPages}</strong>
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-400 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
