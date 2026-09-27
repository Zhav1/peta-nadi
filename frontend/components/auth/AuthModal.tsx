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
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-[#0c0e12]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl overflow-hidden flex flex-col pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-sans text-white uppercase tracking-wider">
                Manajemen Ruang Kerja & Akses Persona
              </h2>
              <p className="text-[10px] font-mono text-slate-400">
                Otentikasi Multi-Tenant Supabase & Kontrol Akses Berbasis Peran (RBAC)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/5 bg-slate-950/20 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setActiveTab('persona');
              setStatusMessage(null);
            }}
            className={`cursor-pointer px-4 py-2 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === 'persona'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
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
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
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
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
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
            className={`mx-6 mt-4 p-3 rounded-xl border text-xs font-sans flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
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
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] font-sans text-slate-300 leading-relaxed">
                Pilih persona di bawah untuk menguji adaptasi antarmuka, hak akses navigasi, dan wewenang operasional secara instan tanpa perlu mendaftar ulang.
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* 1. DISPATCHER */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('DISPATCHER')}
                  disabled={isLoading}
                  className={`cursor-pointer w-full text-left p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 relative overflow-hidden group ${
                    role === 'DISPATCHER'
                      ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-950/50'
                      : 'bg-[#141820]/70 border-white/10 hover:border-cyan-500/40 hover:bg-[#181d28]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Dispatcher Logistik
                          </span>
                          {role === 'DISPATCHER' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500 text-slate-950">
                              AKTIF
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-cyan-400/90">
                          PT Samudera Logistik Sumatra
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-1" />
                  </div>

                  <p className="text-[11px] font-sans text-slate-400 leading-relaxed">
                    Wewenang penuh koordinasi rute bypass, manajemen armada truk/kapal, manifest kargo, serta menyetujui pengalihan rute darurat.
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/5 text-[9px] font-mono text-slate-300">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Rute Darurat
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Persetujuan Detour
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Unggah Manifest
                    </span>
                  </div>
                </button>

                {/* 2. REGULATOR */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('REGULATOR')}
                  disabled={isLoading}
                  className={`cursor-pointer w-full text-left p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 relative overflow-hidden group ${
                    role === 'REGULATOR'
                      ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/40 shadow-lg shadow-amber-950/50'
                      : 'bg-[#141820]/70 border-white/10 hover:border-amber-500/40 hover:bg-[#181d28]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                        <Scale className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Regulator Pemerintah
                          </span>
                          {role === 'REGULATOR' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500 text-slate-950">
                              AKTIF
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-amber-400/90">
                          Badan Pangan Nasional / Kemenhub
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-transform group-hover:translate-x-1" />
                  </div>

                  <p className="text-[11px] font-sans text-slate-400 leading-relaxed">
                    Pengawasan stabilitas koridor makro, analisis disparitas harga komoditas pangan PIHPS, dan ekspor laporan kabinet B2G. (Aksi approval dibatasi).
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/5 text-[9px] font-mono text-slate-300">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Heatmap Kerentanan
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Analitik PIHPS
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Briefing Kabinet
                    </span>
                  </div>
                </button>

                {/* 3. GUEST */}
                <button
                  type="button"
                  onClick={() => handlePersonaSelect('GUEST')}
                  disabled={isLoading}
                  className={`cursor-pointer w-full text-left p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2 relative overflow-hidden group ${
                    role === 'GUEST'
                      ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/50'
                      : 'bg-[#141820]/70 border-white/10 hover:border-emerald-500/40 hover:bg-[#181d28]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                        <FlaskConical className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Evaluator Sandbox
                          </span>
                          {role === 'GUEST' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500 text-slate-950">
                              AKTIF
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400/90">
                          Kompetisi LRIP Demo Sandbox
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-transform group-hover:translate-x-1" />
                  </div>

                  <p className="text-[11px] font-sans text-slate-400 leading-relaxed">
                    Akses terbuka penuh tanpa batasan untuk simulasi bencana interaktif, audit benchmark empiris, dan peninjauan seluruh modul teknis.
                  </p>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/5 text-[9px] font-mono text-slate-300">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Sandbox Peta
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
                      Audit Benchmark
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5">
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
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Alamat Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@logistik.id"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 font-sans transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Kata Sandi</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 font-sans transition"
                  required
                />
              </div>

              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Peran Akun Baru</span>
                  </label>
                  <select
                    value={selectedSignupRole}
                    onChange={(e) => setSelectedSignupRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500/60 font-sans transition"
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
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-sans uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-2"
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
                  className="text-xs font-mono text-slate-400 hover:text-cyan-400 transition cursor-pointer"
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
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] font-sans text-slate-300 leading-relaxed">
                Masuk tanpa sandi menggunakan tautan instan yang dikirim langsung ke alamat email Anda melalui Supabase Auth.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Alamat Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@logistik.id"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 font-sans transition"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-sans uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoading ? <span>Mengirim...</span> : <span>Kirim Tautan Masuk Instan</span>}
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-slate-950/40 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sesi Aktif: <strong className="text-slate-200">{user.name}</strong></span>
          </div>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-cyan-300">
            {role}
          </span>
        </div>
      </div>
    </div>
  );
}
