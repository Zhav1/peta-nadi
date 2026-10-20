'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Truck,
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
  Search,
  MapPin,
  Clock,
  ArrowRight,
  ArrowLeft,
  PackageOpen,
  Fuel,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getBaseUrl } from '@/lib/baseUrl';
import type {
  TMSWebhookPingPayload,
  GeocodeSearchResult,
  TruckAsset,
  TruckAssetCreatePayload,
  TravelCreatePayload,
  TravelStatus,
} from '@/lib/types';

interface FleetOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userRole?: string;
  companyId?: string;
  companyName?: string;
}

const GOLONGAN_OPTIONS = ['GOL_I', 'GOL_II', 'GOL_III', 'GOL_IV', 'GOL_V'];

const COMMODITY_OPTIONS = [
  { value: 'cabai_merah', label: 'Cabai Merah (ultra-perishable)' },
  { value: 'sayur_segar', label: 'Sayur Segar (ultra-perishable)' },
  { value: 'tomat', label: 'Tomat (ultra-perishable)' },
  { value: 'daging_sapi', label: 'Daging Sapi (cold-chain)' },
  { value: 'ikan_segar', label: 'Ikan Segar (cold-chain)' },
  { value: 'bawang_merah', label: 'Bawang Merah (semi-perishable)' },
  { value: 'kentang', label: 'Kentang (semi-perishable)' },
  { value: 'beras', label: 'Beras (dry bulk)' },
  { value: 'minyak_goreng', label: 'Minyak Goreng (dry bulk)' },
  { value: 'gula_pasir', label: 'Gula Pasir (dry bulk)' },
];

interface TollSegmentOption {
  id: string;
  name: string;
}

export function FleetOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  userRole = 'DISPATCHER',
  companyId,
  companyName,
}: FleetOnboardingModalProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'manifest' | 'webhook'>('single');
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);

  // Step 1 — master truck asset
  const [truckForm, setTruckForm] = useState<TruckAssetCreatePayload>({
    truck_id: '',
    name: '',
    vin: '',
    vehicle_golongan: 'GOL_II',
    driver_name: '',
    driver_phone: '',
    gross_weight_ton: 12.0,
    fuel_type: 'biosolar',
  });
  const [truckAssets, setTruckAssets] = useState<TruckAsset[]>([]);
  const [isLoadingTrucks, setIsLoadingTrucks] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState('');

  // Step 2 — transactional travel / rit
  const [ritForm, setRitForm] = useState<Omit<TravelCreatePayload, 'origin_coords' | 'dest_coords'>>({
    truck_id: '',
    origin_name: '',
    destination_name: '',
    commodity_key: 'cabai_merah',
    cargo_tonnage: 10.0,
    cargo_value_idr: undefined,
    sla_deadline_hours: 12.0,
    baseline_time_hours: 4.0,
    blocked_delay_hours: 0.0,
    rerouted: false,
    status: 'planned',
  });
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [selectedTollSegments, setSelectedTollSegments] = useState<string[]>([]);
  const [tollSegments, setTollSegments] = useState<TollSegmentOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Gazetteer autocomplete (verified coordinates only — no centroid fallback)
  const [originQuery, setOriginQuery] = useState('');
  const [originSearchResults, setOriginSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [originSearchError, setOriginSearchError] = useState<string | null>(null);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);

  const [destQuery, setDestQuery] = useState('');
  const [destSearchResults, setDestSearchResults] = useState<GeocodeSearchResult[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const [destSearchError, setDestSearchError] = useState<string | null>(null);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  // Bulk manifest
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Webhook test
  const [webhookForm, setWebhookForm] = useState<TMSWebhookPingPayload>({
    vehicle_id: '',
    latitude: 3.5952,
    longitude: 98.6722,
    speed_kmh: 58.0,
    heading_deg: 90.0,
    temperature_c: 2.8,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const isDispatcher = userRole.toUpperCase() === 'DISPATCHER';
  const isRegulator = userRole.toUpperCase() === 'REGULATOR';
  // Resolve through getBaseUrl() so the webhook URL shown to dispatchers is the
  // real backend even when NEXT_PUBLIC_API_URL is stale/malformed.
  const apiBase = getBaseUrl();

  // Load asset master + BPJT segments when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function loadTrucks() {
      setIsLoadingTrucks(true);
      try {
        const rows = await api.fleet.listTrucks(companyId);
        if (!cancelled) setTruckAssets(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setTruckAssets([]);
      } finally {
        if (!cancelled) setIsLoadingTrucks(false);
      }
    }

    async function loadTollSegments() {
      try {
        const tariffs = await api.intermodal.getTollTariffs();
        const segments = (tariffs?.bpjt_segments || {}) as Record<string, { name?: string }>;
        if (!cancelled) {
          setTollSegments(
            Object.entries(segments).map(([id, seg]) => ({
              id,
              name: seg?.name || id,
            }))
          );
        }
      } catch {
        if (!cancelled) setTollSegments([]);
      }
    }

    loadTrucks();
    loadTollSegments();
    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId]);

  // Verified gazetteer search — on failure we clear results and surface the
  // error; we never invent a coordinate from a hardcoded hub or a centroid.
  useEffect(() => {
    const q = originQuery.trim();
    if (q.length < 2) {
      setOriginSearchResults([]);
      setOriginSearchError(null);
      setIsSearchingOrigin(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingOrigin(true);
      setOriginSearchError(null);
      try {
        const res = await api.geocode.search(q, controller.signal);
        setOriginSearchResults(res?.results || []);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setOriginSearchResults([]);
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        setOriginSearchError(`Pencarian gagal${detail} — backend tidak merespons. Coba lagi.`);
      } finally {
        if (!controller.signal.aborted) setIsSearchingOrigin(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [originQuery]);

  useEffect(() => {
    const q = destQuery.trim();
    if (q.length < 2) {
      setDestSearchResults([]);
      setDestSearchError(null);
      setIsSearchingDest(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingDest(true);
      setDestSearchError(null);
      try {
        const res = await api.geocode.search(q, controller.signal);
        setDestSearchResults(res?.results || []);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setDestSearchResults([]);
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        setDestSearchError(`Pencarian gagal${detail} — backend tidak merespons. Coba lagi.`);
      } finally {
        if (!controller.signal.aborted) setIsSearchingDest(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [destQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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

  // ---- Step 1: register the truck asset once ----
  const handleSaveTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDispatcher) {
      setFeedback({
        type: 'error',
        message: 'Wewenang ditolak: pendaftaran aset truk hanya dapat dilakukan oleh DISPATCHER.',
      });
      return;
    }
    if (!truckForm.truck_id.trim() || !truckForm.name.trim()) {
      setFeedback({ type: 'error', message: 'Nomor polisi dan nama unit truk wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const saved = await api.fleet.createTruck({
        ...truckForm,
        truck_id: truckForm.truck_id.trim().toUpperCase(),
        company_id: truckForm.company_id || companyId,
        company_name: truckForm.company_name || companyName,
      });
      setTruckAssets((prev) => {
        const rest = prev.filter((t) => t.truck_id !== saved.truck_id);
        return [saved, ...rest];
      });
      setSelectedTruckId(saved.truck_id);
      setRitForm((prev) => ({ ...prev, truck_id: saved.truck_id }));
      setWizardStep(2);
      setFeedback({
        type: 'success',
        message: `Aset truk ${saved.truck_id} tersimpan. Lanjut membuat rit pertama.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFeedback({
        type: 'error',
        message: msg.includes('409')
          ? `Nomor polisi ${truckForm.truck_id} sudah terdaftar pada tenant lain. Gunakan ID berbeda.`
          : msg || 'Gagal menyimpan aset truk.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Step 2: create the rit against the chosen truck ----
  const handleCreateRit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDispatcher) {
      setFeedback({
        type: 'error',
        message: 'Wewenang ditolak: pembuatan rit hanya dapat dilakukan oleh DISPATCHER.',
      });
      return;
    }
    if (!selectedTruckId) {
      setFeedback({ type: 'error', message: 'Pilih aset truk terlebih dahulu.' });
      return;
    }
    if (!originCoords || !destCoords) {
      setFeedback({
        type: 'error',
        message:
          'Pilih asal dan tujuan dari hasil pencarian gazetteer. Koordinat wajib terverifikasi — sistem tidak memakai titik tengah perkiraan.',
      });
      return;
    }
    if (!ritForm.baseline_time_hours || ritForm.baseline_time_hours <= 0) {
      setFeedback({ type: 'error', message: 'Waktu tempuh baseline (jam) wajib lebih dari 0.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const created = await api.fleet.createTravel({
        ...ritForm,
        truck_id: selectedTruckId,
        origin_name: ritForm.origin_name || originQuery,
        destination_name: ritForm.destination_name || destQuery,
        origin_coords: originCoords,
        dest_coords: destCoords,
        baseline_toll_segments: selectedTollSegments,
      });
      setFeedback({
        type: 'success',
        message: `Rit ${created.id} (${created.truck_id}) tersimpan. Baseline Rp ${Math.round(
          created.baseline_cost_idr
        ).toLocaleString('id-ID')} • penghematan tercatat saat hasil aktual diisi.`,
      });
      onSuccess?.();
      setTimeout(() => onClose(), 1600);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat rit.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!isDispatcher) {
      setFeedback({
        type: 'error',
        message: 'Wewenang ditolak: unggah manifest hanya dapat dilakukan oleh DISPATCHER.',
      });
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
      setTimeout(() => onClose(), 1500);
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
    if (!isDispatcher) {
      setFeedback({
        type: 'error',
        message: 'Wewenang ditolak: simulasi webhook telemetri hanya dapat dilakukan oleh DISPATCHER.',
      });
      return;
    }
    if (!webhookForm.vehicle_id.trim()) {
      setFeedback({ type: 'error', message: 'ID armada wajib diisi untuk pengujian telemetri GPS.' });
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

  const noOriginResults =
    originQuery.trim().length >= 2 &&
    !isSearchingOrigin &&
    !originSearchError &&
    originSearchResults.length === 0 &&
    !originCoords;
  const noDestResults =
    destQuery.trim().length >= 2 &&
    !isSearchingDest &&
    !destSearchError &&
    destSearchResults.length === 0 &&
    !destCoords;

  const selectedTruck = truckAssets.find((t) => t.truck_id === selectedTruckId);

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
                Onboarding Aset Truk & Rit Logistik
              </h2>
              <p className="text-xs text-slate-400">
                Langkah 1 daftarkan truk sekali, Langkah 2 buat rit dengan asal/tujuan gazetteer terverifikasi
              </p>
            </div>
          </div>
          <button
            id="close-onboarding-modal-btn"
            title="Tutup Modal Onboarding"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#0c1017] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isDispatcher && (
          <div className="px-6 py-2.5 bg-amber-950/30 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {isRegulator
                ? 'Mode Regulator (Read-Only): agregat ERP tetap dapat dilihat, namun pendaftaran aset/rit khusus Dispatcher.'
                : 'Mode Evaluator Tamu (Read-Only): penulisan aset dan rit terkunci. Anda tetap dapat meninjau alur dua langkah.'}
            </span>
          </div>
        )}

        {/* Tab selector */}
        <div className="flex border-b border-[#1c2432] bg-[#080d14] px-6 pt-2 gap-2">
          {[
            { id: 'single' as const, label: 'Aset Truk & Rit', icon: Truck },
            { id: 'manifest' as const, label: 'Unggah Manifest (CSV)', icon: FileText },
            { id: 'webhook' as const, label: 'Integrasi TMS & Simulator', icon: Radio },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setFeedback(null);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer border-b-2 ${
                activeTab === tab.id
                  ? 'border-white text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
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

          {/* ================= TWO-STEP WIZARD ================= */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[
                  { step: 1 as const, label: 'Aset Truk', hint: 'Sekali daftar' },
                  { step: 2 as const, label: 'Rit Pengiriman', hint: 'Per perjalanan' },
                ].map((item) => (
                  <React.Fragment key={item.step}>
                    <button
                      type="button"
                      onClick={() => setWizardStep(item.step)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                        wizardStep === item.step
                          ? 'bg-cyan-500/15 border-cyan-400/60 text-white'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          wizardStep === item.step ? 'bg-cyan-400 text-[#080d14]' : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {item.step}
                      </span>
                      <span className="font-semibold">{item.label}</span>
                      <span className="text-[10px] font-mono text-slate-400">{item.hint}</span>
                    </button>
                    {item.step === 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                  </React.Fragment>
                ))}
              </div>

              {/* ---------- STEP 1 ---------- */}
              {wizardStep === 1 && (
                <form onSubmit={handleSaveTruck} className="space-y-4">
                  <div className="p-3 rounded-lg bg-[#121822] border border-[#1c2432] text-[11px] text-slate-400 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Aset truk adalah data master (nopol, VIN, golongan BPJT, pengemudi, perusahaan). Data ini
                      dipakai ulang oleh semua rit sehingga tidak perlu diinput berulang.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nomor Polisi / ID Truk *</label>
                      <input
                        type="text"
                        required
                        disabled={isRegulator}
                        placeholder="Contoh: BK-8821-XA"
                        value={truckForm.truck_id}
                        onChange={(e) => setTruckForm({ ...truckForm, truck_id: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nama Unit *</label>
                      <input
                        type="text"
                        required
                        disabled={isRegulator}
                        placeholder="Contoh: Truk Cold-Chain Sayur Berastagi #4"
                        value={truckForm.name}
                        onChange={(e) => setTruckForm({ ...truckForm, name: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">VIN / Nomor Rangka</label>
                      <input
                        type="text"
                        disabled={isRegulator}
                        placeholder="Contoh: MHF12TRK001PLM"
                        value={truckForm.vin || ''}
                        onChange={(e) => setTruckForm({ ...truckForm, vin: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Golongan Tol BPJT</label>
                      <select
                        disabled={isRegulator}
                        value={truckForm.vehicle_golongan}
                        onChange={(e) => setTruckForm({ ...truckForm, vehicle_golongan: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                      >
                        {GOLONGAN_OPTIONS.map((gol) => (
                          <option key={gol} value={gol} className="bg-[#0c1017]">
                            {gol.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nama Pengemudi</label>
                      <input
                        type="text"
                        disabled={isRegulator}
                        placeholder="Contoh: Budi Santoso"
                        value={truckForm.driver_name || ''}
                        onChange={(e) => setTruckForm({ ...truckForm, driver_name: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Kontak Pengemudi (WhatsApp)</label>
                      <input
                        type="text"
                        disabled={isRegulator}
                        placeholder="Contoh: +6281234567890"
                        value={truckForm.driver_phone || ''}
                        onChange={(e) => setTruckForm({ ...truckForm, driver_phone: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Berat Kotor (ton)</label>
                      <input
                        type="number"
                        step="0.1"
                        disabled={isRegulator}
                        value={truckForm.gross_weight_ton ?? 12}
                        onChange={(e) =>
                          setTruckForm({ ...truckForm, gross_weight_ton: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Jenis BBM Pertamina</label>
                      <select
                        disabled={isRegulator}
                        value={truckForm.fuel_type}
                        onChange={(e) =>
                          setTruckForm({
                            ...truckForm,
                            fuel_type: e.target.value as TruckAssetCreatePayload['fuel_type'],
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                      >
                        <option value="biosolar" className="bg-[#0c1017]">Biosolar</option>
                        <option value="dexlite" className="bg-[#0c1017]">Dexlite</option>
                        <option value="pertamina_dex" className="bg-[#0c1017]">Pertamina Dex</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#1c2432] flex justify-between items-center gap-3">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {companyId ? `Tenant: ${companyId}` : 'Tenant: mengikuti sesi login'}
                    </span>
                    <button
                      type="submit"
                      disabled={isSubmitting || isRegulator}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md bg-white hover:bg-slate-200 text-[#080d14] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                      <span>Simpan Aset & Lanjut ke Rit</span>
                    </button>
                  </div>
                </form>
              )}

              {/* ---------- STEP 2 ---------- */}
              {wizardStep === 2 && (
                <form onSubmit={handleCreateRit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-300">Aset Truk (Langkah 1) *</label>
                        <button
                          type="button"
                          onClick={() => setWizardStep(1)}
                          className="text-[11px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3 h-3" /> Tambah aset lain
                        </button>
                      </div>
                      <select
                        required
                        disabled={isRegulator || isLoadingTrucks}
                        value={selectedTruckId}
                        onChange={(e) => {
                          setSelectedTruckId(e.target.value);
                          setRitForm({ ...ritForm, truck_id: e.target.value });
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 cursor-pointer font-mono"
                      >
                        <option value="" className="bg-[#0c1017]">
                          {isLoadingTrucks ? 'Memuat aset truk...' : '— Pilih truk terdaftar —'}
                        </option>
                        {truckAssets.map((asset) => (
                          <option key={asset.truck_id} value={asset.truck_id} className="bg-[#0c1017]">
                            {asset.truck_id} — {asset.name} ({asset.vehicle_golongan}
                            {asset.source === 'legacy_custom_fleet' ? ' • legacy' : ''})
                          </option>
                        ))}
                      </select>
                      {selectedTruck && (
                        <p className="mt-1 text-[10px] text-slate-400 font-mono">
                          Pengemudi: {selectedTruck.driver_name || '—'} • BBM: {selectedTruck.fuel_type} • VIN:{' '}
                          {selectedTruck.vin || '—'}
                        </p>
                      )}
                      {truckAssets.length === 0 && !isLoadingTrucks && (
                        <p className="mt-1 text-[10px] text-amber-300">
                          Belum ada aset truk. Kembali ke Langkah 1 untuk mendaftarkan truk.
                        </p>
                      )}
                    </div>

                    {/* Origin */}
                    <div className="relative">
                      <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                        <span>Titik Asal (gazetteer) *</span>
                        {originCoords && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            [{originCoords[1].toFixed(4)}, {originCoords[0].toFixed(4)}]
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          disabled={isRegulator}
                          placeholder="Ketik desa, kecamatan, kota, atau hub..."
                          value={originQuery}
                          onChange={(e) => {
                            setOriginQuery(e.target.value);
                            setRitForm({ ...ritForm, origin_name: e.target.value });
                            setOriginCoords(null);
                            setShowOriginDropdown(true);
                          }}
                          onFocus={() => setShowOriginDropdown(true)}
                          className={`w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white/5 border text-slate-100 placeholder-slate-500 focus:outline-none ${
                            originCoords ? 'border-emerald-500/40 focus:border-emerald-400' : 'border-white/10 focus:border-cyan-500/50'
                          }`}
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                      </div>
                      {noOriginResults && (
                        <p className="mt-1 text-[10px] text-rose-300">
                          Tidak ada hasil gazetteer. Periksa ejaan — koordinat tidak diisi otomatis.
                        </p>
                      )}
                      {originSearchError && (
                        <p className="mt-1 text-[10px] text-amber-300">{originSearchError}</p>
                      )}
                      {showOriginDropdown &&
                        (originSearchResults.length > 0 ||
                          (isSearchingOrigin && originSearchResults.length === 0)) && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-48 overflow-y-auto rounded-lg bg-[#0c1017] border border-white/10 shadow-2xl">
                          {isSearchingOrigin && originSearchResults.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-slate-400 flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
                              Mencari di gazetteer Pan-Sumatra…
                            </div>
                          )}
                          {originSearchResults.map((item, idx) => (
                            <button
                              key={`${item.display_name}-${idx}`}
                              type="button"
                              onClick={() => {
                                setRitForm({
                                  ...ritForm,
                                  origin_name: item.display_name || item.name,
                                  origin_ref: item.name,
                                });
                                setOriginQuery(item.display_name || item.name);
                                setOriginCoords([item.lon, item.lat]);
                                setOriginSearchError(null);
                                setShowOriginDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 transition-colors flex items-center gap-2 border-b border-white/5 last:border-b-0 cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <div className="truncate">
                                <span className="font-medium text-slate-200">{item.name}</span>
                                <span className="text-[10px] text-slate-400 ml-1.5 truncate">
                                  {item.kecamatan ? `${item.kecamatan}, ` : ''}
                                  {item.kabupaten ? `${item.kabupaten}, ` : ''}
                                  {item.province}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Destination */}
                    <div className="relative">
                      <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                        <span>Titik Tujuan (gazetteer) *</span>
                        {destCoords && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            [{destCoords[1].toFixed(4)}, {destCoords[0].toFixed(4)}]
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          disabled={isRegulator}
                          placeholder="Ketik desa, kecamatan, kota, atau hub..."
                          value={destQuery}
                          onChange={(e) => {
                            setDestQuery(e.target.value);
                            setRitForm({ ...ritForm, destination_name: e.target.value });
                            setDestCoords(null);
                            setShowDestDropdown(true);
                          }}
                          onFocus={() => setShowDestDropdown(true)}
                          className={`w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white/5 border text-slate-100 placeholder-slate-500 focus:outline-none ${
                            destCoords ? 'border-emerald-500/40 focus:border-emerald-400' : 'border-white/10 focus:border-cyan-500/50'
                          }`}
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                      </div>
                      {noDestResults && (
                        <p className="mt-1 text-[10px] text-rose-300">
                          Tidak ada hasil gazetteer. Periksa ejaan — koordinat tidak diisi otomatis.
                        </p>
                      )}
                      {destSearchError && (
                        <p className="mt-1 text-[10px] text-amber-300">{destSearchError}</p>
                      )}
                      {showDestDropdown &&
                        (destSearchResults.length > 0 ||
                          (isSearchingDest && destSearchResults.length === 0)) && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-48 overflow-y-auto rounded-lg bg-[#0c1017] border border-white/10 shadow-2xl">
                          {isSearchingDest && destSearchResults.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-slate-400 flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
                              Mencari di gazetteer Pan-Sumatra…
                            </div>
                          )}
                          {destSearchResults.map((item, idx) => (
                            <button
                              key={`${item.display_name}-${idx}`}
                              type="button"
                              onClick={() => {
                                setRitForm({
                                  ...ritForm,
                                  destination_name: item.display_name || item.name,
                                  destination_ref: item.name,
                                });
                                setDestQuery(item.display_name || item.name);
                                setDestCoords([item.lon, item.lat]);
                                setDestSearchError(null);
                                setShowDestDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 transition-colors flex items-center gap-2 border-b border-white/5 last:border-b-0 cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <div className="truncate">
                                <span className="font-medium text-slate-200">{item.name}</span>
                                <span className="text-[10px] text-slate-400 ml-1.5 truncate">
                                  {item.kecamatan ? `${item.kecamatan}, ` : ''}
                                  {item.kabupaten ? `${item.kabupaten}, ` : ''}
                                  {item.province}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                        <PackageOpen className="w-3.5 h-3.5 text-slate-400" /> Komoditas
                      </label>
                      <select
                        disabled={isRegulator}
                        value={ritForm.commodity_key}
                        onChange={(e) => setRitForm({ ...ritForm, commodity_key: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                      >
                        {COMMODITY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value} className="bg-[#0c1017]">
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Tonase Muatan (ton) *</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        disabled={isRegulator}
                        value={ritForm.cargo_tonnage}
                        onChange={(e) =>
                          setRitForm({ ...ritForm, cargo_tonnage: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Nilai Muatan (IDR) — opsional
                      </label>
                      <input
                        type="number"
                        disabled={isRegulator}
                        placeholder="Kosong = valuasi tier PIHPS"
                        value={ritForm.cargo_value_idr ?? ''}
                        onChange={(e) =>
                          setRitForm({
                            ...ritForm,
                            cargo_value_idr: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> SLA Pengiriman (jam) *
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        disabled={isRegulator}
                        value={ritForm.sla_deadline_hours}
                        onChange={(e) =>
                          setRitForm({ ...ritForm, sla_deadline_hours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Waktu Tempuh Baseline (jam) *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        disabled={isRegulator}
                        value={ritForm.baseline_time_hours}
                        onChange={(e) =>
                          setRitForm({ ...ritForm, baseline_time_hours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Perkiraan Delay Jika Menerobos (jam)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        disabled={isRegulator}
                        value={ritForm.blocked_delay_hours ?? 0}
                        onChange={(e) =>
                          setRitForm({ ...ritForm, blocked_delay_hours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 focus:outline-none focus:border-cyan-500/50 font-mono"
                      />
                    </div>
                  </div>

                  {/* Advanced: toll segments + realised outcome */}
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Fuel className="w-3.5 h-3.5 text-emerald-400" />
                    {showAdvanced ? 'Sembunyikan' : 'Tampilkan'} segmen tol BPJT & hasil aktual (opsional)
                  </button>

                  {showAdvanced && (
                    <div className="p-3 rounded-lg bg-[#121822] border border-[#1c2432] space-y-3">
                      <div>
                        <span className="block text-[11px] font-medium text-slate-300 mb-1.5">
                          Segmen Tol BPJT pada Rute Baseline
                        </span>
                        {tollSegments.length === 0 ? (
                          <p className="text-[10px] text-slate-500">Daftar tarif tol tidak tersedia dari API.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {tollSegments.map((seg) => {
                              const active = selectedTollSegments.includes(seg.id);
                              return (
                                <button
                                  key={seg.id}
                                  type="button"
                                  disabled={isRegulator}
                                  onClick={() =>
                                    setSelectedTollSegments((prev) =>
                                      active ? prev.filter((s) => s !== seg.id) : [...prev, seg.id]
                                    )
                                  }
                                  className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {seg.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Waktu Aktual (jam)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            disabled={isRegulator}
                            placeholder="Kosong = belum dieksekusi"
                            value={ritForm.actual_time_hours ?? ''}
                            onChange={(e) =>
                              setRitForm({
                                ...ritForm,
                                actual_time_hours: e.target.value ? parseFloat(e.target.value) : undefined,
                                status: e.target.value ? ('rerouted' as TravelStatus) : ('planned' as TravelStatus),
                                rerouted: Boolean(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            BBM Aktual (liter)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            disabled={isRegulator}
                            placeholder="Kosong = sama dengan baseline"
                            value={ritForm.actual_fuel_liters ?? ''}
                            onChange={(e) =>
                              setRitForm({
                                ...ritForm,
                                actual_fuel_liters: e.target.value ? parseFloat(e.target.value) : undefined,
                              })
                            }
                            className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Penghematan hanya dicatat setelah waktu/BBM aktual diisi. Tanpa hasil aktual, ledger
                        menampilkan Rp 0 — sistem tidak mengarang persentase.
                      </p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-[#1c2432] flex justify-between items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#121822] transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || isRegulator || !originCoords || !destCoords}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md bg-white hover:bg-slate-200 text-[#080d14] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                      <span>Buat Rit Pengiriman</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ================= MANIFEST ================= */}
          {activeTab === 'manifest' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">Unggah File Manifest Pengiriman</h3>
                  <p className="text-xs text-slate-400">
                    Dukungan CSV standar untuk impor armada massal (format lama tetap kompatibel).
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

              <div
                onClick={() => !isRegulator && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${
                  isRegulator
                    ? 'border-[#1c2432] bg-[#0c1017] cursor-not-allowed opacity-60'
                    : 'border-[#1c2432] hover:border-slate-500 bg-[#121822] hover:bg-[#1a2230] cursor-pointer'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
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

              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span>Pratinjau Data ({parsedRows.length} Unit)</span>
                    <span className="text-emerald-400 font-mono text-xs tabular-nums">Siap Diimpor</span>
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
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>Impor {parsedRows.length > 0 ? `${parsedRows.length} Armada` : 'Manifest'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= WEBHOOK ================= */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
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
                  Kompatibel dengan Traccar, EasyGo, McEasy, dan GPS IoT Tracker standar.
                </p>
              </div>

              <div className="p-4 rounded-md bg-[#121822] border border-[#1c2432] space-y-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-semibold text-slate-200">Simulator Pengujian Ping GPS</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Kirim koordinat GPS untuk menggerakkan armada yang sudah terdaftar pada peta.
                </p>

                <form onSubmit={handleWebhookPingSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">ID Armada Sasaran *</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: BK-8821-XA"
                        value={webhookForm.vehicle_id}
                        onChange={(e) => setWebhookForm({ ...webhookForm, vehicle_id: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Kecepatan (km/j)</label>
                      <input
                        type="number"
                        value={webhookForm.speed_kmh}
                        onChange={(e) => setWebhookForm({ ...webhookForm, speed_kmh: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={webhookForm.latitude}
                        onChange={(e) => setWebhookForm({ ...webhookForm, latitude: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-100 focus:outline-none focus:border-slate-500 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={webhookForm.longitude}
                        onChange={(e) => setWebhookForm({ ...webhookForm, longitude: parseFloat(e.target.value) || 0 })}
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
                        onChange={(e) => setWebhookForm({ ...webhookForm, heading_deg: parseFloat(e.target.value) || 0 })}
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
