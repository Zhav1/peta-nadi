'use client';

import React, { useState } from 'react';
import {
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
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import type { UserRole } from '@/lib/types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { user, role, switchRole, login, signUp, loginWithMagicLink, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'persona' | 'password' | 'magic'>('persona');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedSignupRole, setSelectedSignupRole] = useState<UserRole>('DISPATCHER');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handlePersonaSelect = async (targetRole: UserRole) => {
    setStatusMessage(null);
    await switchRole(targetRole);
    onClose();
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    if (!email || !password) {
      setStatusMessage({ type: 'error', text: 'Silakan isi email dan kata sandi.' });
      return;
    }

    if (isSignUp) {
      const res = await signUp(email, password, selectedSignupRole);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Akun berhasil dibuat. Sesi aktif siap digunakan.' });
        setTimeout(onClose, 800);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Gagal mendaftarkan akun.' });
      }
    } else {
      const res = await login(email, password);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Berhasil masuk.' });
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
                Manajemen Ruang Kerja & Akses Persona
              </h2>
              <p className="text-xs font-mono text-slate-400">
                Otentikasi Multi-Tenant Supabase & Kontrol Akses Berbasis Peran (RBAC)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md bg-[#0c1017] text-slate-400 hover:text-white transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[#1c2432] bg-[#080d14] text-xs">
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
            <span>1-Klik Persona (Evaluator)</span>
          </button>

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
            <span>Email & Sandi</span>
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

        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-md border text-xs font-sans flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[65vh]">
          {/* TAB 1: 1-KLIK PERSONA (EVALUATOR) */}
          {activeTab === 'persona' && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-[#121822] border border-[#1c2432] text-xs font-sans text-slate-300 leading-relaxed">
                Pilih persona di bawah untuk menguji adaptasi antarmuka, hak akses navigasi, dan wewenang operasional secara instan tanpa perlu mendaftar ulang.
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* 1. DISPATCHER */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('DISPATCHER')}
                  disabled={isLoading}
                  className={`cursor-pointer w-full text-left p-4 rounded-md border transition-colors duration-150 flex flex-col gap-2 relative overflow-hidden group ${
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
                  disabled={isLoading}
                  className={`cursor-pointer w-full text-left p-4 rounded-md border transition-colors duration-150 flex flex-col gap-2 relative overflow-hidden group ${
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
                  disabled={isLoading}
                  className={`cursor-pointer w-full text-left p-4 rounded-md border transition-colors duration-150 flex flex-col gap-2 relative overflow-hidden group ${
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
                    Akses terbuka penuh tanpa batasan untuk simulasi bencana interaktif, audit benchmark empiris, dan peninjauan seluruh modul teknis.
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#1c2432] text-xs font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Sandbox Peta
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Audit Benchmark
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#080d14] border border-[#1c2432]">
                      Akses Penuh
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
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    <span>Peran Akun Baru</span>
                  </label>
                  <select
                    value={selectedSignupRole}
                    onChange={(e) => setSelectedSignupRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-white focus:outline-none focus:border-slate-400 font-sans transition"
                  >
                    <option value="DISPATCHER">Dispatcher Logistik (PT Samudera)</option>
                    <option value="REGULATOR">Regulator Pemerintah (Bapanas/Kemenhub)</option>
                    <option value="GUEST">Evaluator Sandbox (Guest)</option>
                  </select>
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
            <span>Sesi Aktif: <strong className="text-slate-200">{user.name}</strong></span>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#121822] border border-[#1c2432] text-slate-300">
            {role}
          </span>
        </div>
      </div>
    </div>
  );
}
