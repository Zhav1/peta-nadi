'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Truck,
  Ship,
  Plane,
  Upload,
  Radio,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Download,
  Send,
  PlusCircle,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CustomVehicleRegisterPayload, TMSWebhookPingPayload } from '@/lib/types';

interface FleetOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userRole?: string;
}

const STRATEGIC_HUBS = [
  'Pelabuhan Belawan',
  'Medan',
  'Pasar Induk Lau Cih Medan',
  'Binjai',
  'Tebing Tinggi',
  'Pematang Siantar',
  'Kabanjahe (Karo)',
  'Berastagi',
  'Kisaran',
  'Rantauprapat',
  'Sibolga',
  'Tarutung',
  'Balige',
  'Banda Aceh',
  'Lhokseumawe',
  'Kota Langsa',
  'Meulaboh',
  'Tapaktuan',
  'Pekanbaru',
  'Pelabuhan Dumai',
  'Duri',
  'Padang',
  'Pelabuhan Teluk Bayur',
  'Bukittinggi',
  'Payakumbuh',
  'Kota Solok',
  'Kota Jambi',
  'Muara Tembesi',
  'Kota Bengkulu',
  'Curup (Rejang Lebong)',
  'Palembang',
  'Lubuklinggau',
  'Prabumulih',
  'Kayu Agung',
  'Bandar Lampung',
  'Pelabuhan Panjang',
  'Kotabumi',
  'Kota Metro',
  'Terbanggi Besar',
  'Pelabuhan Bakauheni',
  'Bandara Kualanamu (KNO)',
  'Bandara Minangkabau (BIM)',
  'Bandara Sultan Mahmud Badaruddin II (PLM)',
  'Bandara Radin Inten II (TKG)',
  'Bandara Sultan Syarif Kasim II (PKU)',
  'Bandara Sultan Iskandar Muda (BTJ)',
  'Bandara Sultan Thaha (DJB)',
  'Soekarno-Hatta (CGK)',
  'Halim Perdanakusuma (HLP)',
];

export function FleetOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  userRole = 'DISPATCHER',
}: FleetOnboardingModalProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'manifest' | 'webhook'>('single');

  // Single Vehicle Form State
  const [singleForm, setSingleForm] = useState<CustomVehicleRegisterPayload>({
    vehicle_id: '',
    name: '',
    modality: 'truck',
    driver_name: '',
    driver_phone: '',
    cargo: '',
    origin: 'Pelabuhan Belawan',
    destination: 'Medan',
    speed_kmh: 60,
    temperature_c: undefined,
  });

  // Bulk Manifest State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Webhook Test State
  const [webhookForm, setWebhookForm] = useState<TMSWebhookPingPayload>({
    vehicle_id: '',
    latitude: 3.5952,
    longitude: 98.6722,
    speed_kmh: 58.0,
    heading_deg: 90.0,
    temperature_c: 2.8,
  });

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const isRegulator = userRole.toUpperCase() === 'REGULATOR';
  const apiBase = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? window.location.origin : 'http://localhost:8000');

  const handleCopyWebhookUrl = () => {
    const url = `${apiBase}/api/v1/fleet/telemetry/ingest`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleDownloadTemplate = async () => {
    try {
      const tpl = await api.fleet.getManifestTemplate();
      const blob = new Blob([tpl.sample_csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'prehub_manifest_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setFeedback({ type: 'error', message: 'Gagal mengunduh template manifest.' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.trim().split('\n');
      if (lines.length <= 1) return;

      const headers = lines[0].split(',').map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim());
        const rowObj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rowObj[h] = values[idx] || '';
        });
        return rowObj;
      });
      setParsedRows(rows);
    };
    reader.readAsText(file);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegulator) {
      setFeedback({ type: 'error', message: 'Regulator hanya memiliki hak akses baca (Read-Only).' });
      return;
    }
    if (!singleForm.vehicle_id.trim() || !singleForm.name.trim()) {
      setFeedback({ type: 'error', message: 'Nomor Polisi / ID dan Nama Armada wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.fleet.register(singleForm);
      setFeedback({ type: 'success', message: res.message });
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mendaftarkan armada.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (isRegulator) {
      setFeedback({ type: 'error', message: 'Regulator hanya memiliki hak akses baca (Read-Only).' });
      return;
    }
    if (!csvFile) {
      setFeedback({ type: 'error', message: 'Silakan pilih file CSV manifest terlebih dahulu.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.fleet.uploadManifestFile(csvFile, 'Import Manifest Pengguna');
      setFeedback({ type: 'success', message: res.message });
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengimpor manifest.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWebhookPingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookForm.vehicle_id.trim()) {
      setFeedback({ type: 'error', message: 'ID Armada wajib diisi untuk pengujian telemetri GPS.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.fleet.simulatePing(webhookForm);
      setFeedback({ type: 'success', message: res.message });
      onSuccess?.();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengirim telemetri ping.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-[#1c2432] bg-[#0c1017] shadow-xl text-slate-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c2432] bg-[#121822]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-200">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                Integrasi Armada & Telemetri GPS
              </h2>
              <p className="text-xs text-slate-400">
                Pendaftaran armada mandiri, unggah manifest logistik, dan streaming telemetri TMS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#0c1017] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role Warning Banner for Regulator */}
        {isRegulator && (
          <div className="px-6 py-2.5 bg-amber-950/30 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Mode Regulator (Read-Only): Anda dapat melihat spesifikasi dan format integrasi, namun perubahan dibatasi.
            </span>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex border-b border-[#1c2432] bg-[#080d14] px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('single');
              setFeedback(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-md transition-colors cursor-pointer border-b-2 ${
              activeTab === 'single'
                ? 'border-white text-white bg-[#0c1017]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Pendaftaran Manual
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('manifest');
              setFeedback(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-md transition-colors cursor-pointer border-b-2 ${
              activeTab === 'manifest'
                ? 'border-white text-white bg-[#0c1017]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Unggah Manifest (CSV)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('webhook');
              setFeedback(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-md transition-colors cursor-pointer border-b-2 ${
              activeTab === 'webhook'
                ? 'border-white text-white bg-[#0c1017]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Integrasi TMS & Simulator Ping
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* TAB 1: Single Vehicle Form */}
          {activeTab === 'single' && (
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nomor Polisi / ID Armada *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isRegulator}
                    placeholder="Contoh: BK-8821-XA"
                    value={singleForm.vehicle_id}
                    onChange={(e) => setSingleForm({ ...singleForm, vehicle_id: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Unit / Panggilan *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isRegulator}
                    placeholder="Contoh: Truk Sayur Berastagi #4"
                    value={singleForm.name}
                    onChange={(e) => setSingleForm({ ...singleForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Moda Transportasi
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['truck', 'maritime', 'air'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={isRegulator}
                        onClick={() => setSingleForm({ ...singleForm, modality: m })}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs rounded-lg border transition-all cursor-pointer ${
                          singleForm.modality === m
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-medium'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m === 'truck' && <Truck className="w-3.5 h-3.5" />}
                        {m === 'maritime' && <Ship className="w-3.5 h-3.5" />}
                        {m === 'air' && <Plane className="w-3.5 h-3.5" />}
                        <span className="capitalize">{m === 'truck' ? 'Truk' : m === 'maritime' ? 'Kapal' : 'Pesawat'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Komoditas / Muatan
                  </label>
                  <input
                    type="text"
                    disabled={isRegulator}
                    placeholder="Contoh: 12 Ton Cabai & Sayur Segar"
                    value={singleForm.cargo || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, cargo: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Hub Asal
                  </label>
                  <select
                    disabled={isRegulator}
                    value={singleForm.origin || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, origin: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[#141820] border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    {STRATEGIC_HUBS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Hub Tujuan
                  </label>
                  <select
                    disabled={isRegulator}
                    value={singleForm.destination || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, destination: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[#141820] border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    {STRATEGIC_HUBS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Pengemudi / Sopir
                  </label>
                  <input
                    type="text"
                    disabled={isRegulator}
                    placeholder="Contoh: Budi Santoso"
                    value={singleForm.driver_name || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, driver_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kontak Pengemudi (WhatsApp)
                  </label>
                  <input
                    type="text"
                    disabled={isRegulator}
                    placeholder="Contoh: +6281234567890"
                    value={singleForm.driver_phone || ''}
                    onChange={(e) => setSingleForm({ ...singleForm, driver_phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Suhu Reefer / Cold-Chain (°C)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      disabled={isRegulator}
                      placeholder="Contoh: 2.5 (Kosongkan jika bukan pendingin)"
                      value={singleForm.temperature_c ?? ''}
                      onChange={(e) =>
                        setSingleForm({
                          ...singleForm,
                          temperature_c: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                    />
                    {singleForm.temperature_c !== undefined && (
                      <span
                        className={`text-[10px] font-mono px-2 py-1 rounded shrink-0 border ${
                          singleForm.temperature_c <= 4.0
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        }`}
                      >
                        {singleForm.temperature_c <= 4.0 ? 'NORMAL' : 'EXCURSION'}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kecepatan Nominal (km/j)
                  </label>
                  <input
                    type="number"
                    disabled={isRegulator}
                    value={singleForm.speed_kmh}
                    onChange={(e) =>
                      setSingleForm({
                        ...singleForm,
                        speed_kmh: parseFloat(e.target.value) || 60,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#1c2432] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#121822] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isRegulator}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md bg-white hover:bg-slate-200 text-[#080d14] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PlusCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Daftarkan Armada</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Bulk CSV Manifest Upload */}
          {activeTab === 'manifest' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">Unggah File Manifest Pengiriman</h3>
                  <p className="text-xs text-slate-400">
                    Mendukung format CSV standar dengan kolom ID, nama, moda, asal, tujuan, dan suhu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[#121822] border border-[#1c2432] text-slate-200 hover:bg-[#1a2230] transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template CSV</span>
                </button>
              </div>

              {/* Dropzone */}
              <div
                onClick={() => !isRegulator && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${
                  isRegulator
                    ? 'border-[#1c2432] bg-[#0c1017] cursor-not-allowed opacity-60'
                    : 'border-[#1c2432] hover:border-slate-500 bg-[#121822] hover:bg-[#1a2230] cursor-pointer'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-9 h-9 rounded-md bg-[#0c1017] border border-[#1c2432] flex items-center justify-center text-slate-300">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-200">
                      {csvFile ? csvFile.name : 'Pilih file CSV atau tarik ke sini'}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ukuran maksimal 5 MB. Otomatis memvalidasi koordinat hub Sumatra.
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span>Pratinjau Data ({parsedRows.length} Unit)</span>
                    <span className="text-emerald-400 font-mono text-xs tabular-nums">Valid & Siap Diimpor</span>
                  </div>
                  <div className="border border-[#1c2432] rounded-md overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#121822] text-slate-400 sticky top-0">
                        <tr>
                          <th className="p-2 font-medium">ID</th>
                          <th className="p-2 font-medium">Nama</th>
                          <th className="p-2 font-medium">Moda</th>
                          <th className="p-2 font-medium">Asal</th>
                          <th className="p-2 font-medium">Tujuan</th>
                          <th className="p-2 font-medium">Muatan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1c2432] text-slate-300 font-mono tabular-nums">
                        {parsedRows.slice(0, 8).map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#121822]/60">
                            <td className="p-2 text-white font-semibold">{row.vehicle_id}</td>
                            <td className="p-2 font-sans">{row.name}</td>
                            <td className="p-2 capitalize">{row.modality || 'truck'}</td>
                            <td className="p-2">{row.origin}</td>
                            <td className="p-2">{row.destination}</td>
                            <td className="p-2 text-slate-400">{row.cargo || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-[#1c2432] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#121822] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !csvFile || isRegulator}
                  onClick={handleBulkSubmit}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md bg-white hover:bg-slate-200 text-[#080d14] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Impor {parsedRows.length > 0 ? `${parsedRows.length} Armada` : 'Manifest'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: TMS Webhook Guide & Live Ping Simulator */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
              {/* Webhook Endpoint Box */}
              <div className="p-4 rounded-md bg-[#121822] border border-[#1c2432] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Endpoint Webhook TMS Eksternal</span>
                  <button
                    type="button"
                    onClick={handleCopyWebhookUrl}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Tersalin' : 'Salin URL'}</span>
                  </button>
                </div>
                <div className="p-2 rounded bg-[#080d14] font-mono text-xs text-slate-200 border border-[#1c2432] overflow-x-auto select-all">
                  POST {apiBase}/api/v1/fleet/telemetry/ingest
                </div>
                <p className="text-xs text-slate-400">
                  Kompatibel dengan streaming telemetri Traccar, EasyGo, McEasy, dan GPS IoT Tracker standar.
                </p>
              </div>

              {/* Simulator Section */}
              <div className="p-4 rounded-md bg-[#121822] border border-[#1c2432] space-y-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-semibold text-slate-200">Simulator Pengujian Ping GPS</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Kirim koordinat GPS instan untuk menggerakkan armada di peta secara real-time.
                </p>

                <form onSubmit={handleWebhookPingSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">ID Armada Sasaran *</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: TRK-003-BELAWAN-TEBING"
                        value={webhookForm.vehicle_id}
                        onChange={(e) => setWebhookForm({ ...webhookForm, vehicle_id: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Kecepatan (km/j)</label>
                      <input
                        type="number"
                        value={webhookForm.speed_kmh}
                        onChange={(e) =>
                          setWebhookForm({ ...webhookForm, speed_kmh: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={webhookForm.latitude}
                        onChange={(e) =>
                          setWebhookForm({ ...webhookForm, latitude: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={webhookForm.longitude}
                        onChange={(e) =>
                          setWebhookForm({ ...webhookForm, longitude: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Suhu Reefer (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={webhookForm.temperature_c ?? ''}
                        onChange={(e) =>
                          setWebhookForm({
                            ...webhookForm,
                            temperature_c: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Arah Heading (°)</label>
                      <input
                        type="number"
                        value={webhookForm.heading_deg ?? 90}
                        onChange={(e) =>
                          setWebhookForm({ ...webhookForm, heading_deg: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-white hover:bg-slate-200 text-[#080d14] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Kirim Ping Telemetri</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
