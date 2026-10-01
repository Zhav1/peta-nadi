import json
import os

nodes = [
    # 1. Sumatera Utara (13 nodes)
    {"id": "belawan_port", "name": "Pelabuhan Belawan", "province": "Sumatera Utara", "lat": 3.7922, "lon": 98.6776, "type": "port"},
    {"id": "medan_kim", "name": "Kawasan Industri Medan (KIM)", "province": "Sumatera Utara", "lat": 3.6700, "lon": 98.6800, "type": "hub"},
    {"id": "medan_amplas", "name": "Simpang Amplas Medan", "province": "Sumatera Utara", "lat": 3.5350, "lon": 98.7120, "type": "interchange"},
    {"id": "kualanamu_airport", "name": "Bandara Kualanamu Cargo Hub", "province": "Sumatera Utara", "lat": 3.6421, "lon": 98.8780, "type": "airport"},
    {"id": "binjai_hub", "name": "Terminal Kargo Binjai", "province": "Sumatera Utara", "lat": 3.6000, "lon": 98.4850, "type": "hub"},
    {"id": "tebing_tinggi_toll", "name": "Gerbang Tol Tebing Tinggi", "province": "Sumatera Utara", "lat": 3.3285, "lon": 99.1625, "type": "interchange"},
    {"id": "kuala_tanjung_port", "name": "Pelabuhan Kuala Tanjung", "province": "Sumatera Utara", "lat": 3.3600, "lon": 99.4500, "type": "port"},
    {"id": "pematangsiantar_hub", "name": "Hub Logistik Pematangsiantar", "province": "Sumatera Utara", "lat": 2.9600, "lon": 99.0600, "type": "city"},
    {"id": "kisaran_junction", "name": "Simpang Empat Kisaran", "province": "Sumatera Utara", "lat": 2.9800, "lon": 99.6200, "type": "interchange"},
    {"id": "rantauprapat_hub", "name": "Depot Logistik Rantauprapat", "province": "Sumatera Utara", "lat": 2.0950, "lon": 99.8300, "type": "hub"},
    {"id": "tarutung_pass", "name": "Celah Bukit Barisan Tarutung", "province": "Sumatera Utara", "lat": 2.0250, "lon": 98.9667, "type": "mountain_pass"},
    {"id": "sibolga_port", "name": "Pelabuhan Laut Sibolga", "province": "Sumatera Utara", "lat": 1.7400, "lon": 98.7800, "type": "port"},
    {"id": "padang_sidempuan_hub", "name": "Hub Padang Sidempuan", "province": "Sumatera Utara", "lat": 1.3733, "lon": 99.2733, "type": "city"},

    # 2. Aceh (6 nodes)
    {"id": "banda_aceh_hub", "name": "Pusat Distribusi Banda Aceh", "province": "Aceh", "lat": 5.5483, "lon": 95.3238, "type": "city"},
    {"id": "malahayati_port", "name": "Pelabuhan Malahayati", "province": "Aceh", "lat": 5.5897, "lon": 95.5186, "type": "port"},
    {"id": "sigli_hub", "name": "Simpang Jalinsum Sigli", "province": "Aceh", "lat": 5.3850, "lon": 95.9600, "type": "interchange"},
    {"id": "lhokseumawe_port", "name": "Pelabuhan Krueng Geukueh", "province": "Aceh", "lat": 5.1800, "lon": 97.1400, "type": "port"},
    {"id": "langsa_hub", "name": "Terminal Logistik Langsa", "province": "Aceh", "lat": 4.4700, "lon": 97.9650, "type": "hub"},
    {"id": "kuala_simpang_hub", "name": "Gerbang Perbatasan Kuala Simpang", "province": "Aceh", "lat": 4.2800, "lon": 98.0500, "type": "interchange"},

    # 3. Riau (6 nodes)
    {"id": "duri_junction", "name": "Simpang Duri Koridor Riau", "province": "Riau", "lat": 1.2700, "lon": 101.2150, "type": "interchange"},
    {"id": "dumai_port", "name": "Pelabuhan Dumai Terminal CPO", "province": "Riau", "lat": 1.6811, "lon": 101.4533, "type": "port"},
    {"id": "kandis_toll", "name": "Gerbang Tol Kandis", "province": "Riau", "lat": 0.9500, "lon": 101.2500, "type": "interchange"},
    {"id": "pekanbaru_hub", "name": "Sentra Pergudangan Pekanbaru", "province": "Riau", "lat": 0.5333, "lon": 101.4500, "type": "city"},
    {"id": "bangkinang_junction", "name": "Simpang Tol Bangkinang", "province": "Riau", "lat": 0.3367, "lon": 101.0267, "type": "interchange"},
    {"id": "rengat_hub", "name": "Hub Logistik Indragiri Rengat", "province": "Riau", "lat": -0.3700, "lon": 102.5500, "type": "hub"},

    # 4. Sumatera Barat (8 nodes)
    {"id": "pangkalan_junction", "name": "Simpang Batas Riau-Sumbar Pangkalan", "province": "Sumatera Barat", "lat": 0.0800, "lon": 100.6700, "type": "interchange"},
    {"id": "payakumbuh_junction", "name": "Hub Agribisnis Payakumbuh", "province": "Sumatera Barat", "lat": -0.2200, "lon": 100.6300, "type": "hub"},
    {"id": "bukittinggi_hub", "name": "Simpang Jam Gadang Bukittinggi", "province": "Sumatera Barat", "lat": -0.3056, "lon": 100.3692, "type": "city"},
    {"id": "padang_panjang_hub", "name": "Perlintasan Padang Panjang", "province": "Sumatera Barat", "lat": -0.4650, "lon": 100.4000, "type": "interchange"},
    {"id": "sitinjau_lauik", "name": "Celah Kritis Sitinjau Lauik", "province": "Sumatera Barat", "lat": -0.9450, "lon": 100.4850, "type": "mountain_pass"},
    {"id": "padang_teluk_bayur", "name": "Pelabuhan Teluk Bayur", "province": "Sumatera Barat", "lat": -0.9980, "lon": 100.3700, "type": "port"},
    {"id": "solok_hub", "name": "Sentra Beras Solok", "province": "Sumatera Barat", "lat": -0.7989, "lon": 100.6539, "type": "hub"},
    {"id": "dharmasraya_hub", "name": "Koridor Lintas Tengah Dharmasraya", "province": "Sumatera Barat", "lat": -1.0500, "lon": 101.6000, "type": "interchange"},

    # 5. Jambi (5 nodes)
    {"id": "muara_bungo_hub", "name": "Simpang Lintas Muara Bungo", "province": "Jambi", "lat": -1.4950, "lon": 102.1250, "type": "city"},
    {"id": "bangko_hub", "name": "Terminal Agribisnis Bangko", "province": "Jambi", "lat": -2.0650, "lon": 102.2650, "type": "hub"},
    {"id": "jambi_city_hub", "name": "Hub Pelabuhan Talang Duku Jambi", "province": "Jambi", "lat": -1.6100, "lon": 103.6150, "type": "city"},
    {"id": "muara_bulian_hub", "name": "Simpang Tiga Muara Bulian", "province": "Jambi", "lat": -1.7250, "lon": 103.2800, "type": "interchange"},
    {"id": "kuala_tungkal_port", "name": "Pelabuhan Kuala Tungkal", "province": "Jambi", "lat": -0.8167, "lon": 103.4667, "type": "port"},

    # 6. Sumatera Selatan (8 nodes)
    {"id": "lubuklinggau_hub", "name": "Hub Simpang Tiga Lubuklinggau", "province": "Sumatera Selatan", "lat": -3.2950, "lon": 102.8600, "type": "city"},
    {"id": "lahat_hub", "name": "Sentra Komoditas Lahat", "province": "Sumatera Selatan", "lat": -3.7900, "lon": 103.5400, "type": "hub"},
    {"id": "muara_enim_hub", "name": "Terminal Kargo Muara Enim", "province": "Sumatera Selatan", "lat": -3.6500, "lon": 103.7800, "type": "hub"},
    {"id": "prabumulih_junction", "name": "Simpang Tol Prabumulih", "province": "Sumatera Selatan", "lat": -3.4300, "lon": 104.2300, "type": "interchange"},
    {"id": "palembang_boom_baru", "name": "Pelabuhan Boom Baru Palembang", "province": "Sumatera Selatan", "lat": -2.9750, "lon": 104.7833, "type": "port"},
    {"id": "betung_junction", "name": "Simpang Jalintim Betung", "province": "Sumatera Selatan", "lat": -2.6000, "lon": 104.1800, "type": "interchange"},
    {"id": "kayu_agung_toll", "name": "Gerbang Tol Kayu Agung", "province": "Sumatera Selatan", "lat": -3.3900, "lon": 104.8450, "type": "interchange"},
    {"id": "baturaja_hub", "name": "Depot Distribusi Baturaja", "province": "Sumatera Selatan", "lat": -4.1300, "lon": 104.1700, "type": "city"},

    # 7. Bengkulu (4 nodes)
    {"id": "mukomuko_hub", "name": "Koridor Jalinbar Mukomuko", "province": "Bengkulu", "lat": -2.5800, "lon": 101.1200, "type": "interchange"},
    {"id": "curup_pass", "name": "Celah Bukit Daun Curup", "province": "Bengkulu", "lat": -3.4700, "lon": 102.5250, "type": "mountain_pass"},
    {"id": "bengkulu_pulau_baai", "name": "Pelabuhan Samudera Pulau Baai", "province": "Bengkulu", "lat": -3.8900, "lon": 102.2900, "type": "port"},
    {"id": "manna_hub", "name": "Terminal Agribisnis Manna", "province": "Bengkulu", "lat": -4.4750, "lon": 102.9050, "type": "hub"},

    # 8. Lampung (6 nodes)
    {"id": "liwa_pass", "name": "Perlintasan Bukit Barisan Liwa", "province": "Lampung", "lat": -5.0350, "lon": 104.0750, "type": "mountain_pass"},
    {"id": "kotabumi_hub", "name": "Simpang Jalinteng Kotabumi", "province": "Lampung", "lat": -4.8250, "lon": 104.8800, "type": "hub"},
    {"id": "terbanggi_besar_toll", "name": "Interchange Tol Terbanggi Besar", "province": "Lampung", "lat": -4.8650, "lon": 105.2150, "type": "interchange"},
    {"id": "bandar_lampung_hub", "name": "Pusat Pergudangan Bandar Lampung", "province": "Lampung", "lat": -5.4250, "lon": 105.2650, "type": "city"},
    {"id": "panjang_port", "name": "Pelabuhan Peti Kemas Panjang", "province": "Lampung", "lat": -5.4667, "lon": 105.3167, "type": "port"},
    {"id": "bakauheni_port", "name": "Pelabuhan Bakauheni Gerbang Logistik", "province": "Lampung", "lat": -5.8711, "lon": 105.7533, "type": "port"}
]

# Raw corridors between adjacent pairs (bi-directional will be created)
corridors = [
    # Aceh Spine
    ("banda_aceh_hub", "malahayati_port", 28.0, 60.0, "Jl. Malahayati", False),
    ("banda_aceh_hub", "sigli_hub", 98.0, 75.0, "Tol Sigli-Banda Aceh (Sibanceh)", True),
    ("sigli_hub", "lhokseumawe_port", 135.0, 50.0, "Jalinsum Aceh Timur", False),
    ("lhokseumawe_port", "langsa_hub", 130.0, 50.0, "Jalinsum Langsa", False),
    ("langsa_hub", "kuala_simpang_hub", 35.0, 50.0, "Jalinsum Aceh Tamiang", False),
    ("kuala_simpang_hub", "binjai_hub", 75.0, 50.0, "Jalinsum Sumut-Aceh", False),

    # Sumut Core
    ("belawan_port", "medan_kim", 12.0, 70.0, "Tol Belmera (Belawan-KIM)", True),
    ("medan_kim", "medan_amplas", 18.0, 75.0, "Tol Belmera (KIM-Amplas)", True),
    ("medan_amplas", "kualanamu_airport", 22.0, 80.0, "Tol Medan-Kualanamu (JMKT)", True),
    ("kualanamu_airport", "tebing_tinggi_toll", 42.0, 85.0, "Tol MKTT (Kualanamu-Tebing Tinggi)", True),
    ("medan_amplas", "tebing_tinggi_toll", 64.0, 80.0, "Tol MKTT Arterial", True),

    # Sumut Alternative / Bypass Detours (bypassing Medan Amplas)
    ("belawan_port", "binjai_hub", 26.0, 55.0, "Ringroad Luar Medan-Binjai", False),
    ("medan_kim", "binjai_hub", 22.0, 55.0, "Tol Medan-Binjai Connector", True),
    ("binjai_hub", "tebing_tinggi_toll", 78.0, 50.0, "Jalinsum Outer Bypass Tebing Tinggi", False),
    ("binjai_hub", "pematangsiantar_hub", 92.0, 48.0, "Jalinteng Binjai-Siantar", False),

    # Sumut-Tebing Tinggi to Coast & South
    ("tebing_tinggi_toll", "kuala_tanjung_port", 38.0, 75.0, "Tol Tebing Tinggi-Indrapura-Kuala Tanjung", True),
    ("tebing_tinggi_toll", "pematangsiantar_hub", 45.0, 70.0, "Tol Tebing Tinggi-Sinaksak (Siantar)", True),
    ("tebing_tinggi_toll", "kisaran_junction", 55.0, 80.0, "Tol Indrapura-Kisaran", True),
    ("pematangsiantar_hub", "kisaran_junction", 60.0, 45.0, "Arteri Perkebunan Siantar-Asahan", False),
    ("kisaran_junction", "rantauprapat_hub", 105.0, 50.0, "Jalintim Labuhanbatu", False),

    # Sumut Mountain & West Coast
    ("pematangsiantar_hub", "tarutung_pass", 115.0, 40.0, "Jalinteng Danau Toba-Tarutung", False),
    ("tarutung_pass", "sibolga_port", 62.0, 35.0, "Kelok Tarutung-Sibolga", False),
    ("tarutung_pass", "padang_sidempuan_hub", 85.0, 45.0, "Jalinteng Tapanuli", False),
    ("sibolga_port", "padang_sidempuan_hub", 82.0, 45.0, "Jalinbar Pantai Barat Sibolga", False),

    # Sumut to Riau
    ("rantauprapat_hub", "duri_junction", 138.0, 50.0, "Jalintim Sumut-Riau", False),
    ("padang_sidempuan_hub", "duri_junction", 185.0, 45.0, "Lanjutan Jalinteng Tapanuli-Riau", False),
    ("duri_junction", "dumai_port", 65.0, 80.0, "Tol Permai Seksi Duri-Dumai", True),
    ("duri_junction", "kandis_toll", 58.0, 85.0, "Tol Permai Seksi Kandis-Duri", True),
    ("kandis_toll", "pekanbaru_hub", 42.0, 85.0, "Tol Pekanbaru-Dumai (Permai)", True),

    # Riau Core to Sumbar
    ("pekanbaru_hub", "bangkinang_junction", 38.0, 80.0, "Tol Pekanbaru-Bangkinang", True),
    ("bangkinang_junction", "pangkalan_junction", 52.0, 45.0, "Jalinsum Riau-Sumbar", False),
    ("pangkalan_junction", "payakumbuh_junction", 40.0, 45.0, "Kelok 9 Pangkalan-Payakumbuh", False),
    ("payakumbuh_junction", "bukittinggi_hub", 32.0, 50.0, "Arteri Agam Payakumbuh-Bukittinggi", False),
    ("bukittinggi_hub", "padang_panjang_hub", 18.0, 45.0, "Jalinteng Lembah Anai", False),
    ("padang_panjang_hub", "padang_teluk_bayur", 65.0, 45.0, "Arteri Padang Panjang-Teluk Bayur", False),
    ("padang_panjang_hub", "solok_hub", 52.0, 45.0, "Arteri Danau Singkarak", False),
    ("bukittinggi_hub", "sitinjau_lauik", 72.0, 40.0, "By-pass Bukit Barisan", False),
    ("sitinjau_lauik", "padang_teluk_bayur", 25.0, 35.0, "Turunan Ekstrem Sitinjau Lauik", False),
    ("sitinjau_lauik", "solok_hub", 35.0, 35.0, "Kelok Sitinjau Lauik Solok", False),

    # Riau South to Jambi
    ("pekanbaru_hub", "rengat_hub", 145.0, 50.0, "Jalintim Pelalawan-Inhu", False),
    ("rengat_hub", "kuala_tungkal_port", 125.0, 45.0, "Arteri Pesisir Riau-Jambi", False),
    ("rengat_hub", "jambi_city_hub", 168.0, 50.0, "Jalintim Jambi-Riau", False),

    # Sumbar to Jambi
    ("solok_hub", "dharmasraya_hub", 110.0, 45.0, "Jalinsum Sawahlunto-Dharmasraya", False),
    ("dharmasraya_hub", "muara_bungo_hub", 68.0, 50.0, "Jalinsum Batas Sumbar-Jambi", False),
    ("muara_bungo_hub", "bangko_hub", 75.0, 50.0, "Jalinteng Jambi Barat", False),
    ("muara_bungo_hub", "muara_bulian_hub", 140.0, 50.0, "Jalinsum Tengah Jambi", False),
    ("muara_bulian_hub", "jambi_city_hub", 55.0, 55.0, "Arteri Batanghari Jambi", False),
    ("kuala_tungkal_port", "jambi_city_hub", 98.0, 50.0, "Arteri Tanjung Jabung Barat", False),

    # Jambi to Sumsel
    ("jambi_city_hub", "betung_junction", 195.0, 55.0, "Jalintim Jambi-Palembang", False),
    ("bangko_hub", "lubuklinggau_hub", 128.0, 50.0, "Jalinteng Jambi-Sumsel", False),
    ("betung_junction", "palembang_boom_baru", 58.0, 75.0, "Tol Kayu Agung-Palembang-Betung (Kapalbetung)", True),
    ("palembang_boom_baru", "prabumulih_junction", 65.0, 80.0, "Tol Indralaya-Prabumulih", True),
    ("palembang_boom_baru", "kayu_agung_toll", 52.0, 85.0, "Tol Kapalbetung Seksi Kayu Agung", True),

    # Sumsel Internal & to Bengkulu
    ("lubuklinggau_hub", "curup_pass", 48.0, 40.0, "Celah Bukit Barisan Curup", False),
    ("curup_pass", "bengkulu_pulau_baai", 75.0, 40.0, "Kelok Liku Sembilan Bengkulu", False),
    ("lubuklinggau_hub", "lahat_hub", 95.0, 45.0, "Jalinteng Musi Rawas-Lahat", False),
    ("lahat_hub", "muara_enim_hub", 42.0, 50.0, "Arteri Batubara Lahat-Muara Enim", False),
    ("muara_enim_hub", "prabumulih_junction", 50.0, 55.0, "Arteri Muara Enim-Prabumulih", False),
    ("lahat_hub", "baturaja_hub", 115.0, 45.0, "Jalinteng Lahat-Ogan Komering Ulu", False),
    ("prabumulih_junction", "baturaja_hub", 78.0, 50.0, "Arteri Prabumulih-Baturaja", False),

    # Bengkulu Coast
    ("padang_teluk_bayur", "mukomuko_hub", 190.0, 45.0, "Jalinbar Pesisir Selatan", False),
    ("mukomuko_hub", "bengkulu_pulau_baai", 240.0, 45.0, "Jalinbar Bengkulu Utara", False),
    ("bengkulu_pulau_baai", "manna_hub", 135.0, 45.0, "Jalinbar Bengkulu Selatan", False),

    # Bengkulu to Lampung
    ("manna_hub", "liwa_pass", 115.0, 40.0, "Jalinbar Krui-Liwa", False),
    ("liwa_pass", "kotabumi_hub", 85.0, 45.0, "Jalinteng Lampung Barat", False),

    # Sumsel to Lampung
    ("baturaja_hub", "kotabumi_hub", 98.0, 50.0, "Jalinteng Sumsel-Lampung", False),
    ("kotabumi_hub", "terbanggi_besar_toll", 52.0, 50.0, "Arteri Lintas Tengah Lampung", False),
    ("kayu_agung_toll", "terbanggi_besar_toll", 189.0, 90.0, "Tol Terbanggi Besar-Pematang Panggang-Kayu Agung (Terpeka)", True),
    ("terbanggi_besar_toll", "bandar_lampung_hub", 68.0, 85.0, "Tol Bakauheni-Terbanggi Besar (Bakter)", True),
    ("bandar_lampung_hub", "panjang_port", 15.0, 60.0, "By-pass Soekarno-Hatta Panjang", False),
    ("bandar_lampung_hub", "bakauheni_port", 82.0, 90.0, "Tol Bakter Seksi Bakauheni", True),
    ("panjang_port", "bakauheni_port", 76.0, 85.0, "Tol Bakter Akses Port Panjang", True),
]

edges = []
for u, v, dist, speed, name, is_toll in corridors:
    # Forward
    edges.append({
        "from_node": u,
        "to_node": v,
        "distance_km": dist,
        "base_speed_kmh": speed,
        "corridor_name": name,
        "is_toll": is_toll
    })
    # Reverse
    edges.append({
        "from_node": v,
        "to_node": u,
        "distance_km": dist,
        "base_speed_kmh": speed,
        "corridor_name": name,
        "is_toll": is_toll
    })

data = {
    "metadata": {
        "network_name": "Sumatra Arterial & Expressway Logistics Graph",
        "version": "2.0.0",
        "nodes_count": len(nodes),
        "edges_count": len(edges),
        "generated_at": "2026-09-23"
    },
    "nodes": nodes,
    "edges": edges
}

out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/road_network_sumatra.json"))
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

print(f"Generated {len(nodes)} nodes and {len(edges)} edges at {out_path}")
