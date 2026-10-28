'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/base-ui/dialog';

/**
 * Phase M9-visual — the Berita filter block, moved off the sheet.
 *
 * The always-visible category row, tier row and 10-province chip grid used to
 * eat the top of a 390px bottom sheet before the operator saw a single
 * headline. They now live behind one `Filter` button; this modal carries the
 * same controls (and every existing testid) with live preview, so the list
 * behind it updates as the operator selects.
 *
 * Overlay contract: `#0c1017` surface, 12px radius, 1px white-alpha border,
 * one 0 12px 32px shadow — all inherited from base-ui/dialog. At <640px it is
 * a bottom sheet; above that, a centred 420px dialog.
 */

export type NewsTierFilterValue = 'ALL' | 'crisis' | 'regional';
export type NewsCategoryFilterValue = 'ALL' | 'OFFICIAL' | 'WEATHER' | 'OSINT' | 'MARKET';

const TIERS: Array<{ id: NewsTierFilterValue; label: string; testid: string; hint: string }> = [
  {
    id: 'ALL',
    label: 'Semua',
    testid: 'news-tier-all',
    hint: 'Tampilkan kedua tingkat: krisis dan regional',
  },
  {
    id: 'crisis',
    label: 'Krisis',
    testid: 'news-tier-crisis',
    hint: 'Berita yang lolos gerbang krisis (zona merah/kuning)',
  },
  {
    id: 'regional',
    label: 'Regional',
    testid: 'news-tier-regional',
    hint: 'Konteks regional 48 jam — bukan klaim krisis',
  },
];

const CATEGORIES: Array<{ id: NewsCategoryFilterValue; label: string }> = [
  { id: 'ALL', label: 'Semua' },
  { id: 'OFFICIAL', label: 'ANTARA' },
  { id: 'WEATHER', label: 'BMKG' },
  { id: 'MARKET', label: 'Harga' },
];

const chipClass = (active: boolean): string =>
  `cursor-pointer px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
    active
      ? 'bg-white text-[#080d14] border-white font-semibold'
      : 'bg-[#080d14] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]'
  }`;

export interface NewsFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: NewsTierFilterValue;
  onTierChange: (tier: NewsTierFilterValue) => void;
  category: NewsCategoryFilterValue;
  onCategoryChange: (category: NewsCategoryFilterValue) => void;
  province: string;
  onProvinceChange: (province: string) => void;
  /** Provinces with at least one qualifying 48h article, in reading order. */
  provinces: string[];
  /** Provinces with none — named honestly, never hidden. */
  provincesMissing: string[];
  provinceCounts?: Record<string, number> | null;
  /** Clears tier + category + province back to `ALL`. */
  onReset: () => void;
  /** Number of active facets (tier, category, province) for the trigger badge. */
  activeCount: number;
}

function slugifyProvince(province: string): string {
  return province
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function NewsFilterModal({
  isOpen,
  onClose,
  tier,
  onTierChange,
  category,
  onCategoryChange,
  province,
  onProvinceChange,
  provinces,
  provincesMissing,
  provinceCounts = null,
  onReset,
  activeCount,
}: NewsFilterModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="news-filter-modal"
        // Bottom sheet <640px, centred dialog above. `max-sm:` variants win
        // over the primitive's base centring utilities.
        className="max-sm:left-0 max-sm:right-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-xl max-sm:border-b-0 max-h-[85vh] overflow-y-auto custom-scrollbar space-y-4"
      >
        <DialogHeader className="border-b border-white/10 pb-2">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm">
            <span>Filter Berita</span>
            <span className="font-mono text-xs font-normal tabular-nums text-[rgba(232,234,237,0.62)]">
              {activeCount > 0 ? `${activeCount} aktif` : 'Tanpa filter'}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Tingkat */}
        <section className="space-y-2">
          <span className="block text-xs font-mono uppercase tracking-wide text-[rgba(232,234,237,0.62)]">
            Tingkat
          </span>
          <div className="flex items-center gap-1" data-testid="news-tier-filter">
            {TIERS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={item.testid}
                onClick={() => onTierChange(item.id)}
                title={item.hint}
                aria-pressed={tier === item.id}
                className={chipClass(tier === item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {/* Kategori */}
        <section className="space-y-2">
          <span className="block text-xs font-mono uppercase tracking-wide text-[rgba(232,234,237,0.62)]">
            Kategori
          </span>
          <div className="grid grid-cols-4 gap-1" data-testid="news-category-filter">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`news-category-${item.id.toLowerCase()}`}
                onClick={() => onCategoryChange(item.id)}
                aria-pressed={category === item.id}
                className={chipClass(category === item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {/* Wilayah */}
        <section className="space-y-2">
          <span className="block text-xs font-mono uppercase tracking-wide text-[rgba(232,234,237,0.62)]">
            Wilayah
          </span>
          <div className="flex flex-wrap items-center gap-1" data-testid="news-province-filter">
            <button
              type="button"
              data-testid="news-province-chip-all"
              onClick={() => onProvinceChange('ALL')}
              aria-pressed={province === 'ALL'}
              className={chipClass(province === 'ALL')}
              title="Tampilkan semua provinsi"
            >
              Semua
            </button>
            {provinces.map((item) => {
              const count = provinceCounts?.[item];
              const active = province === item;
              return (
                <button
                  key={item}
                  type="button"
                  data-testid={`news-province-chip-${slugifyProvince(item)}`}
                  onClick={() => onProvinceChange(active ? 'ALL' : item)}
                  aria-pressed={active}
                  title={`Filter provinsi: ${item}${typeof count === 'number' ? ` (${count} artikel)` : ''}`}
                  className={chipClass(active)}
                >
                  {item}
                  {typeof count === 'number' ? (
                    <span className="ml-1 tabular-nums text-[rgba(232,234,237,0.38)]">{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Empty provinces stay on screen. A 48h window that contains nothing
              for Aceh must say so rather than silently omit the chip. */}
          {provincesMissing.length > 0 && (
            <div
              data-testid="news-provinces-missing"
              className="space-y-1 pt-1"
              title="Provinsi tanpa artikel yang lolos gerbang 48 jam pada jendela baca ini"
            >
              {provincesMissing.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 px-2 py-1 text-xs font-mono text-[rgba(232,234,237,0.38)]"
                >
                  <span className="truncate">{item}</span>
                  <span className="shrink-0">Tidak ada artikel 48 jam</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <DialogFooter className="border-t border-white/10 pt-3">
          <button
            type="button"
            data-testid="news-filter-reset"
            onClick={onReset}
            className="cursor-pointer inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 text-xs font-medium text-[rgba(232,234,237,0.62)] transition-colors hover:bg-white/5 hover:text-[#e8eaed]"
          >
            Reset
          </button>
          <button
            type="button"
            data-testid="news-filter-apply"
            onClick={onClose}
            className="cursor-pointer inline-flex h-9 items-center justify-center rounded-xl border border-white bg-white px-4 text-xs font-semibold text-[#080d14] transition-colors hover:bg-white/90"
          >
            Terapkan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewsFilterModal;
