'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { notifyToast } from '@/components/ui/Toast';
import type { ERPTripRow, TravelRecord } from '@/lib/types';

// M8 Phase 2: modal pencatatan aktual Trip. PATCH /api/v1/fleet/travels/{id}
// via api.fleet.updateTravel, lalu otomatis POST hedging via
// api.fleet.solveTravelHedging (tindakan tunggal 'Selesaikan Trip').
// Validasi >0 client-side. Dispatcher-only —
// non-dispatcher menerima `canEdit=false` (tombol disabled + tooltip di
// pemanggil, form read-only di sini bila dipaksa terbuka).
//
// Catat verifikasi hybrid A (primary: step-2 inline setelah Selesaikan Trip)
// + C (secondary: audit deep-link via OutcomeVerificationForm yang diekspor
// untuk ReportsSection):
// - incident_id pre-fill dari travel.disruption_id (fallback travel id).
// - observed_delay_hours = actual_time_hours - baseline_time_hours bila
//   baseline diketahui, else input manual >= 0.
// - horizon dropdown T+12h / T+24h, actual_price_spike_pct wajib
//   (OutcomeCreate backend), verified_by default operator,
//   verification_source FIXED FIELD_REPORT (never DISPATCHER_APPROVAL —
//   baris echo DISPATCHER_APPROVAL dikecualikan dari agregat live backend
//   outcome_evaluation_service, sehingga memakai echo akan menghilangkan N).
// - NOTE: tidak ada field pred_prob di form ini — OutcomeCreate backend tidak
//   punya kolom pred_prob; eval memakai forecast tersimpan dari news ingestor
//   (backend, menyusul). Jangan menambahkan field prediksi di sini.

export type VerificationHorizon = 'T+12h' | 'T+24h';

interface OutcomeVerificationFormProps {
  initialIncidentId: string;
  /** Null/undefined = baseline tak diketahui, operator isi manual >= 0. */
  initialObservedDelay?: number | null;
  baselineKnown: boolean;
  canEdit: boolean;
  disabledHint: string;
  onSubmitted?: () => void;
}

export function OutcomeVerificationForm({
  initialIncidentId,
  initialObservedDelay,
  baselineKnown,
  canEdit,
  disabledHint,
  onSubmitted,
}: OutcomeVerificationFormProps) {
  const [incidentId, setIncidentId] = useState(initialIncidentId);
  const [observedDelay, setObservedDelay] = useState(
    initialObservedDelay != null && Number.isFinite(initialObservedDelay)
      ? String(initialObservedDelay)
      : ''
  );
  const [horizon, setHorizon] = useState<VerificationHorizon>('T+12h');
  const [priceSpike, setPriceSpike] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('operator');
  const [notes, setNotes] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setIncidentId(initialIncidentId);
    setObservedDelay(
      initialObservedDelay != null && Number.isFinite(initialObservedDelay)
        ? String(initialObservedDelay)
        : ''
    );
    setFieldError(null);
    setSubmitError(null);
    setIsDone(false);
  }, [initialIncidentId, initialObservedDelay]);

  const handleVerifySubmit = async () => {
    if (!canEdit) {
      notifyToast({ message: 'Aksi ditolak (403): Catat verifikasi hanya untuk Dispatcher.', type: 'error' });
      setSubmitError(disabledHint);
      return;
    }
    const delayH = Number(observedDelay);
    const spikeP = Number(priceSpike);
    if (!incidentId.trim()) {
      setFieldError('ID gangguan wajib diisi.');
      return;
    }
    if (!Number.isFinite(delayH) || delayH < 0) {
      setFieldError('Keterlambatan di lapangan harus angka >= 0 jam.');
      return;
    }
    // OutcomeCreate.actual_price_spike_pct wajib (tanpa default) — validasi
    // client-side dulu agar 422 backend tidak perlu terjadi.
    if (priceSpike.trim() === '' || !Number.isFinite(spikeP)) {
      setFieldError('Kenaikan harga di pasar wajib diisi (angka %, cth. 9.2).');
      return;
    }
    if (!verifiedBy.trim()) {
      setFieldError('Nama pencatat wajib diisi.');
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setIsSaving(true);
    try {
      const submit = (api.outcomes as unknown as {
        create?: (b: unknown) => Promise<unknown>;
        record: (b: unknown) => Promise<unknown>;
      }).create
        ? (api.outcomes as unknown as { create: (b: unknown) => Promise<unknown> }).create
        : (api.outcomes as unknown as { record: (b: unknown) => Promise<unknown> }).record;
      await submit({
        incident_id: incidentId.trim(),
        horizon,
        observed_delay_hours: delayH,
        actual_price_spike_pct: spikeP,
        verified_by: verifiedBy.trim(),
        // FIXED: never DISPATCHER_APPROVAL / OPERATOR_OVERRIDE echo.
        verification_source: 'FIELD_REPORT',
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setIsDone(true);
      notifyToast({ message: `Verifikasi ${incidentId.trim()} (${horizon}) tersimpan.`, type: 'success' });
      onSubmitted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan verifikasi.';
      // Backend menjawab 422 bila price hilang / tipe salah — tampilkan inline.
      if (/422/.test(msg)) {
        setSubmitError(
          `Validasi backend (422): periksa kenaikan harga aktual (wajib angka) dan keterlambatan >= 0. (${msg})`
        );
      } else {
        setSubmitError(`Gagal menyimpan verifikasi (${msg}).`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="verifikasi-form">
      {!canEdit && (
        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/25 text-xs text-amber-200/90 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{disabledHint}</span>
        </div>
      )}
      {isDone && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Verifikasi tersimpan ke POST /outcomes.</span>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-400">ID gangguan</span>
        <input
          type="text"
          value={incidentId}
          onChange={(e) => setIncidentId(e.target.value)}
          disabled={!canEdit || isSaving || isDone}
          placeholder="cth. INC-BELAWAN-TEBINGTINGGI"
          data-testid="verifikasi-incident-id"
          className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 font-mono"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">
            Keterlambatan di lapangan (jam)
            {!baselineKnown && <span className="text-slate-500"> — isi manual</span>}
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={observedDelay}
            onChange={(e) => setObservedDelay(e.target.value)}
            disabled={!canEdit || isSaving || isDone}
            placeholder={baselineKnown ? 'cth. 2.6' : 'cth. 0 / manual >= 0'}
            data-testid="verifikasi-delay"
            className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 [color-scheme:dark] tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">Jangka pantau</span>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as VerificationHorizon)}
            disabled={!canEdit || isSaving || isDone}
            data-testid="verifikasi-horizon"
            className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="T+12h">T+12h</option>
            <option value="T+24h">T+24h</option>
          </select>
        </label>
      </div>
      {baselineKnown ? (
        <p className="text-xs text-slate-500">Pre-fill: actual_time_hours − baseline_time_hours dari ledger Trip.</p>
      ) : (
        <p className="text-xs text-slate-500">Baseline tak diketahui — isi keterlambatan manual (&ge; 0).</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">Kenaikan harga di pasar (%) *</span>
          <input
            type="number"
            step="any"
            value={priceSpike}
            onChange={(e) => setPriceSpike(e.target.value)}
            disabled={!canEdit || isSaving || isDone}
            placeholder="cth. 9.2"
            data-testid="verifikasi-price"
            className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 [color-scheme:dark] tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400">Dicatat oleh</span>
          <input
            type="text"
            value={verifiedBy}
            onChange={(e) => setVerifiedBy(e.target.value)}
            disabled={!canEdit || isSaving || isDone}
            placeholder="operator"
            data-testid="verifikasi-verified-by"
            className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50"
          />
        </label>
      </div>

      <p className="text-xs text-slate-500">
        verification_source: <span className="font-mono text-slate-300">FIELD_REPORT</span> (tetap — bukan
        DISPATCHER_APPROVAL agar tidak dikecualikan sebagai echo dari agregat live).
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-400">Catatan (opsional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!canEdit || isSaving || isDone}
          placeholder="cth. antrean GT Tebing Tinggi, foto terlampir"
          rows={2}
          data-testid="verifikasi-notes"
          className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 resize-none"
        />
      </label>

      {fieldError && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{fieldError}</span>
        </div>
      )}
      {submitError && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleVerifySubmit}
          disabled={!canEdit || isSaving || isDone}
          title={canEdit ? 'Simpan verifikasi ke POST /outcomes' : disabledHint}
          data-testid="verifikasi-submit"
          className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Menyimpan...' : isDone ? 'Tersimpan' : 'Simpan verifikasi'}
        </button>
      </div>
    </div>
  );
}

// Known BPJT Sumatra segment codes (mirror backend BPJT_SUMATRA_TOLL_SEGMENTS keys).
// Unknown codes are accepted but warned — backend toll cost counts Rp 0 for them.
const KNOWN_TOLL_SEGMENTS = [
  'BAKAUHENI_TERBANGGI',
  'TERBANGGI_KAYUAGUNG',
  'KAYUAGUNG_PALEMBANG',
  'PEKANBARU_DUMAI',
  'MEDAN_TEBINGTINGGI',
  'BELMERA',
  'SIGLI_BANDAACEH',
];

function formatIDRShort(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

interface LaporanAktualModalProps {
  trip: ERPTripRow | null;
  open: boolean;
  /** False for Regulator/GUEST: form renders read-only. */
  canEdit: boolean;
  disabledHint: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LaporanAktualModal({
  trip,
  open,
  canEdit,
  disabledHint,
  onClose,
  onSuccess,
}: LaporanAktualModalProps) {
  const [actualTimeHours, setActualTimeHours] = useState('');
  const [actualFuelLiters, setActualFuelLiters] = useState('');
  const [actualTollSegments, setActualTollSegments] = useState('');
  const [noToll, setNoToll] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Double-submit guard: ref flips synchronously on first click, so a second
  // click / StrictMode remount cannot fire a duplicate PATCH+hedging pair
  // before setIsSaving re-renders. Key is per-modal-open; a retry after
  // close gets a fresh key while repeats in one open share it.
  const submitGuardRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [hedgeSuggest, setHedgeSuggest] = useState<{ policy: string; savings: number } | null>(null);
  // Hybrid A: 'aktual' -> (PATCH + hedging sukses) -> 'verifikasi' inline.
  const [step, setStep] = useState<'aktual' | 'verifikasi'>('aktual');
  const [verifyPrefill, setVerifyPrefill] = useState<{
    incidentId: string;
    observedDelay: number | null;
    baselineKnown: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setActualTimeHours('');
      setActualFuelLiters('');
      setActualTollSegments('');
      setNoToll(false);
      setFieldError(null);
      setSubmitError(null);
      setHedgeSuggest(null);
      setStep('aktual');
      setVerifyPrefill(null);
      submitGuardRef.current = false;
      try {
        idempotencyKeyRef.current =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      } catch {
        idempotencyKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    }
  }, [open, trip?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !trip) return null;

  const handleSubmit = async () => {
    if (!canEdit) {
      notifyToast({ message: 'Aksi ditolak (403): Selesaikan Trip hanya untuk Dispatcher.', type: 'error' });
      setSubmitError(disabledHint);
      return;
    }
    // Guard sinkron ringan di sini; kunci guard baru diklaim setelah
    // validasi lolos agar error validasi tidak mengunci form.
    if (isSaving || submitGuardRef.current) return;
    const timeH = Number(actualTimeHours);
    const fuelL = Number(actualFuelLiters);
    if (!Number.isFinite(timeH) || timeH <= 0) {
      setFieldError('Waktu jalan harus angka > 0 jam.');
      return;
    }
    if (!Number.isFinite(fuelL) || fuelL <= 0) {
      setFieldError('BBM terpakai harus angka > 0 liter.');
      return;
    }
    // Plausibility guard (mirror backend 422): truck diesel 1.5–25 km/L.
    // Blocks demo typos like 120L/73km = 0.61 km/L before PATCH.
    const distKm = Number((trip as { baseline_distance_km?: number | null }).baseline_distance_km);
    if (Number.isFinite(distKm) && distKm > 0) {
      const econ = distKm / fuelL;
      const msg = `BBM aktual ${fuelL}L untuk ${distKm}km = ${econ.toFixed(2)} km/L tidak wajar (batas 1.5–25 km/L). Cek ulang input.`;
      if (econ < 1.5 || econ > 25) {
        setFieldError(msg);
        return;
      }
      const effKmpl = Number(
        (trip as { fuel_efficiency_used_kmpl?: number | null }).fuel_efficiency_used_kmpl
      );
      if (Number.isFinite(effKmpl) && effKmpl > 0) {
        const baselineEst = distKm / effKmpl;
        if (baselineEst > 0 && fuelL > 3 * baselineEst) {
          setFieldError(msg);
          return;
        }
      }
    }
    setFieldError(null);
    setSubmitError(null);
    // Klaim guard sinkron tepat sebelum POST pertama — double-click kedua
    // melihat ref ini dan batal sebelum PATCH ganda terjadi.
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setIsSaving(true);
    const idemKey = idempotencyKeyRef.current;
    try {
      // Explicit [] when no-toll (checked) or empty input — never omit the key
      // (backend exclude_unset would otherwise keep stale baseline segments).
      const segments = noToll
        ? []
        : actualTollSegments
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => s.toUpperCase());
      let updated: TravelRecord | null = null;
      try {
        updated = await api.fleet.updateTravel(
          trip.id,
          {
            actual_time_hours: timeH,
            actual_fuel_liters: fuelL,
            actual_toll_segments: segments,
            status: 'delivered',
          },
          idemKey ? { idempotencyKey: idemKey } : undefined
        );
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : `Gagal menyimpan aktual Trip ${trip.id}.`;
        // PATCH belum tersimpan — buka guard agar retry diperbolehkan.
        submitGuardRef.current = false;
        // Backend 422 plausibility guard -> inline field error (no shape change).
        if (/tidak wajar|422/.test(rawMsg)) {
          setFieldError(rawMsg);
        } else {
          setSubmitError(
            err instanceof Error ? `Gagal menyimpan aktual Trip ${trip.id} (${err.message}).` : `Gagal menyimpan aktual Trip ${trip.id}.`
          );
        }
        return;
      }
      // M8 Phase 5: tindakan tunggal — otomatis hitung opsi Lanjut / Ubah Rute / Tahan.
      try {
        const hedgeRes = await api.fleet.solveTravelHedging(
          trip.id,
          {},
          idemKey ? { idempotencyKey: `${idemKey}-hedging` } : undefined
        );
        const hedgeData = (hedgeRes?.hedging ?? {}) as Record<string, unknown>;
        const policy =
          typeof hedgeData.optimal_policy === 'string'
            ? hedgeData.optimal_policy
            : (updated?.hedging_policy ?? null);
        const rawSavings =
          typeof hedgeData.net_savings_idr === 'number'
            ? hedgeData.net_savings_idr
            : (updated?.hedging_net_savings_idr ?? null);
        setHedgeSuggest(
          policy
            ? {
                policy,
                savings:
                  typeof rawSavings === 'number' && Number.isFinite(rawSavings) ? rawSavings : 0,
              }
            : null
        );
      } catch (err: unknown) {
        // Aktual sudah tersimpan; tampilkan kegagalan hedging berurutan lalu refetch.
        setSubmitError(
          err instanceof Error
            ? `Tersimpan, tapi gagal menghitung opsi Trip ${trip.id} (${err.message}).`
            : `Tersimpan, tapi gagal menghitung opsi Trip ${trip.id}.`
        );
        onSuccess();
        return;
      }
      // Hybrid A: PATCH + hedging sukses -> step-2 verifikasi inline.
      // incident_id dari disruption_id (fallback id Trip); delay dari ledger.
      const baseline = updated ? Number((updated as TravelRecord).baseline_time_hours) : NaN;
      const actual = updated ? Number((updated as TravelRecord).actual_time_hours) : timeH;
      const hasBaseline = Number.isFinite(baseline) && baseline > 0 && Number.isFinite(actual);
      const prefillDelay = hasBaseline ? Math.max(0, Math.round((actual - baseline) * 10) / 10) : null;
      const incident = (updated?.disruption_id || trip.disruption_id || trip.id) ?? trip.id;
      setVerifyPrefill({ incidentId: incident, observedDelay: prefillDelay, baselineKnown: hasBaseline });
      setStep('verifikasi');
      onSuccess();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Selesaikan Trip ${trip.id} — Catat aktual`}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0c1017] border border-white/10 rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white">
              {step === 'aktual' ? `Selesaikan Trip ${trip.id}` : `Cek lapangan — ${trip.id}`}
            </h3>
            <p className="text-xs text-slate-500 tabular-nums">
              {trip.id} • {trip.origin_name} → {trip.destination_name}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {step === 'aktual'
                ? 'Isi jam dan BBM sebenarnya. Sistem langsung hitung saran trip berikutnya.'
                : 'Langkah 2: catat kondisi di lapangan.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'aktual' ? (
          <>
            <div className="px-4 py-4 flex flex-col gap-3">
              {!canEdit && (
                <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/25 text-xs text-amber-200/90 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{disabledHint}</span>
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Waktu jalan (jam)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={actualTimeHours}
                  onChange={(e) => setActualTimeHours(e.target.value)}
                  disabled={!canEdit || isSaving}
                  placeholder="cth. 7.5"
                  className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 [color-scheme:dark]"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">BBM terpakai (liter)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={actualFuelLiters}
                  onChange={(e) => setActualFuelLiters(e.target.value)}
                  disabled={!canEdit || isSaving}
                  placeholder="cth. 25"
                  className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 [color-scheme:dark]"
                />
                <span className="text-xs text-slate-500">Lihat struk SPBU.</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Ruas tol yang dilewati</span>
                <input
                  type="text"
                  value={actualTollSegments}
                  onChange={(e) => setActualTollSegments(e.target.value)}
                  disabled={!canEdit || isSaving || noToll}
                  placeholder="cth. MEDAN_TEBINGTINGGI, BELMERA"
                  className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 font-mono"
                />
                <span className="text-xs text-slate-500">
                  Kosongkan bila tidak lewat tol. Tulis kode ruas, pisahkan koma.
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={noToll}
                  onChange={(e) => setNoToll(e.target.checked)}
                  disabled={!canEdit || isSaving}
                  className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-xs text-slate-400">Tidak lewat tol</span>
              </label>

              {!noToll &&
                actualTollSegments
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .filter((s) => !KNOWN_TOLL_SEGMENTS.includes(s.toUpperCase()))
                  .map((s) => (
                    <p key={s.toUpperCase()} className="text-xs text-amber-300">
                      Kode {s.toUpperCase()} tidak dikenal — tol dihitung Rp 0.
                    </p>
                  ))}

              {fieldError && <p className="text-xs text-rose-300">{fieldError}</p>}
              {submitError && <p className="text-xs text-rose-300">{submitError}</p>}
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-2 bg-transparent hover:bg-white/5 text-slate-200 border border-white/10 rounded-md text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canEdit || isSaving}
                title={canEdit ? 'Simpan aktual Trip' : disabledHint}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan aktual'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Aktual + hedging tersimpan. Lengkapi verifikasi lapangan (langkah 2).</span>
              </div>
              {hedgeSuggest && (
                <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300">
                  <span>
                    Saran sistem: {hedgeSuggest.policy} — hemat {formatIDRShort(hedgeSuggest.savings)}
                  </span>
                </div>
              )}
              {verifyPrefill && (
                <OutcomeVerificationForm
                  initialIncidentId={verifyPrefill.incidentId}
                  initialObservedDelay={verifyPrefill.observedDelay}
                  baselineKnown={verifyPrefill.baselineKnown}
                  canEdit={canEdit}
                  disabledHint={disabledHint}
                />
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-medium rounded-md cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
