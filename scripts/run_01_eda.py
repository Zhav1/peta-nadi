"""
Stage 4: Exploratory Data Analysis
PANGANIS — PetaNadi Analytics (Satria Data 2026)
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import seaborn as sns
import json
import os
import warnings
warnings.filterwarnings('ignore')

# ── Setup ────────────────────────────────────────────────────────────────────
BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_FIG = os.path.join(BASE, "outputs", "figures")
OUT_TAB = os.path.join(BASE, "outputs", "tables")
OUT_RES = os.path.join(BASE, "outputs", "results")
for d in [OUT_FIG, OUT_TAB, OUT_RES]:
    os.makedirs(d, exist_ok=True)

# Matplotlib style
plt.rcParams.update({
    'figure.dpi': 150,
    'font.size': 10,
    'axes.grid': True,
    'grid.alpha': 0.3,
})

KOMODITAS = {
    'harga_bawang_merah_mean': 'Bawang Merah',
    'harga_bawang_putih_mean': 'Bawang Putih',
    'harga_beras_mean':        'Beras',
    'harga_cabai_merah_mean':  'Cabai Merah',
    'harga_cabai_rawit_mean':  'Cabai Rawit',
    'harga_minyak_goreng_mean':'Minyak Goreng',
    'harga_telur_ayam_mean':   'Telur Ayam Ras',
}
KOM_COLS = list(KOMODITAS.keys())
COLORS_KOM = ['#E63946','#457B9D','#2A9D8F','#E9C46A','#F4A261','#264653','#A8DADC']

# ── Load Data ─────────────────────────────────────────────────────────────────
print("Loading master dataset...")
df = pd.read_parquet(os.path.join(BASE, "data", "processed", "master_dataset_v2.parquet"))
df['tanggal'] = pd.to_datetime(df['tanggal'])
print(f"  Shape: {df.shape}")
print(f"  Date range: {df['tanggal'].min().date()} – {df['tanggal'].max().date()}")
print(f"  Provinces: {df['provinsi'].nunique()}")

# ── 1. Descriptive Statistics ─────────────────────────────────────────────────
print("\n[1/7] Descriptive Statistics...")
desc_cols = KOM_COLS + ['curah_hujan_mm', 'temp_avg_c', 'jumlah_bencana',
                         'kemiskinan_pct', 'kepadatan_penduduk', 'produksi_padi_ribu_ton',
                         'pdrb_per_kapita_juta']
desc = df[desc_cols].describe().T
desc['cv'] = (desc['std'] / desc['mean'] * 100).round(2)   # Coefficient of Variation
desc = desc[['count','mean','std','min','25%','50%','75%','max','cv']]
desc.columns = ['N','Mean','Std','Min','Q1','Median','Q3','Max','CV (%)']
desc = desc.round(2)

# Rename index
label_map = {**KOMODITAS,
    'curah_hujan_mm': 'Curah Hujan (mm)',
    'temp_avg_c': 'Suhu Rata-rata (°C)',
    'jumlah_bencana': 'Jumlah Bencana',
    'kemiskinan_pct': 'Kemiskinan (%)',
    'kepadatan_penduduk': 'Kepadatan Penduduk',
    'produksi_padi_ribu_ton': 'Prod. Padi (ribu ton)',
    'pdrb_per_kapita_juta': 'PDRB per Kapita (juta)',
}
desc.index = [label_map.get(i, i) for i in desc.index]
desc.to_csv(os.path.join(OUT_TAB, "01_descriptive_statistics.csv"))
print("  Saved: 01_descriptive_statistics.csv")
print(desc[['Mean','Std','CV (%)','Min','Max']].to_string())

# ── 2. National Average Price Trend ──────────────────────────────────────────
print("\n[2/7] National Price Trends...")
monthly_national = df.groupby('tanggal')[KOM_COLS].mean()

fig, axes = plt.subplots(4, 2, figsize=(16, 18))
axes = axes.flatten()
for i, (col, label) in enumerate(KOMODITAS.items()):
    ax = axes[i]
    ts = monthly_national[col]
    ax.plot(ts.index, ts.values, color=COLORS_KOM[i], linewidth=2)
    ax.fill_between(ts.index, ts.values, alpha=0.15, color=COLORS_KOM[i])
    ax.set_title(f"Harga Rata-rata Nasional — {label}", fontsize=11, fontweight='bold')
    ax.set_xlabel('')
    ax.set_ylabel("Harga (Rp/kg)", fontsize=9)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'Rp{x:,.0f}'))
    # Mark COVID-19 period
    ax.axvspan(pd.Timestamp('2020-03-01'), pd.Timestamp('2022-01-01'), alpha=0.05, color='red', label='COVID-19')
axes[-1].set_visible(False)
plt.suptitle("Tren Harga Pangan Nasional 2020–2026\n(Rata-rata 34 Provinsi)", 
             fontsize=14, fontweight='bold', y=1.01)
plt.tight_layout()
plt.savefig(os.path.join(OUT_FIG, "01a_price_trends_national.png"), bbox_inches='tight')
plt.close()
print("  Saved: 01a_price_trends_national.png")

# ── 3. Price Volatility by Province (Boxplot) ─────────────────────────────────
print("\n[3/7] Price Volatility Analysis...")
# Focus on beras (most stable food staple — policy relevant)
fig, axes = plt.subplots(1, 2, figsize=(18, 7))

# Beras boxplot by province
prov_order = df.groupby('provinsi')['harga_beras'].median().sort_values(ascending=False).index
beras_by_prov = df.pivot_table(index='tanggal', columns='provinsi', values='harga_beras')
bp_data = [df[df['provinsi']==p]['harga_beras'].dropna().values for p in prov_order]
bp = axes[0].boxplot(bp_data, vert=True, patch_artist=True,
                      boxprops=dict(facecolor='#2A9D8F', alpha=0.7),
                      medianprops=dict(color='#E63946', linewidth=2),
                      whiskerprops=dict(color='gray'),
                      flierprops=dict(marker='o', markersize=2, alpha=0.5))
axes[0].set_xticks(range(1, len(prov_order)+1))
axes[0].set_xticklabels(prov_order, rotation=90, fontsize=7)
axes[0].set_title("Volatilitas Harga Beras per Provinsi", fontweight='bold')
axes[0].set_ylabel("Harga (Rp/kg)")
axes[0].yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'Rp{x:,.0f}'))

# CV Komoditas
cv_kom = {}
for col, label in KOMODITAS.items():
    mean = df[col].mean()
    std = df[col].std()
    cv_kom[label] = std / mean * 100
cv_series = pd.Series(cv_kom).sort_values(ascending=True)
bars = axes[1].barh(range(len(cv_series)), cv_series.values, 
                      color=COLORS_KOM[:len(cv_series)], alpha=0.8, edgecolor='white')
axes[1].set_yticks(range(len(cv_series)))
axes[1].set_yticklabels(cv_series.index, fontsize=9)
axes[1].set_xlabel("Coefficient of Variation (%)")
axes[1].set_title("Volatilitas Komoditas (CV%)\n— Semakin Tinggi, Semakin Tidak Stabil", fontweight='bold')
for bar, val in zip(bars, cv_series.values):
    axes[1].text(bar.get_width()+0.3, bar.get_y()+bar.get_height()/2, 
                  f'{val:.1f}%', va='center', fontsize=9, fontweight='bold')

plt.tight_layout()
plt.savefig(os.path.join(OUT_FIG, "01b_price_volatility.png"), bbox_inches='tight')
plt.close()
print("  Saved: 01b_price_volatility.png")
print(f"  CV% per komoditas:\n{cv_series.round(2).to_string()}")

# ── 4. Correlation Matrix ─────────────────────────────────────────────────────
print("\n[4/7] Correlation Analysis...")
corr_cols = KOM_COLS + ['curah_hujan_mm', 'temp_avg_c', 'jumlah_bencana',
                          'bencana_banjir', 'kemiskinan_pct', 'kepadatan_penduduk',
                          'produksi_padi_ribu_ton', 'pdrb_per_kapita_juta', 'panjang_jalan_km']
corr_labels = [label_map.get(c,c) for c in corr_cols]

corr = df[corr_cols].corr()
corr.index = corr_labels
corr.columns = corr_labels

fig, ax = plt.subplots(figsize=(14, 11))
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', 
            cmap='RdBu_r', center=0, vmin=-1, vmax=1,
            linewidths=0.5, ax=ax, cbar_kws={'shrink': 0.8},
            annot_kws={'size': 7})
ax.set_title("Matriks Korelasi: Variabel Harga, Cuaca, Bencana & Sosioekonomik",
             fontsize=13, fontweight='bold', pad=15)
plt.xticks(rotation=45, ha='right', fontsize=8)
plt.yticks(rotation=0, fontsize=8)
plt.tight_layout()
plt.savefig(os.path.join(OUT_FIG, "01c_correlation_matrix.png"), bbox_inches='tight')
plt.close()
print("  Saved: 01c_correlation_matrix.png")

# Save key correlations vs price
corr_raw = df[corr_cols].corr()
price_corr = corr_raw[KOM_COLS].loc[['curah_hujan_mm', 'temp_avg_c', 'jumlah_bencana',
                                       'bencana_banjir', 'kemiskinan_pct', 
                                       'produksi_padi_ribu_ton', 'pdrb_per_kapita_juta']]
price_corr.to_csv(os.path.join(OUT_TAB, "01_correlation_price_vs_drivers.csv"))
print("  Saved: 01_correlation_price_vs_drivers.csv")
print("\n  Key correlations with harga_beras:")
print(corr_raw['harga_beras'][['curah_hujan_mm','temp_avg_c','jumlah_bencana',
                                'kemiskinan_pct','pdrb_per_kapita_juta']].round(3).to_string())

# ── 5. Seasonal / Monthly Pattern ────────────────────────────────────────────
print("\n[5/7] Seasonal Analysis...")
df['bulan'] = df['tanggal'].dt.month
monthly_avg = df.groupby('bulan')[KOM_COLS + ['curah_hujan_mm']].mean()

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))

# Price seasonal
bulan_labels = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
for i, (col, label) in enumerate(KOMODITAS.items()):
    ax1.plot(monthly_avg.index, monthly_avg[col], 
             color=COLORS_KOM[i], marker='o', markersize=5, linewidth=2, label=label)
ax1.set_xticks(range(1,13)); ax1.set_xticklabels(bulan_labels)
ax1.set_title("Pola Musiman Harga Pangan (Rata-rata per Bulan, 2020–2026)", fontweight='bold')
ax1.set_ylabel("Harga Rata-rata (Rp/kg)")
ax1.legend(fontsize=8, ncol=2)
ax1.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'Rp{x:,.0f}'))

# Rainfall seasonal
ax2.bar(monthly_avg.index, monthly_avg['curah_hujan_mm'], 
        color='#457B9D', alpha=0.7, edgecolor='white')
ax2.set_xticks(range(1,13)); ax2.set_xticklabels(bulan_labels)
ax2.set_title("Pola Curah Hujan Bulanan Rata-rata (2020–2026)", fontweight='bold')
ax2.set_ylabel("Curah Hujan (mm)")

plt.tight_layout()
plt.savefig(os.path.join(OUT_FIG, "01d_seasonal_patterns.png"), bbox_inches='tight')
plt.close()
print("  Saved: 01d_seasonal_patterns.png")

# ── 6. Disaster frequency trend ──────────────────────────────────────────────
print("\n[6/7] Disaster Frequency Analysis...")
df['tahun_val'] = df['tanggal'].dt.year
disaster_trend = df.groupby('tahun_val')[['jumlah_bencana','bencana_banjir',
                                            'bencana_cuaca_ekstrem','bencana_kekeringan',
                                            'bencana_tanah_longsor']].sum()
disaster_trend.to_csv(os.path.join(OUT_TAB, "01_disaster_frequency_by_year.csv"))
print("  Disaster trend by year:")
print(disaster_trend.to_string())

# ── 7. Data Quality Summary ───────────────────────────────────────────────────
print("\n[7/7] Data Quality Summary...")
missing = (df[corr_cols].isnull().sum() / len(df) * 100).round(2)
quality = pd.DataFrame({
    'Missing (%)': missing,
    'Dtype': df[corr_cols].dtypes,
    'Non-null Count': df[corr_cols].notnull().sum()
})
quality.index = corr_labels
quality.to_csv(os.path.join(OUT_TAB, "01_data_quality.csv"))
print(quality.to_string())

# ── Save key results JSON ─────────────────────────────────────────────────────
results = {
    "shape": list(df.shape),
    "n_provinces": int(df['provinsi'].nunique()),
    "date_range": [str(df['tanggal'].min().date()), str(df['tanggal'].max().date())],
    "cv_komoditas": cv_series.round(2).to_dict(),
    "corr_beras_vs_drivers": corr_raw['harga_beras'][
        ['curah_hujan_mm','temp_avg_c','jumlah_bencana',
         'kemiskinan_pct','pdrb_per_kapita_juta','panjang_jalan_km']
    ].round(4).to_dict(),
    "corr_cabai_merah_vs_drivers": corr_raw['harga_cabai_merah'][
        ['curah_hujan_mm','temp_avg_c','jumlah_bencana',
         'kemiskinan_pct','pdrb_per_kapita_juta']
    ].round(4).to_dict(),
    "mean_prices": df[KOM_COLS].mean().round(0).to_dict(),
    "monthly_missing_pct": missing.to_dict(),
    "disaster_total_by_year": disaster_trend['jumlah_bencana'].to_dict(),
}
with open(os.path.join(OUT_RES, "01_eda_results.json"), 'w') as f:
    json.dump(results, f, indent=2, default=str)
print("\n  Saved: 01_eda_results.json")

print("\n✅ EDA COMPLETE. All outputs saved to outputs/")
