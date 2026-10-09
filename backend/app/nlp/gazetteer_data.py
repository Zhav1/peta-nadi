"""
Comprehensive Pan-Sumatra Logistics Gazetteer Data.
Covers all 10 provinces of Sumatra:
1. Aceh
2. Sumatera Utara (North Sumatra)
3. Sumatera Barat (West Sumatra)
4. Riau
5. Kepulauan Riau (Riau Islands)
6. Jambi
7. Sumatera Selatan (South Sumatra)
8. Bengkulu
9. Lampung
10. Kepulauan Bangka Belitung

Includes coordinates (lat, lon), primary highway corridor, and province.
"""

from typing import Dict, Tuple, Any

SUMATRA_BOUNDING_BOX = {
    "min_lon": 95.0,
    "max_lon": 109.0,
    "min_lat": -6.2,
    "max_lat": 6.0
}

PAN_SUMATRA_GAZETTEER: Dict[str, Dict[str, Any]] = {
    # ==================== NORTH SUMATRA (SUMUT) ====================
    "medan": {"coords": (3.5952, 98.6722), "province": "Sumatera Utara", "corridor": "Jalinsum Arteri Utama"},
    "belawan": {"coords": (3.7944, 98.6913), "province": "Sumatera Utara", "corridor": "Akses Pelabuhan Belawan"},
    "pelabuhan belawan": {"coords": (3.7944, 98.6913), "province": "Sumatera Utara", "corridor": "Akses Pelabuhan Belawan"},
    "binjai": {"coords": (3.5997, 98.4885), "province": "Sumatera Utara", "corridor": "Tol Medan - Binjai"},
    "tebing tinggi": {"coords": (3.3285, 99.1625), "province": "Sumatera Utara", "corridor": "Jalinsum KM 78 / Tol MKTT"},
    "pematangsiantar": {"coords": (2.9595, 99.0687), "province": "Sumatera Utara", "corridor": "Jalur Siantar - Parapat"},
    "kisaran": {"coords": (2.9839, 99.6267), "province": "Sumatera Utara", "corridor": "Jalintim Asahan"},
    "rantau prapat": {"coords": (2.0950, 99.8290), "province": "Sumatera Utara", "corridor": "Jalintim Labuhanbatu"},
    "kuala tanjung": {"coords": (3.3556, 99.4475), "province": "Sumatera Utara", "corridor": "Kawasan Industri Pelabuhan Kuala Tanjung"},
    "sibolga": {"coords": (1.7455, 98.7875), "province": "Sumatera Utara", "corridor": "Jalinbar Sibolga - Tapteng"},
    "danau toba": {"coords": (2.6845, 98.8756), "province": "Sumatera Utara", "corridor": "Lingkar Danau Toba"},
    "simalungun": {"coords": (2.9500, 99.1000), "province": "Sumatera Utara", "corridor": "Jalur Arteri Simalungun"},
    "karo": {"coords": (3.1167, 98.5000), "province": "Sumatera Utara", "corridor": "Jalur Medan - Berastagi"},
    "berastagi": {"coords": (3.1833, 98.5167), "province": "Sumatera Utara", "corridor": "Jalur Medan - Berastagi"},
    "dairi": {"coords": (2.8167, 98.3167), "province": "Sumatera Utara", "corridor": "Jalur Sidikalang"},
    "langkat": {"coords": (3.7333, 98.4167), "province": "Sumatera Utara", "corridor": "Jalinsum Langkat - Aceh"},
    "lubuk pakam": {"coords": (3.5606, 98.8767), "province": "Sumatera Utara", "corridor": "Tol Medan - Kualanamu"},
    "tanjung balai": {"coords": (2.9667, 99.8000), "province": "Sumatera Utara", "corridor": "Pelabuhan Teluk Nibung"},

    # ==================== WEST SUMATRA (SUMBAR) ====================
    "padang": {"coords": (-0.9471, 100.4172), "province": "Sumatera Barat", "corridor": "Jalinbar / Akses Teluk Bayur"},
    "teluk bayur": {"coords": (-0.9992, 100.3753), "province": "Sumatera Barat", "corridor": "Pelabuhan Teluk Bayur"},
    "pelabuhan teluk bayur": {"coords": (-0.9992, 100.3753), "province": "Sumatera Barat", "corridor": "Pelabuhan Teluk Bayur"},
    "bukittinggi": {"coords": (-0.3056, 100.3692), "province": "Sumatera Barat", "corridor": "Jalinteng Padang - Bukittinggi"},
    "sitinjau lauik": {"coords": (-0.9525, 100.5183), "province": "Sumatera Barat", "corridor": "Sitinjau Lauik KM 22 (Padang - Solok)"},
    "solok": {"coords": (-0.7981, 100.6586), "province": "Sumatera Barat", "corridor": "Jalur Arteri Padang - Solok"},
    "payakumbuh": {"coords": (-0.2247, 100.6308), "province": "Sumatera Barat", "corridor": "Jalur Sumbar - Riau (Kelok 9)"},
    "kelok 9": {"coords": (-0.1417, 100.7014), "province": "Sumatera Barat", "corridor": "Jembatan Kelok Sembilan Sumbar-Riau"},
    "pariaman": {"coords": (-0.6264, 100.1208), "province": "Sumatera Barat", "corridor": "Jalinbar Pariaman"},
    "padang pariaman": {"coords": (-0.5600, 100.2500), "province": "Sumatera Barat", "corridor": "Jalur Bandara Minangkabau"},
    "agam": {"coords": (-0.2500, 100.1667), "province": "Sumatera Barat", "corridor": "Jalur Kelok 44 Maninjau"},
    "tanah datar": {"coords": (-0.4500, 100.5833), "province": "Sumatera Barat", "corridor": "Jalur Batusangkar - Padang Panjang"},
    "padang panjang": {"coords": (-0.4667, 100.4000), "province": "Sumatera Barat", "corridor": "Lembah Anai (Padang - Padang Panjang)"},
    "lembah anai": {"coords": (-0.4850, 100.3550), "province": "Sumatera Barat", "corridor": "Lembah Anai KM 60"},
    "pasaman": {"coords": (0.1667, 100.0833), "province": "Sumatera Barat", "corridor": "Jalur Pasaman - Sumut"},
    "pesisir selatan": {"coords": (-1.3500, 100.5667), "province": "Sumatera Barat", "corridor": "Jalinbar Painan - Bengkulu"},
    "dharmasraya": {"coords": (-1.0500, 101.6167), "province": "Sumatera Barat", "corridor": "Jalinteng Dharmasraya - Jambi"},

    # ==================== RIAU & KEPRI ====================
    "pekanbaru": {"coords": (0.5071, 101.4478), "province": "Riau", "corridor": "Tol Pekanbaru - Dumai"},
    "dumai": {"coords": (1.6784, 101.4503), "province": "Riau", "corridor": "Pelabuhan Ekspor CPO Dumai"},
    "pelabuhan dumai": {"coords": (1.6880, 101.4450), "province": "Riau", "corridor": "Pelabuhan Ekspor CPO Dumai"},
    "siak": {"coords": (0.7978, 102.0494), "province": "Riau", "corridor": "Kawasan Industri Tanjung Buton"},
    "kampar": {"coords": (0.3344, 101.0253), "province": "Riau", "corridor": "Tol Pekanbaru - Bangkinang - Koto Kampar"},
    "bangkinang": {"coords": (0.3344, 101.0253), "province": "Riau", "corridor": "Tol Pekanbaru - Bangkinang"},
    "rokan hilir": {"coords": (2.1667, 100.8333), "province": "Riau", "corridor": "Jalintim Bagansiapiapi - Sumut"},
    "rokan hulu": {"coords": (0.9000, 100.5333), "province": "Riau", "corridor": "Jalur Pasir Pengaraian"},
    "pelalawan": {"coords": (0.3333, 101.9000), "province": "Riau", "corridor": "Jalintim Pangkalan Kerinci"},
    "indragiri hulu": {"coords": (-0.5500, 102.3167), "province": "Riau", "corridor": "Jalintim Rengat"},
    "indragiri hilir": {"coords": (-0.3333, 103.1500), "province": "Riau", "corridor": "Pelabuhan Kuala Enok"},
    "batam": {"coords": (1.1301, 104.0529), "province": "Kepulauan Riau", "corridor": "Pelabuhan Batu Ampar Batam"},
    "tanjung pinang": {"coords": (0.9167, 104.4500), "province": "Kepulauan Riau", "corridor": "Pelabuhan Sri Bintan Pura"},
    "bintan": {"coords": (1.0833, 104.5000), "province": "Kepulauan Riau", "corridor": "Kawasan Industri Bintan"},

    # ==================== ACEH ====================
    "banda aceh": {"coords": (5.5483, 95.3238), "province": "Aceh", "corridor": "Tol Sigli - Banda Aceh (Sibanceh)"},
    "krueng raya": {"coords": (5.5894, 95.5186), "province": "Aceh", "corridor": "Pelabuhan Malahayati Krueng Raya"},
    "malahayati": {"coords": (5.5894, 95.5186), "province": "Aceh", "corridor": "Pelabuhan Malahayati Krueng Raya"},
    "lhokseumawe": {"coords": (5.1801, 97.1507), "province": "Aceh", "corridor": "Pelabuhan Krueng Geukueh"},
    "langsa": {"coords": (4.4714, 97.9683), "province": "Aceh", "corridor": "Jalinsum Aceh Timur - Langsa"},
    "aceh besar": {"coords": (5.3833, 95.4500), "province": "Aceh", "corridor": "Jalur Jantho"},
    "bireuen": {"coords": (5.2000, 96.7000), "province": "Aceh", "corridor": "Jalinsum Bireuen - Takengon"},
    "meulaboh": {"coords": (4.1364, 96.1285), "province": "Aceh", "corridor": "Jalinbar Aceh Barat"},
    "subulussalam": {"coords": (2.7500, 98.0000), "province": "Aceh", "corridor": "Jalur Perbatasan Aceh - Pakpak Bharat"},
    "aceh tamiang": {"coords": (4.2500, 98.0500), "province": "Aceh", "corridor": "Gerbang Perbatasan Aceh - Sumut"},

    # ==================== SOUTH SUMATRA (SUMSEL) ====================
    "palembang": {"coords": (-2.9761, 104.7754), "province": "Sumatera Selatan", "corridor": "Jalintim Palembang / Tol Kayuagung"},
    "boom baru": {"coords": (-2.9722, 104.7833), "province": "Sumatera Selatan", "corridor": "Pelabuhan Sungai Boom Baru"},
    "pelabuhan boom baru": {"coords": (-2.9722, 104.7833), "province": "Sumatera Selatan", "corridor": "Pelabuhan Sungai Boom Baru"},
    "prabumulih": {"coords": (-3.4300, 104.2300), "province": "Sumatera Selatan", "corridor": "Tol Indralaya - Prabumulih"},
    "lubuklinggau": {"coords": (-3.2958, 102.8617), "province": "Sumatera Selatan", "corridor": "Jalinteng Musi Rawas - Bengkulu"},
    "kayuagung": {"coords": (-3.3956, 104.8464), "province": "Sumatera Selatan", "corridor": "Tol Terbanggi Besar - Pematang Panggang - Kayuagung"},
    "banyuasin": {"coords": (-2.8833, 104.3833), "province": "Sumatera Selatan", "corridor": "Pelabuhan Tanjung Carat / Jalintim"},
    "muara enim": {"coords": (-3.6500, 103.8000), "province": "Sumatera Selatan", "corridor": "Jalur Batubara Muara Enim"},
    "lahat": {"coords": (-3.7833, 103.5333), "province": "Sumatera Selatan", "corridor": "Jalinteng Lahat"},
    "ogan ilir": {"coords": (-3.4333, 104.6000), "province": "Sumatera Selatan", "corridor": "Simpang Indralaya"},
    "oku timur": {"coords": (-3.8500, 104.7500), "province": "Sumatera Selatan", "corridor": "Sentra Beras Belitang"},
    "belitang": {"coords": (-4.0000, 104.6000), "province": "Sumatera Selatan", "corridor": "Sentra Padi Belitang OKU Timur"},

    # ==================== LAMPUNG ====================
    "bandar lampung": {"coords": (-5.4297, 105.2625), "province": "Lampung", "corridor": "Akses Pelabuhan Panjang / JTTS"},
    "bakauheni": {"coords": (-5.8697, 105.7533), "province": "Lampung", "corridor": "Pelabuhan Penyeberangan Bakauheni - Merak"},
    "pelabuhan bakauheni": {"coords": (-5.8697, 105.7533), "province": "Lampung", "corridor": "Pelabuhan Penyeberangan Bakauheni - Merak"},
    "pelabuhan panjang": {"coords": (-5.4744, 105.3183), "province": "Lampung", "corridor": "Pelabuhan Samudera Panjang"},
    "panjang": {"coords": (-5.4744, 105.3183), "province": "Lampung", "corridor": "Pelabuhan Samudera Panjang"},
    "terbanggi besar": {"coords": (-4.8833, 105.2167), "province": "Lampung", "corridor": "Tol Bakauheni - Terbanggi Besar (Bakter)"},
    "mesuji": {"coords": (-4.0500, 105.4000), "province": "Lampung", "corridor": "Jalintim Mesuji (Perbatasan Lampung - Sumsel)"},
    "lampung selatan": {"coords": (-5.5833, 105.6000), "province": "Lampung", "corridor": "Koridor JTTS Kalianda"},
    "tulang bawang": {"coords": (-4.5000, 105.3333), "province": "Lampung", "corridor": "Jalintim Menggala"},
    "lampung tengah": {"coords": (-4.9500, 105.2000), "province": "Lampung", "corridor": "Sentra Pangan Lampung Tengah"},
    "pesawaran": {"coords": (-5.4500, 105.1500), "province": "Lampung", "corridor": "Jalinbar Pesawaran"},
    "pesisir barat": {"coords": (-5.1833, 103.9500), "province": "Lampung", "corridor": "Jalinbar Krui"},
    "krui": {"coords": (-5.1833, 103.9500), "province": "Lampung", "corridor": "Jalinbar Krui"},

    # ==================== JAMBI ====================
    "jambi": {"coords": (-1.6101, 103.6131), "province": "Jambi", "corridor": "Jalintim Jambi"},
    "muaro jambi": {"coords": (-1.5500, 103.8000), "province": "Jambi", "corridor": "Kawasan Pelabuhan Talang Duku"},
    "talang duku": {"coords": (-1.5200, 103.7800), "province": "Jambi", "corridor": "Pelabuhan Sungai Talang Duku Jambi"},
    "batanghari": {"coords": (-1.7500, 103.1167), "province": "Jambi", "corridor": "Jalur Angkutan Batubara Batanghari"},
    "merangin": {"coords": (-2.1167, 102.2667), "province": "Jambi", "corridor": "Jalinteng Bangko"},
    "sarolangun": {"coords": (-2.3000, 102.6500), "province": "Jambi", "corridor": "Jalinteng Sarolangun"},
    "tanjung jabung barat": {"coords": (-0.9500, 103.4500), "province": "Jambi", "corridor": "Pelabuhan Roro Kuala Tungkal"},
    "kuala tungkal": {"coords": (-0.8167, 103.4667), "province": "Jambi", "corridor": "Pelabuhan Roro Kuala Tungkal"},
    "kerinci": {"coords": (-2.0833, 101.4833), "province": "Jambi", "corridor": "Jalur Pertanian Sayur Kerinci"},

    # ==================== BENGKULU ====================
    "bengkulu": {"coords": (-3.8004, 102.2655), "province": "Bengkulu", "corridor": "Jalinbar Bengkulu / Akses Pulau Baai"},
    "pulau baai": {"coords": (-3.9000, 102.3000), "province": "Bengkulu", "corridor": "Pelabuhan Samudera Pulau Baai"},
    "pelabuhan pulau baai": {"coords": (-3.9000, 102.3000), "province": "Bengkulu", "corridor": "Pelabuhan Samudera Pulau Baai"},
    "rejang lebong": {"coords": (-3.4667, 102.5333), "province": "Bengkulu", "corridor": "Jalur Curup - Lubuklinggau"},
    "curup": {"coords": (-3.4667, 102.5333), "province": "Bengkulu", "corridor": "Jalur Pegunungan Curup - Lubuklinggau"},
    "mukomuko": {"coords": (-2.5833, 101.1167), "province": "Bengkulu", "corridor": "Jalinbar Mukomuko (Bengkulu - Sumbar)"},
    "bengkulu selatan": {"coords": (-4.4500, 103.0000), "province": "Bengkulu", "corridor": "Jalinbar Manna"},
    "kaur": {"coords": (-4.7833, 103.3500), "province": "Bengkulu", "corridor": "Jalinbar Kaur (Bengkulu - Lampung)"},

    # ==================== BANGKA BELITUNG ====================
    "pangkalpinang": {"coords": (-2.1333, 106.1167), "province": "Kepulauan Bangka Belitung", "corridor": "Pelabuhan Pangkal Balam"},
    "tanjung pandan": {"coords": (-2.7333, 107.6333), "province": "Kepulauan Bangka Belitung", "corridor": "Pelabuhan Tanjung Pandan Belitung"},
    "muntok": {"coords": (-2.0667, 105.1667), "province": "Kepulauan Bangka Belitung", "corridor": "Pelabuhan Penyeberangan Tanjung Kalian Muntok"},

    # ==================== MAJOR HIGHWAY CORRIDORS & MARITIME ====================
    "jalintim": {"coords": (-2.5000, 104.5000), "province": "Sumatera", "corridor": "Jalan Lintas Timur Sumatera (Jalintim)"},
    "jalan lintas timur": {"coords": (-2.5000, 104.5000), "province": "Sumatera", "corridor": "Jalan Lintas Timur Sumatera (Jalintim)"},
    "jalinbar": {"coords": (-2.0000, 101.5000), "province": "Sumatera", "corridor": "Jalan Lintas Barat Sumatera (Jalinbar)"},
    "jalan lintas barat": {"coords": (-2.0000, 101.5000), "province": "Sumatera", "corridor": "Jalan Lintas Barat Sumatera (Jalinbar)"},
    "jalinteng": {"coords": (-1.0000, 102.0000), "province": "Sumatera", "corridor": "Jalan Lintas Tengah Sumatera (Jalinteng)"},
    "jalan lintas tengah": {"coords": (-1.0000, 102.0000), "province": "Sumatera", "corridor": "Jalan Lintas Tengah Sumatera (Jalinteng)"},
    "jalinsum": {"coords": (2.5000, 99.5000), "province": "Sumatera", "corridor": "Jalinsum Arteri Utama"},
    "jalan lintas sumatera": {"coords": (2.5000, 99.5000), "province": "Sumatera", "corridor": "Jalinsum Arteri Utama"},
    "tol trans sumatera": {"coords": (-4.5000, 105.2000), "province": "Sumatera", "corridor": "Jalan Tol Trans Sumatera (JTTS)"},
    "jtts": {"coords": (-4.5000, 105.2000), "province": "Sumatera", "corridor": "Jalan Tol Trans Sumatera (JTTS)"},
    "selat malaka": {"coords": (2.5000, 101.5000), "province": "Selat Malaka", "corridor": "Jalur Laut Selat Malaka"},
    "selat sunda": {"coords": (-5.9000, 105.8000), "province": "Selat Sunda", "corridor": "Penyeberangan Selat Sunda Bakauheni - Merak"}
}
