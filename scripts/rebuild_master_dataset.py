"""
REBUILD MASTER DATASET
Membangun ulang master dataset dari raw data PIHPS asli + BMKG + BNPB + BPS
Output: data/processed/master_dataset_v2.parquet

Agregasi ke BULANAN dengan metode yang benar:
  - PIHPS: monthly mean + monthly std (volatilitas) + monthly max
  - BMKG: monthly mean curah hujan, suhu
  - BNPB: monthly SUM kejadian bencana
  - BPS: annual values mapped to monthly (forward-fill)
"""

import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings('ignore')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIHPS_DIR = os.path.join(BASE, "data", "raw", "pihps")
CLEAN_DIR = os.path.join(BASE, "data", "clean")
OUT_DIR   = os.path.join(BASE, "data", "processed")
os.makedirs(OUT_DIR, exist_ok=True)

print("=" * 60)
print("REBUILD MASTER DATASET v2")
print("=" * 60)

# ── Province normalization map ─────────────────────────────────────────────────
PROV_NORM = {
    'DI Yogyakarta': 'DI Yogyakarta',
    'DKI Jakarta': 'DKI Jakarta',
    'Nusa Tenggara Barat': 'Nusa Tenggara Barat',
    'Nusa Tenggara Timur': 'Nusa Tenggara Timur',
    'Kepulauan Bangka Belitung': 'Kepulauan Bangka Belitung',
    'Kepulauan Riau': 'Kepulauan Riau',
}
# Exclude 'Nasional' row
EXCLUDE_PROV = {'Nasional'}

# ── STEP 1: Load and aggregate PIHPS ──────────────────────────────────────────
print("\n[1/4] Loading PIHPS raw data...")

PIHPS_FILES = {
    'beras':        '01 - Beras - 2020 s.d 23 Jun 2026.csv',
    'cabai_merah':  '02 - Cabai Merah - 2020 s.d 23 Jun 2026.csv',
    'cabai_rawit':  '03 - Cabai Rawit - 2020 s.d 23 Jun 2026.csv',
    'bawang_merah': '04 - Bawang Merah - 2020 s.d 23 Jun 2026.csv',
    'bawang_putih': '05 - Bawang Putih - 2020 s.d 23 Jun 2026.csv',
    'minyak_goreng':'06 - Minyak Goreng - 2020 s.d 23 Jun 2026.csv',
    'telur_ayam':   '07 - Telur Ayam Ras - 2020 s.d 23 Jun 2026.csv',
}

pihps_frames = []
for komoditas, fname in PIHPS_FILES.items():
    fpath = os.path.join(PIHPS_DIR, fname)
    df_raw = pd.read_csv(fpath, encoding='utf-8', on_bad_lines='skip')
    df_raw['tanggal'] = pd.to_datetime(df_raw['tanggal'])
    
    # Exclude national row
    df_raw = df_raw[~df_raw['provinsi'].isin(EXCLUDE_PROV)].copy()
    
    # Add year-month column for aggregation
    df_raw['tahun_bulan'] = df_raw['tanggal'].dt.to_period('M')
    
    # Aggregate to monthly
    agg = df_raw.groupby(['provinsi', 'tahun_bulan']).agg(
        mean_price   = ('harga_rp', 'mean'),
        std_price    = ('harga_rp', 'std'),    # volatility
        max_price    = ('harga_rp', 'max'),    # peak
        min_price    = ('harga_rp', 'min'),    # floor
        n_obs        = ('harga_rp', 'count'),
    ).reset_index()
    
    agg.columns = ['provinsi', 'tahun_bulan', 
                   f'harga_{komoditas}_mean', f'harga_{komoditas}_std',
                   f'harga_{komoditas}_max', f'harga_{komoditas}_min',
                   f'n_obs_{komoditas}']
    
    pihps_frames.append(agg)
    print(f"  {komoditas}: {len(df_raw):,} daily obs -> {len(agg):,} monthly obs")

# Merge all commodities
print("\n  Merging commodities...")
pihps_monthly = pihps_frames[0]
for i in range(1, len(pihps_frames)):
    pihps_monthly = pihps_monthly.merge(pihps_frames[i], 
                                         on=['provinsi', 'tahun_bulan'], 
                                         how='outer')

print(f"  PIHPS merged shape: {pihps_monthly.shape}")
print(f"  Provinces: {pihps_monthly['provinsi'].nunique()}")
print(f"  Period range: {pihps_monthly['tahun_bulan'].min()} to {pihps_monthly['tahun_bulan'].max()}")

# ── STEP 2: Load BMKG ─────────────────────────────────────────────────────────
print("\n[2/4] Loading BMKG data...")
bmkg = pd.read_parquet(os.path.join(CLEAN_DIR, "bmkg_clean.parquet"))
print(f"  BMKG shape: {bmkg.shape}")
print(f"  Columns: {list(bmkg.columns)}")

# Normalize to monthly
bmkg['tanggal'] = pd.to_datetime(bmkg['tanggal'] if 'tanggal' in bmkg.columns else bmkg.index)
# Find date and province columns
print(f"  Sample:\n{bmkg.head(3).to_string()}")

# Detect column names
date_col = [c for c in bmkg.columns if 'tanggal' in c.lower() or 'date' in c.lower() or 'time' in c.lower()][0]
prov_col = [c for c in bmkg.columns if 'provinsi' in c.lower() or 'province' in c.lower() or 'prov' in c.lower()][0]

bmkg[date_col] = pd.to_datetime(bmkg[date_col])
bmkg['tahun_bulan'] = bmkg[date_col].dt.to_period('M')

# Numeric weather columns
numeric_bmkg = bmkg.select_dtypes(include=[np.number]).columns.tolist()
print(f"  Numeric weather columns: {numeric_bmkg}")

bmkg_monthly = bmkg.groupby([prov_col, 'tahun_bulan'])[numeric_bmkg].mean().reset_index()
bmkg_monthly = bmkg_monthly.rename(columns={prov_col: 'provinsi'})
print(f"  BMKG monthly shape: {bmkg_monthly.shape}")

# ── STEP 3: Load BNPB ─────────────────────────────────────────────────────────
print("\n[3/4] Loading BNPB data...")
bnpb = pd.read_parquet(os.path.join(CLEAN_DIR, "bnpb_clean.parquet"))
print(f"  BNPB shape: {bnpb.shape}")
print(f"  Columns: {list(bnpb.columns)}")
print(f"  Sample:\n{bnpb.head(3).to_string()}")

# Detect columns
date_col_b = [c for c in bnpb.columns if 'tanggal' in c.lower() or 'date' in c.lower() or 'time' in c.lower()][0]
prov_col_b = [c for c in bnpb.columns if 'provinsi' in c.lower() or 'province' in c.lower() or 'prov' in c.lower()][0]

bnpb[date_col_b] = pd.to_datetime(bnpb[date_col_b])
bnpb['tahun_bulan'] = bnpb[date_col_b].dt.to_period('M')

# Numeric disaster columns
numeric_bnpb = bnpb.select_dtypes(include=[np.number]).columns.tolist()
print(f"  Numeric BNPB columns: {numeric_bnpb}")

# Sum disasters per month (not mean — events are counts)
bnpb_monthly = bnpb.groupby([prov_col_b, 'tahun_bulan'])[numeric_bnpb].sum().reset_index()
bnpb_monthly = bnpb_monthly.rename(columns={prov_col_b: 'provinsi'})
print(f"  BNPB monthly shape: {bnpb_monthly.shape}")

# ── STEP 4: Load BPS ──────────────────────────────────────────────────────────
print("\n[4/4] Loading BPS data...")
bps = pd.read_parquet(os.path.join(CLEAN_DIR, "bps_clean.parquet"))
print(f"  BPS shape: {bps.shape}")
print(f"  Columns: {list(bps.columns)}")
print(f"  Sample:\n{bps.head(5).to_string()}")

# ── STEP 5: Merge all ────────────────────────────────────────────────────────
print("\n[5/5] Merging all datasets...")

# Start with PIHPS as backbone
master = pihps_monthly.copy()
master['tanggal'] = master['tahun_bulan'].dt.to_timestamp()

# Merge BMKG
master = master.merge(bmkg_monthly, on=['provinsi', 'tahun_bulan'], how='left')

# Merge BNPB
master = master.merge(bnpb_monthly, on=['provinsi', 'tahun_bulan'], how='left')
# Fill NaN disasters with 0 (month with no recorded disaster = 0)
disaster_cols = [c for c in bnpb_monthly.columns if c not in ['provinsi', 'tahun_bulan']]
for col in disaster_cols:
    if col in master.columns:
        master[col] = master[col].fillna(0)

# Merge BPS (annual -> monthly via forward fill)
print(f"\n  BPS merge strategy...")
# Check BPS structure
if 'tahun' in bps.columns or 'year' in bps.columns:
    year_col = 'tahun' if 'tahun' in bps.columns else 'year'
    prov_col_bps = [c for c in bps.columns if 'provinsi' in c.lower() or 'prov' in c.lower()][0]
    
    # Create monthly BPS by expanding annual to monthly
    bps_expanded_frames = []
    for _, row in bps.iterrows():
        for month in range(1, 13):
            r = row.to_dict()
            r['tahun_bulan'] = pd.Period(f"{int(row[year_col])}-{month:02d}", freq='M')
            bps_expanded_frames.append(r)
    
    bps_expanded = pd.DataFrame(bps_expanded_frames)
    bps_expanded = bps_expanded.rename(columns={prov_col_bps: 'provinsi'})
    bps_cols_keep = [c for c in bps_expanded.columns if c not in [year_col]]
    
    master = master.merge(bps_expanded[bps_cols_keep], 
                           on=['provinsi', 'tahun_bulan'], how='left')
else:
    print("  WARNING: BPS format unclear, skipping merge")

print(f"\n  MASTER shape: {master.shape}")
print(f"  Columns: {list(master.columns)}")
print(f"\n  Sample:\n{master.head(3).to_string()}")

# ── SAVE ─────────────────────────────────────────────────────────────────────
out_path = os.path.join(OUT_DIR, "master_dataset_v2.parquet")
master.to_parquet(out_path, index=False)
print(f"\nSaved: {out_path}")
print(f"Final shape: {master.shape}")

# Quick validation
print("\n=== VALIDATION ===")
print(f"Provinces: {master['provinsi'].nunique()}")
print(f"Date range: {master['tanggal'].min().date()} to {master['tanggal'].max().date()}")
print(f"Missing % per column:")
missing_pct = (master.isnull().sum() / len(master) * 100).round(1)
print(missing_pct[missing_pct > 0].sort_values(ascending=False).to_string())
print("\nDone!")
