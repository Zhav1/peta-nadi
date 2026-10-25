/**
 * priceStats — pure statistika harga untuk Analitik.
 * Tidak ada fetch, tidak ada state; semua fungsi murni agar mudah diuji.
 */

/** Rata-rata aritmetik; NaN bila kosong. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Standar deviasi populasi; NaN bila kosong. */
export function std(xs: number[], m?: number): number {
  if (xs.length === 0) return NaN;
  const mu = m ?? mean(xs);
  let s = 0;
  for (const x of xs) s += (x - mu) * (x - mu);
  return Math.sqrt(s / xs.length);
}

/**
 * Korelasi Pearson -1..1.
 * Mengembalikan null bila overlap < minOverlap (default 10) atau varians nol
 * → penelepon wajib render honest-empty ("n<10"), bukan 0.
 */
export function pearson(x: number[], y: number[], minOverlap = 10): number | null {
  const n = Math.min(x.length, y.length);
  if (n < minOverlap) return null;
  const xa = x.slice(0, n);
  const ya = y.slice(0, n);
  const mx = mean(xa);
  const my = mean(ya);
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xa[i] - mx;
    const b = ya[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0 || !Number.isFinite(den)) return null;
  const r = num / den;
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

/** Perubahan persen (cur-base)/base*100; null bila base 0/tak-hingga. */
export function pctChange(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  const v = ((current - baseline) / Math.abs(baseline)) * 100;
  return Number.isFinite(v) ? v : null;
}

/** z-score (x-mean)/std; null bila std 0/tak-hingga. */
export function zScore(x: number, xs: number[]): number | null {
  const mu = mean(xs);
  const s = std(xs, mu);
  if (!Number.isFinite(mu) || !Number.isFinite(s) || s === 0) return null;
  const z = (x - mu) / s;
  return Number.isFinite(z) ? z : null;
}

/** Coefficient of Variation = std/mean*100 (%); null bila mean 0. */
export function coeffVar(xs: number[]): number | null {
  if (xs.length < 3) return null;
  const mu = mean(xs);
  if (!Number.isFinite(mu) || mu === 0) return null;
  const s = std(xs, mu);
  if (!Number.isFinite(s)) return null;
  return (s / Math.abs(mu)) * 100;
}

/**
 * Week-over-Week: (mean(last7) - mean(prev7)) / mean(prev7) * 100.
 * Null bila total < 14 titik atau prev mean 0.
 */
export function wowChange(xs: number[]): number | null {
  if (xs.length < 14) return null;
  const last7 = xs.slice(-7);
  const prev7 = xs.slice(-14, -7);
  const mLast = mean(last7);
  const mPrev = mean(prev7);
  if (!Number.isFinite(mLast) || !Number.isFinite(mPrev) || mPrev === 0) return null;
  return ((mLast - mPrev) / Math.abs(mPrev)) * 100;
}

/** Spread disparitas min-max: (max-min)/mean*100; null bila <3 titik. */
export function disparitas(xs: number[]): number | null {
  if (xs.length < 3) return null;
  const mu = mean(xs);
  if (!Number.isFinite(mu) || mu === 0) return null;
  return ((Math.max(...xs) - Math.min(...xs)) / Math.abs(mu)) * 100;
}

/** % titik naik day-over-day; null bila <3 titik. */
export function pctNaik(xs: number[]): number | null {
  if (xs.length < 3) return null;
  let up = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) up++;
  return (up / (xs.length - 1)) * 100;
}

/** Streak kenaikan beruntun di ujung deret (0 bila titik terakhir turun). */
export function streakNaik(xs: number[]): number {
  let s = 0;
  for (let i = xs.length - 1; i >= 1; i--) {
    if (xs[i] > xs[i - 1]) s++;
    else break;
  }
  return s;
}

export interface AlignedPoint {
  date: string; // yyyy-mm-dd
  values: Array<number | null>;
}

function dayKey(t: string): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Align beberapa deret (prices, times) per tanggal; sel kosong → null.
 * Deret diasumsikan ascending (terlama → terbaru).
 */
export function alignByDate(
  series: Array<{ times: string[]; prices: number[] }>,
): AlignedPoint[] {
  const dates = new Set<string>();
  const maps = series.map((s) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.times.length; i++) {
      const k = dayKey(s.times[i]);
      // titik terbaru menang bila duplikat tanggal
      m.set(k, s.prices[i]);
      dates.add(k);
    }
    return m;
  });
  const sorted = Array.from(dates).sort();
  return sorted.map((date) => ({
    date,
    values: maps.map((m) => m.get(date) ?? null),
  }));
}

/**
 * Risiko komposit 0..100 dari spike maksimum + CV.
 * sqrt-scaling ala gods-eye heatScore agar outlier tidak mendominasi.
 */
export function risikoComposite(maxSpikePct: number | null, cv: number | null): number | null {
  if (maxSpikePct == null && cv == null) return null;
  const spikeN = maxSpikePct != null ? Math.min(Math.sqrt(Math.abs(maxSpikePct) / 30), 1) : 0;
  const cvN = cv != null ? Math.min(Math.sqrt(Math.abs(cv) / 25), 1) : 0;
  const w = (maxSpikePct != null ? 0.65 : 0) + (cv != null ? 0.35 : 0);
  if (w === 0) return null;
  const score =
    ((maxSpikePct != null ? spikeN * 0.65 : 0) + (cv != null ? cvN * 0.35 : 0)) / w;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
