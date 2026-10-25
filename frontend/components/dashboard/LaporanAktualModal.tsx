'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ERPTripRow, TravelStatus } from '@/lib/types';

// M8 Phase 2: modal pencatatan aktual rit. PATCH /api/v1/fleet/travels/{id}
// via api.fleet.updateTravel. Validasi >0 client-side. Dispatcher-only —
// non-dispatcher menerima `canEdit=false` (tombol disabled + tooltip di
// pemanggil, form read-only di sini bila dipaksa terbuka).

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
  const [status, setStatus] = useState<TravelStatus>('delivered');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setActualTimeHours('');
      setActualFuelLiters('');
      setActualTollSegments('');
      setStatus('delivered');
      setFieldError(null);
      setSubmitError(null);
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
      setSubmitError(disabledHint);
      return;
    }
    const timeH = Number(actualTimeHours);
    const fuelL = Number(actualFuelLiters);
    if (!Number.isFinite(timeH) || timeH <= 0) {
      setFieldError('Waktu aktual harus angka > 0 jam.');
      return;
    }
    if (!Number.isFinite(fuelL) || fuelL <= 0) {
      setFieldError('BBM aktual harus angka > 0 liter.');
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setIsSaving(true);
    try {
      const segments = actualTollSegments
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await api.fleet.updateTravel(trip.id, {
        actual_time_hours: timeH,
        actual_fuel_liters: fuelL,
        ...(segments.length > 0 ? { actual_toll_segments: segments } : {}),
        status,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? `Gagal menyimpan aktual rit ${trip.id} (${err.message}).` : `Gagal menyimpan aktual rit ${trip.id}.`
      );
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
      aria-label={`Catat aktual rit ${trip.id}`}
    >
      <div
        className="w-full max-w-md bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white">Catat aktual rit</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              {trip.id} • {trip.origin_name} → {trip.destination_name}
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

        <div className="px-4 py-4 flex flex-col gap-3">
          {!canEdit && (
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/25 text-xs text-amber-200/90 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{disabledHint}</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-400">Waktu tempuh aktual (jam)</span>
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
            <span className="text-xs text-slate-400">BBM aktual (liter)</span>
            <input
              type="number"
              min={0}
              step="any"
              value={actualFuelLiters}
              onChange={(e) => setActualFuelLiters(e.target.value)}
              disabled={!canEdit || isSaving}
              placeholder="cth. 120"
              className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 [color-scheme:dark]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-400">Segmen tol aktual (opsional, pisahkan koma)</span>
            <input
              type="text"
              value={actualTollSegments}
              onChange={(e) => setActualTollSegments(e.target.value)}
              disabled={!canEdit || isSaving}
              placeholder="cth. BKJ-Tebing Tinggi, Medan-Binjai"
              className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-400">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TravelStatus)}
              disabled={!canEdit || isSaving}
              className="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value="delivered">Terkirim</option>
              <option value="moving">Berjalan</option>
              <option value="rerouted">Dialihkan</option>
              <option value="failed">Gagal</option>
              <option value="planned">Direncanakan</option>
            </select>
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
            title={canEdit ? 'Simpan aktual rit' : disabledHint}
            className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan aktual'}
          </button>
        </div>
      </div>
    </div>
  );
}
