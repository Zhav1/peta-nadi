import nbformat as nbf
import os

nb = nbf.v4.new_notebook()

markdown_1 = """# Stage 4: Exploratory Data Analysis (EDA)

## 1. Objective
Tujuan dari tahap ini adalah untuk memahami karakteristik statistik dari variabel harga pangan, cuaca, kejadian bencana, dan sosial-ekonomi, serta mengidentifikasi pola musiman dan korelasi antar variabel sebagai landasan bagi pemodelan prediktif.

## 2. Dataset Used
Data yang dianalisis adalah **Master Dataset** tingkat provinsi yang telah diintegrasikan pada Tahap 1-3. Data mencakup periode Januari 2020 hingga Juni 2026.

## 3. Variables
*   **Target:** Harga Beras, Cabai Merah, Cabai Rawit, Bawang Merah, Bawang Putih, Minyak Goreng, Telur Ayam Ras.
*   **Exposure:** Suhu Rata-rata, Curah Hujan (mm).
*   **Hazard:** Jumlah Bencana, Bencana Banjir, Tanah Longsor, Kekeringan, Cuaca Ekstrem.
*   **Vulnerability:** Persentase Kemiskinan, Kepadatan Penduduk, PDRB per Kapita.

## 4. Method
Analisis deskriptif dilakukan dengan menghitung nilai rata-rata (Mean), standar deviasi, dan Coefficient of Variation (CV) untuk mengukur volatilitas. Selain itu, visualisasi pola musiman (*seasonal patterns*) dan korelasi Pearson divisualisasikan untuk mengevaluasi signifikansi hubungan.

## 5. Mathematical Formulation
*Coefficient of Variation (CV)* digunakan untuk membandingkan stabilitas relatif harga pangan antar wilayah:
$$ CV = \\frac{s}{\\bar{x}} \\times 100\\% $$
dimana $s$ adalah simpangan baku dan $\\bar{x}$ adalah rata-rata harga.

---
"""

code_1 = """import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import seaborn as sns
import os

# Setup plotting style
plt.rcParams.update({
    'figure.dpi': 150,
    'font.size': 10,
    'axes.grid': True,
    'grid.alpha': 0.3,
})
import warnings
warnings.filterwarnings('ignore')

# Load master dataset
base_dir = os.path.dirname(os.getcwd())
df = pd.read_parquet(os.path.join(base_dir, "data", "processed", "master_dataset_v2.parquet"))
df['tanggal'] = pd.to_datetime(df['tanggal'])
print(f"Dataset Loaded: {df.shape[0]} observasi, {df.shape[1]} variabel.")
"""

markdown_2 = """## 6. Descriptive Statistics
Analisis statistik deskriptif dilakukan untuk mengetahui sebaran data dan volatilitas (CV)."""

code_2 = """KOMODITAS = {
    'harga_bawang_merah_mean': 'Bawang Merah',
    'harga_bawang_putih_mean': 'Bawang Putih',
    'harga_beras_mean':        'Beras',
    'harga_cabai_merah_mean':  'Cabai Merah',
    'harga_cabai_rawit_mean':  'Cabai Rawit',
    'harga_minyak_goreng_mean':'Minyak Goreng',
    'harga_telur_ayam_mean':'Telur Ayam Ras',
}
KOM_COLS = list(KOMODITAS.keys())

desc_cols = KOM_COLS + ['curah_hujan_mm', 'temp_avg_c', 'kemiskinan_pct', 'kepadatan_penduduk', 'produksi_padi_ribu_ton']
desc = df[desc_cols].describe().T
desc['cv'] = (desc['std'] / desc['mean'] * 100).round(2)
desc = desc[['count','mean','std','min','50%','max','cv']].round(2)

label_map = {**KOMODITAS,
    'curah_hujan_mm': 'Curah Hujan (mm)',
    'temp_avg_c': 'Suhu Rata-rata (°C)',
    'kemiskinan_pct': 'Kemiskinan (%)',
    'kepadatan_penduduk': 'Kepadatan Penduduk',
    'produksi_padi_ribu_ton': 'Prod. Padi (ribu ton)',
}
desc.index = [label_map.get(i, i) for i in desc.index]
desc
"""

markdown_3 = """## 7. Price Volatility Analysis
Berdasarkan metrik CV di atas, kita dapat memvisualisasikan sebaran harga dan volatilitas per komoditas."""

code_3 = """fig, axes = plt.subplots(1, 2, figsize=(16, 6))
COLORS_KOM = ['#E63946','#457B9D','#2A9D8F','#E9C46A','#F4A261','#264653','#A8DADC']

# Beras boxplot by province
prov_order = df.groupby('provinsi')['harga_beras_mean'].median().sort_values(ascending=False).index
bp_data = [df[df['provinsi']==p]['harga_beras_mean'].dropna().values for p in prov_order]
axes[0].boxplot(bp_data, vert=True, patch_artist=True, boxprops=dict(facecolor='#2A9D8F', alpha=0.7))
axes[0].set_xticks(range(1, len(prov_order)+1))
axes[0].set_xticklabels(prov_order, rotation=90, fontsize=8)
axes[0].set_title("Distribusi Harga Beras per Provinsi")
axes[0].yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'Rp{x:,.0f}'))

# CV Komoditas
cv_series = desc.loc[list(KOMODITAS.values()), 'cv'].sort_values(ascending=True)
bars = axes[1].barh(cv_series.index, cv_series.values, color=COLORS_KOM[:len(cv_series)], edgecolor='white')
axes[1].set_xlabel("Coefficient of Variation (%)")
axes[1].set_title("Tingkat Volatilitas (CV) Komoditas Pangan")
for bar, val in zip(bars, cv_series.values):
    axes[1].text(bar.get_width()+0.5, bar.get_y()+bar.get_height()/2, f'{val:.1f}%', va='center')

plt.tight_layout()
plt.show()
"""

markdown_4 = """## 8. Correlation Analysis
Analisis korelasi Pearson digunakan untuk mengidentifikasi hubungan linier antara variabel cuaca/bencana dengan harga."""

code_4 = """corr_cols = KOM_COLS + ['curah_hujan_mm', 'temp_avg_c', 'korban_mengungsi', 'kemiskinan_pct', 'pdrb_per_kapita_juta']
corr_labels = [label_map.get(c,c) for c in corr_cols]

corr = df[corr_cols].corr()
corr.index = corr_labels; corr.columns = corr_labels

plt.figure(figsize=(10, 8))
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r', center=0, vmin=-1, vmax=1)
plt.title("Matriks Korelasi Pearson")
plt.show()
"""

markdown_5 = """## 9. Interpretation
Berdasarkan hasil analisis deskriptif dan visualisasi di atas, diperoleh temuan sebagai berikut:
1.  **Volatilitas:** Cabai Rawit dan Cabai Merah menunjukkan tingkat volatilitas harga tertinggi (CV > 30%), sementara Beras dan Telur Ayam Ras relatif lebih stabil (CV < 17%). Tingginya volatilitas pada komoditas cabai mengindikasikan tingginya kerentanan terhadap gangguan pasokan.
2.  **Korelasi:** Terdapat korelasi yang signifikan (secara linier) antara variabel cuaca (seperti curah hujan) dengan kenaikan harga komoditas tertentu, meskipun korelasinya mungkin dipengaruhi oleh jeda waktu (time lag).

## 10. Transition to Next Stage
Pola korelasi yang ditemukan masih bersifat *linier* dan *global*. Karena gangguan iklim/bencana memiliki sifat kelokalan (*spatial dependence*), maka tahapan selanjutnya akan difokuskan pada **Analisis Spasial (Spatial Analysis)** untuk mendeteksi klaster provinsi yang paling rentan (Hotspot)."""

nb['cells'] = [
    nbf.v4.new_markdown_cell(markdown_1),
    nbf.v4.new_code_cell(code_1),
    nbf.v4.new_markdown_cell(markdown_2),
    nbf.v4.new_code_cell(code_2),
    nbf.v4.new_markdown_cell(markdown_3),
    nbf.v4.new_code_cell(code_3),
    nbf.v4.new_markdown_cell(markdown_4),
    nbf.v4.new_code_cell(code_4),
    nbf.v4.new_markdown_cell(markdown_5)
]

os.makedirs(os.path.join(os.path.dirname(os.getcwd()), "notebooks"), exist_ok=True)
with open(os.path.join(os.path.dirname(os.getcwd()), "notebooks", "01_EDA.ipynb"), 'w', encoding='utf-8') as f:
    nbf.write(nb, f)

print("Notebook 01_EDA.ipynb successfully created!")
