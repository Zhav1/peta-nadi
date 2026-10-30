'use client';

import type { TravelRecord } from '@/lib/types';

interface OperationalTripSelectProps {
  trips: TravelRecord[];
  selectedTripId: string;
  onSelect: (tripId: string) => void;
  loading?: boolean;
}

export function OperationalTripSelect({
  trips,
  selectedTripId,
  onSelect,
  loading = false,
}: OperationalTripSelectProps) {
  const eligibleTrips = trips.filter((trip) =>
    ['planned', 'moving', 'rerouted'].includes(trip.status)
  );

  return (
    <label className="block space-y-1.5 text-xs text-slate-300">
      <span className="font-semibold">Trip / rit yang akan diubah</span>
      <select
        aria-label="Trip / rit yang akan diubah"
        value={selectedTripId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={loading || eligibleTrips.length === 0}
        className="w-full rounded-md border border-white/10 bg-[#0c1017] px-2.5 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">
          {loading ? 'Memuat trip…' : eligibleTrips.length ? 'Pilih trip secara eksplisit' : 'Tidak ada trip yang eligible'}
        </option>
        {eligibleTrips.map((trip) => (
          <option key={trip.id} value={trip.id}>
            {trip.id} · {trip.truck_id} · {trip.origin_name} → {trip.destination_name} · {trip.status} · v{trip.route_version ?? 0}
          </option>
        ))}
      </select>
      <span className="block text-[11px] leading-relaxed text-slate-500">
        Persetujuan hanya memperbarui rencana rute pada trip ini; pengiriman eksternal dan eksekusi pengemudi tidak terhubung.
      </span>
    </label>
  );
}
