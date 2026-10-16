'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertCircle,
  X,
  Shield,
  User,
  Truck,
  Scale,
  FlaskConical,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle2,
  Building,
  KeyRound,
  Sparkles,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuth, GUEST_LOCK_MESSAGE } from '@/lib/authContext';
import type { UserRole } from '@/lib/types';

export const PILOT_ORGANIZATIONS = [
  { id: 'pos_logistik', name: 'PT Pos Logistik Indonesia (Pos Logistik)' },
  { id: 'pelindo_belawan', name: 'PT Pelabuhan Indonesia (Pelindo Belawan)' },
  { id: 'jne_sumut', name: 'JNE Express Regional Sumatera' },
  { id: 'bapanas', name: 'Badan Pangan Nasional (Bapanas)' },
  { id: 'kemenhub', name: 'Kementerian Perhubungan (Kemenhub)' },
  { id: 'demo_sandbox', name: 'Evaluasi Tamu / Demo Sandbox' },
];

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { user, role, switchRole, login, signUp, loginWithMagicLink, logout, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<'account' | 'persona' | 'password' | 'magic'>('password');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('pos_logistik');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // When opening modal, direct authenticated users to their profile card by default
  useEffect(() => {
    if (isOpen) {
      if (isAuthenticated) {
        setActiveTab('account');
      } else {
        setActiveTab('password');
      }
      setStatusMessage(null);
    }
  }, [isOpen, isAuthenticated]);

  if (!isOpen) return null;

  const isSandboxAccount = Boolean(
    user?.is_offline_guest ||
    user?.email?.endsWith('@kompetisi-lrip.id') ||
    user?.company_id === 'demo_sandbox' ||
    !user?.email
  );

  // A verified session supersedes the middleware guest-evaluation flag: drop ?guest=1
  // from the URL while keeping every other query parameter intact.
  const dismissGuestQuery = () => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('guest')) return;
    params.delete('guest');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handlePersonaSelect = async (targetRole: UserRole) => {
    // Locked mode: send the evaluator to the account tab instead of flipping personas.
    if (!isAuthenticated) {
      setStatusMessage({ type: 'error', text: GUEST_LOCK_MESSAGE });
      setActiveTab('password');
      return;
    }

    if (!isSandboxAccount) {
      setStatusMessage({
        type: 'error',
        text: 'Akun organisasi terikat peran tetap. Pergantian 1-klik persona hanya tersedia untuk akun sandbox/evaluasi.',
      });
      return;
    }

    setStatusMessage(null);
    const res = await switchRole(targetRole);
    if (res.success) {
      onClose();
    } else {
      setStatusMessage({ type: 'error', text: res.error || GUEST_LOCK_MESSAGE });
    }
  };

  const handleLogout = async () => {
    setStatusMessage(null);
    await logout();
    setStatusMessage({ type: 'success', text: 'Berhasil keluar dari sesi. Silakan masuk dengan akun lain.' });
    setActiveTab('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    if (!email || !password) {
      setStatusMessage({ type: 'error', text: 'Silakan isi email dan kata sandi.' });
      return;
    }

    if (isSignUp) {
      const res = await signUp(email, password, 'GUEST', selectedCompanyId);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Pendaftaran berhasil. Akun Anda aktif dalam mode Evaluasi Tamu (Sandbox).' });
        dismissGuestQuery();
        setTimeout(onClose, 800);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Gagal mendaftarkan akun.' });
      }
    } else {
      const res = await login(email, password);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Berhasil masuk.' });
        dismissGuestQuery();
        setTimeout(onClose, 800);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Email atau kata sandi salah.' });
      }
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    if (!email) {
      setStatusMessage({ type: 'error', text: 'Silakan masukkan alamat email Anda.' });
      return;
    }

    const res = await loginWithMagicLink(email);
    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: 'Tautan autentikasi telah diproses. Sesi akses aktif diterapkan.',
      });
      dismissGuestQuery();
      setTimeout(onClose, 1000);
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Gagal memproses Magic Link.' });
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-xl bg-[#0c1017] border border-[#1c2432] rounded-lg shadow-xl overflow-hidden flex flex-col pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c2432] bg-[#121822]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#0c1017] border border-[#1c2432] flex items-center justify-center text-slate-300">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold font-sans text-white">
                {isAuthenticated ? 'Profil Pengguna & Wewenang Akses' : 'Manajemen Ruang Kerja & Akses Masuk'}
              </h2>
              <p className="text-xs font-mono text-slate-400">
                Otentikasi Multi-Tenant Supabase & Kontrol Akses Berbasis Peran (RBAC)
              </p>
            </div>
          </div>

          <button
            type="button"
            id="close-auth-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-md bg-[#0c1017] text-slate-400 hover:text-white transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation (Only visible when NOT authenticated or logged out) */}
        {!isAuthenticated && (
          <div className="flex items-center gap-1 px-6 pt-3 border-b border-[#1c2432] bg-[#080d14] text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('password');
                setStatusMessage(null);
              }}
              className={`cursor-pointer px-4 py-2 border-b-2 font-medium transition flex items-center gap-1.5 ${
                activeTab === 'password'
                  ? 'border-white text-white bg-[#0c1017]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Masuk / Akun</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('persona');
                setStatusMessage(null);
              }}
              className={`cursor-pointer px-4 py-2 border-b-2 font-medium transition flex items-center gap-1.5 ${
                activeTab === 'persona'
                  ? 'border-white text-white bg-[#0c1017]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>1-Klik Persona (Sandbox)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('magic');
                setStatusMessage(null);
              }}
              className={`cursor-pointer px-4 py-2 border-b-2 font-medium transition flex items-center gap-1.5 ${
                activeTab === 'magic'
                  ? 'border-white text-white bg-[#0c1017]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Magic Link</span>
            </button>
          </div>
        )}

        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-md border text-xs font-sans flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[65vh]">
          {/* TAB 0: PROFIL AKUN (ACTIVE FOR AUTHENTICATED USERS) */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="p-4 rounded-md bg-[#121822] border border-[#1c2432] space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#080d14] border border-white/20 flex items-center justify-center text-white font-bold text-base">
                      {user.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white font-sans">{user.name || 'Pengguna Terautentikasi'}</h3>
                      <p className="text-xs font-mono text-slate-400">{user.email || 'Email tidak tercantum'}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Building className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-300 font-sans">
                          {user.org_name || (user.company_id ? user.company_id.toUpperCase() : 'Mitra Terdaftar')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider border ${
                    role === 'DISPATCHER'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : role === 'REGULATOR'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  }`}>
                    {role}
                  </span>
                </div>

                {/* Permissions Breakdown */}
                <div className="pt-3 border-t border-[#1c2432] space-y-2">
                  <span className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Daftar Hak Akses & Wewenang Aktif:</span>
                  </span>
                  <div className="grid grid-cols-1 gap-1.5 text-xs font-sans text-slate-300">
                    {role === 'DISPATCHER' && (
                      <>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>Persetujuan Pengalihan Rute Darurat & Detour Operasional</span>
                        </div>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>Pendaftaran Armada Baru & Integrasi Webhook GPS TMS</span>
                        </div>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>Disposisi Instruksi Mitigasi ke WhatsApp Pengemudi</span>
                        </div>
                      </>
                    )}
                    {role === 'REGULATOR' && (
                      <>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Pemantauan Spasial Makro & Heatmap Kerentanan Cuaca BMKG</span>
                        </div>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Pemodelan Ekonometrika Pangan & Disparitas Harga PIHPS</span>
                        </div>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Ekspor Laporan Situasi Kabinet B2G (Hanya Akses Tinjau/Read-Only)</span>
                        </div>
                      </>
                    )}
                    {role === 'GUEST' && (
                      <>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Pratinjau Peta & Koridor Logistik Sumatra</span>
                        </div>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Simulasi Benchmark N=60 & Deteksi Anomali</span>
                        </div>
                        <div className="p-2 rounded bg-[#080d14] border border-[#1c2432] flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-400">Pendaftaran armada & mutasi rute terkunci (khusus operator terverifikasi)</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Session Security Policy Note */}
                <div className="p-3 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-slate-300 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Integritas Sesi Multi-Tenant Aktif</span>
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    Sesi Anda terikat dengan wewenang resmi ({role}). Demi integritas audit trail logistik, perpindahan akun atau persona dinonaktifkan selama sesi aktif. Klik tombol di bawah untuk keluar dari sesi sebelum masuk dengan akun lain.
                  </p>
                </div>

                {/* Logout Action */}
                <div className="pt-3 border-t border-[#1c2432] flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-sans">
                    Sesi tersinkronisasi aman melalui Supabase Auth
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="cursor-pointer px-3.5 py-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar dari Sesi</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* TAB 1: 1-KLIK PERSONA (EVALUATOR) */}
          {activeTab === 'persona' && (
            <div className="space-y-4">
              {!isAuthenticated ? (
                <div className="p-3 rounded-md bg-amber-950/30 border border-amber-500/30 text-xs font-sans text-amber-200 leading-relaxed flex items-start gap-2.5">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div className="space-y-2">
                    <div>
                      <strong className="block text-amber-300 uppercase tracking-wide text-xs font-mono mb-0.5">
                        Peran Operasional Terkunci
                      </strong>
                      <span>{GUEST_LOCK_MESSAGE}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusMessage(null);
                        setActiveTab('password');
                      }}
                      className="cursor-pointer px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 hover:text-white text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Masuk dengan Kata Sandi / Akun</span>
                    </button>
                  </div>
                </div>
              ) : !isSandboxAccount ? (
                <div className="p-3.5 rounded-md bg-amber-950/20 border border-amber-500/30 text-xs font-sans text-amber-200">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Akun Organisasi Enterprise Terkunci</span>
                  </div>
                  <p className="mt-1 text-slate-300 leading-relaxed">
                    Anda terautentikasi dengan akun resmi ({user.email}). Peran dan wewenang operasional dikunci sesuai penugasan organisasi Anda ({user.org_name || user.company_id}). Pengalihan persona 1-klik hanya diizinkan untuk akun sandbox evaluasi.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-[#121822] border border-[#1c2432] text-xs font-sans text-slate-300 leading-relaxed">
                  Pilih persona di bawah untuk menguji adaptasi antarmuka, hak akses navigasi, dan wewenang operasional secara instan dalam lingkungan sandbox.
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {/* 1. DISPATCHER */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('DISPATCHER')}
                  disabled={isLoading || !isSandboxAccount}
                  className={`w-full text-left p-4 rounded-md border transition-colors duration-150 flex flex-col gap-2 relative overflow-hidden group ${
                    !isAuthenticated || !isSandboxAccount ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer '
                  }${
                    role === 'DISPATCHER'
                      ? 'bg-[#121822] border-white shadow-sm'
                      : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-500 hover:bg-[#121822]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-300 flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white uppercase tracking-wider">
                            Dispatcher Logistik
                          </span>
                          {role === 'DISPATCHER' && (
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-white text-[#080d14]">
                              Aktif
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          PT Samudera Logistik Sumatra
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <p className="text-xs font-sans text-slate-400 leading-relaxed">
                    Wewenang penuh koordinasi rute bypass, manajemen armada truk/kapal, manifest kargo, serta menyetujui pengalihan rute darurat.
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#1c2432] text-xs font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Rute Darurat
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Persetujuan Detour
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Unggah Manifest
                    </span>
                  </div>
                </button>

                {/* 2. REGULATOR */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('REGULATOR')}
                  disabled={isLoading || !isSandboxAccount}
                  className={`w-full text-left p-4 rounded-md border transition-colors duration-150 flex flex-col gap-2 relative overflow-hidden group ${
                    !isAuthenticated || !isSandboxAccount ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer '
                  }${
                    role === 'REGULATOR'
                      ? 'bg-[#121822] border-white shadow-sm'
                      : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-500 hover:bg-[#121822]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-300 flex items-center justify-center">
                        <Scale className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white uppercase tracking-wider">
                            Regulator Pemerintah
                          </span>
                          {role === 'REGULATOR' && (
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-white text-[#080d14]">
                              Aktif
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          Badan Pangan Nasional / Kemenhub
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <p className="text-xs font-sans text-slate-400 leading-relaxed">
                    Pengawasan stabilitas koridor makro, analisis disparitas harga komoditas pangan PIHPS, dan ekspor laporan kabinet B2G.
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#1c2432] text-xs font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Heatmap Kerentanan
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Analitik PIHPS
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Briefing Kabinet
                    </span>
                  </div>
                </button>

                {/* 3. GUEST */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('GUEST')}
                  disabled={isLoading || !isSandboxAccount}
                  className={`w-full text-left p-4 rounded-md border transition-colors duration-150 flex flex-col gap-2 relative overflow-hidden group ${
                    !isAuthenticated || !isSandboxAccount ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer '
                  }${
                    role === 'GUEST'
                      ? 'bg-[#121822] border-white shadow-sm'
                      : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-500 hover:bg-[#121822]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-300 flex items-center justify-center">
                        <FlaskConical className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white uppercase tracking-wider">
                            Evaluator Sandbox
                          </span>
                          {role === 'GUEST' && (
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-white text-[#080d14]">
                              Aktif
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          Kompetisi LRIP Demo Sandbox
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <p className="text-xs font-sans text-slate-400 leading-relaxed">
                    Mode Pratinjau Terbatas (Evaluasi Tamu): Akses pemantauan peta dasar tanpa hak wewenang persetujuan atau mutasi rute operasional.
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#1c2432] text-xs font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Sandbox Peta
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Audit Benchmark
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Akses Terbatas
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EMAIL & SANDI */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Alamat Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@logistik.id"
                  className="w-full px-3.5 py-2 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 font-sans transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Kata Sandi</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 font-sans transition"
                  required
                />
              </div>

              {isSignUp && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      <span>Afiliasi Organisasi / Mitra Pilot</span>
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-white focus:outline-none focus:border-slate-400 font-sans transition cursor-pointer"
                    >
                      {PILOT_ORGANIZATIONS.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2.5 rounded-md bg-[#121822] border border-[#1c2432] text-xs font-sans text-slate-400 leading-relaxed flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span>
                      Pendaftaran mandiri baru otomatis diberikan akses Tamu (Sandbox). Wewenang operasional Dispatcher dan Regulator memerlukan undangan resmi atau persetujuan operator.
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-md bg-white hover:bg-slate-200 text-[#080d14] text-xs font-semibold font-sans transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span>Memproses...</span>
                ) : isSignUp ? (
                  <span>Daftar Akun Baru</span>
                ) : (
                  <span>Masuk ke Dashboard</span>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs font-sans text-slate-400 hover:text-white transition cursor-pointer"
                >
                  {isSignUp
                    ? 'Sudah punya akun? Masuk di sini'
                    : 'Belum punya akun? Buat akun baru'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: MAGIC LINK */}
          {activeTab === 'magic' && (
            <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
              <div className="p-3 rounded-md bg-[#121822] border border-[#1c2432] text-xs font-sans text-slate-300 leading-relaxed">
                Masuk tanpa sandi menggunakan tautan instan yang dikirim langsung ke alamat email Anda melalui Supabase Auth.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Alamat Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@logistik.id"
                  className="w-full px-3.5 py-2 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 font-sans transition"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-md bg-white hover:bg-slate-200 text-[#080d14] text-xs font-semibold font-sans transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoading ? <span>Mengirim...</span> : <span>Kirim Tautan Masuk Instan</span>}
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#1c2432] bg-[#080d14] flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>Sesi: <strong className="text-slate-200">{isAuthenticated ? (user?.name || 'Terautentikasi') : 'Belum Masuk (Tamu)'}</strong></span>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#121822] border border-[#1c2432] text-slate-300">
            {isAuthenticated ? role : 'GUEST'}
          </span>
        </div>
      </div>
    </div>
  );
}
