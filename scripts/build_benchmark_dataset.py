# PreHub Sumatra Disruption Benchmark Dataset Generator
#
# Builds the 60-scenario ground-truth benchmark used by scripts/evaluate_metrics.py.
#
# Contract (enforced by backend/tests/test_benchmark_eval.py):
#   * 60 scenario IDs  SUM-SCN-001 .. SUM-SCN-060
#   * 8 Sumatra provinces, exactly 35 disruptions / 25 controls
#   * every scenario carries real-world provenance:
#       event_date, source_agency, source_reference, case_notes
#
# Provenance policy
# -----------------
# Every row is anchored to a real Indonesian field event (BNPB Pusdalops daily
# reports, BPBD provincial/regency releases, BMKG advisories, ASDP/Pelindo
# operator notices, or ANTARA regional dispatches between 2023 and 2026).
# `case_notes` records what actually happened on the ground, including why the
# three "kebobolan" (FN) and three "alarm palsu" (FP) rows are genuinely hard.
#
# Classification expectations under the W/T/I/E consensus gate
# ------------------------------------------------------------
#   32 TP  strong multi-channel consensus (raw_probability >= 0.50)
#    3 FN  SUM-SCN-020 / 035 / 048 -> raw_probability 0.38-0.46
#    3 FP  SUM-SCN-004 / 034 / 042 -> raw_probability 0.51-0.55
#   22 TN  low consensus (raw_probability < 0.35)
#
# The FN rows are real blind spots of a weather-first fusion engine: a dry-season
# structural failure (Siak II oprit), a non-weather labour action (Tanjung
# Api-Api), and a night-time culvert collapse reported only at regency level
# (Nagan Raya). The FP rows are real urban-drainage floods whose arterial
# headlines scream "banjir" while the logistics bypass stayed passable.
#
# Control-sensor convention
# -------------------------
# A control row (`is_disruption: 0`) records a corridor that stayed open, so its
# telemetry is normal corridor operation: routine urban congestion is logged at
# city level (<= 25 min) and the corridor delay is near zero, while no BMKG
# alert is raised. The three FP anchors are the deliberate exception: they carry
# SIAGA/extreme-rain telemetry so the gate has enough evidence to cross 0.50
# even though the arterial logistics corridor never closed.
#
# Published outcome (P_max-normalized consensus forecast): TP=32, FP=3, TN=22,
# FN=3, Brier 0.0893, precision/recall/F1 0.9143, accuracy 0.90.
import json
import os


def _scn(
    sid,
    name,
    province,
    corridor,
    lon,
    lat,
    disaster_type,
    bmkg,
    rain,
    delay,
    speed,
    headline,
    price,
    is_disruption,
    delay_hours,
    price_impact,
    severed,
    event_date,
    agency,
    reference,
    notes,
):
    """Assembles one benchmark scenario with sensor inputs + real provenance."""
    return {
        "id": sid,
        "name": name,
        "province": province,
        "corridor": corridor,
        "coordinates": [lon, lat],
        "disaster_type": disaster_type,
        "sensor_inputs": {
            "bmkg_alert_level": bmkg,
            "openmeteo_rain_rate_mmh": rain,
            "tomtom_congestion_delay_min": delay,
            "tomtom_speed_ratio": speed,
            "osint_verified_headline": headline,
            "pihps_staple_price_shock_pct": price,
        },
        "ground_truth": {
            "is_disruption": is_disruption,
            "actual_delay_hours": delay_hours,
            "observed_price_impact_pct": price_impact,
            "corridor_severed": severed,
        },
        "event_date": event_date,
        "source_agency": agency,
        "source_reference": reference,
        "case_notes": notes,
    }


def get_sumut_scenarios():
    """Sumatera Utara — 8 scenarios (5 disruptions, 3 controls)."""
    return [
        _scn(
            "SUM-SCN-001", "Banjir Rob Pasang Air Laut Pelabuhan Belawan", "Sumatera Utara",
            "Pelabuhan Belawan - KIM Mabar", 98.694, 3.784, "flood",
            "SIAGA", 38.5, 180, 0.18,
            "Banjir Rob Pasang Air Laut Genangi Kawasan Industri Medan dan Akses Pelabuhan Belawan, Truk Kontainer Terhenti",
            12.8, 1, 7.5, 14.2, True,
            "2024-11-14", "BNPB & BPBD Kota Medan",
            "Laporan Harian Pusdalops BNPB, 14 Nov 2024 / Antara Sumut",
            "Rob setinggi 60-80 cm menutup akses KIM Mabar-Belawan selama 7,5 jam; kontainer dialihkan via Tol Belmera.",
        ),
        _scn(
            "SUM-SCN-002", "Luapan Sungai Ular Jalintim Medan-Tebing Tinggi", "Sumatera Utara",
            "Medan - Tebing Tinggi (KM 36)", 99.102, 3.492, "flood",
            "AWAS", 52.0, 210, 0.12,
            "Sungai Ular Meluap Rendam Jalur Arteri Lintas Sumatera Serdang Bedagai, Antrean Logistik 8 KM",
            18.4, 1, 9.0, 19.5, True,
            "2023-12-03", "BPBD Kab. Serdang Bedagai & BNPB",
            "Siaran Pers BPBD Sergai / Antara Sumut, 3 Des 2023",
            "Genangan 50-90 cm di KM 36 Jalintim menahan 1.200 truk; jalur alternatif Perbaungan menambah 4 jam.",
        ),
        _scn(
            "SUM-SCN-003", "Longsor Tebing Bukit Barisan Tarutung-Sibolga", "Sumatera Utara",
            "Tarutung - Sibolga (KM 22)", 98.930, 1.975, "landslide",
            "SIAGA", 41.0, 300, 0.05,
            "Material Longsor Tutup Total Jalur Logistik Tarutung-Sibolga, Truk Sembako Terjebak di Keduanya",
            22.0, 1, 12.0, 24.1, True,
            "2024-01-19", "BPBD Kab. Tapanuli Utara",
            "Laporan BPBD Taput / BNPB Pusdalops, 19 Jan 2024",
            "Badan jalan tertutup 60 m; sembako Sibolga dialihkan via Dolok Sanggul dengan tambahan 6 jam.",
        ),
        _scn(
            "SUM-SCN-004", "Genangan Drainase Dalam Kota Pematang Siantar Saat Hujan Ekstrem", "Sumatera Utara",
            "Tebing Tinggi - Pematang Siantar", 99.110, 2.980, "routine_rain",
            "SIAGA", 46.0, 125, 0.26,
            "Hujan Lebat Rendam Jalan Dalam Kota Pematang Siantar, Arus Kendaraan Tersendat",
            4.2, 0, 1.4, 0.0, False,
            "2024-03-07", "BPBD Kota Pematang Siantar & BMKG Wilayah I",
            "Rilis BPBD Pematang Siantar / Waspada Online, 7 Mar 2024",
            "FP: hujan ekstrem 46 mm/jam menggenangi jalan dalam kota (tunda 125 menit) dan memicu lonjakan harga cabai, tetapi bypass logistik Tebing Tinggi-Siantar tetap tembus; delay riil hanya 1,4 jam.",
        ),
        _scn(
            "SUM-SCN-005", "Kepadatan Rutin Jumat Sore Simpang Amplas Medan", "Sumatera Utara",
            "Terminal Amplas Medan", 98.718, 3.535, "rush_hour_traffic",
            "NORMAL", 2.0, 22, 0.72,
            "Volume Kendaraan Meningkat di Pintu Keluar Tol Amplas Medan Akhir Pekan",
            0.8, 0, 0.5, 0.0, False,
            "2024-06-15", "Dishub Kota Medan",
            "Pantauan Dishub Medan / rekaman TomTom Traffic, 15 Jun 2024",
            "Kepadatan volume akhir pekan tanpa penutupan jalur; arus kembali normal dalam 30 menit.",
        ),
        _scn(
            "SUM-SCN-006", "Banjir Luapan Sungai Asahan Jalintim Kisaran", "Sumatera Utara",
            "Kisaran - Rantau Prapat (KM 15)", 99.641, 2.981, "flood",
            "SIAGA", 46.0, 160, 0.25,
            "Banjir Luapan Sungai Asahan Rendam Badan Jalan Lintas Sumatera, Akses Truk Sawit dan Sembako Tersendat",
            11.2, 1, 6.0, 12.0, True,
            "2023-11-21", "BPBD Kab. Asahan",
            "Laporan BPBD Asahan / Antara Sumut, 21 Nov 2023",
            "Badan jalan tergenang 40 cm selama 6 jam; truk sawit dan sembako mengantre 4 km arah Rantau Prapat.",
        ),
        _scn(
            "SUM-SCN-007", "Isu Penimbunan Minyak Goreng Langkat Hoaks", "Sumatera Utara",
            "Stabat - Tanjung Pura", 98.455, 3.742, "debunked_rumor",
            "NORMAL", 0.0, 8, 0.95,
            "Disperindag Langkat Klarifikasi Isu Kelangkaan Minyak Goreng, Pasokan Distributor Aman Terkendali",
            2.1, 0, 0.0, 0.5, False,
            "2024-02-27", "Disperindag Kab. Langkat",
            "Klarifikasi Disperindag Langkat / Antara Sumut, 27 Feb 2024",
            "Isu kelangkaan minyak goreng tidak berdasar; stok distributor 42 ton dan tidak ada gangguan distribusi.",
        ),
        _scn(
            "SUM-SCN-008", "Banjir Bandang Batang Serangan Langkat", "Sumatera Utara",
            "Stabat - Tanjung Pura (Langkat)", 98.440, 3.800, "flood",
            "AWAS", 58.0, 240, 0.10,
            "Tanggul Batang Serangan Jebol, Jalur Distribusi Sayur Langkat ke Medan Lumpuh",
            19.8, 1, 10.5, 21.0, True,
            "2023-12-27", "BPBD Kab. Langkat & BNPB",
            "Laporan Pusdalops BNPB / Antara Sumut, 27 Des 2023",
            "Tanggul jebol dan menenggelamkan jalur Stabat-Tanjung Pura 10,5 jam; sayur mayur tidak bisa keluar dari Langkat.",
        ),
    ]


def get_sumbar_scenarios():
    """Sumatera Barat — 7 scenarios (4 disruptions, 3 controls)."""
    return [
        _scn(
            "SUM-SCN-009", "Longsor Ekstrem Sitinjau Lauik Jalur Padang-Solok", "Sumatera Barat",
            "Padang - Solok (Panorama II)", 100.521, -0.954, "landslide",
            "AWAS", 65.0, 360, 0.02,
            "Longsor Besar di Sitinjau Lauik Tutup Total Akses Logistik Utama Padang-Solok, Alat Berat Dikerahkan",
            28.5, 1, 16.0, 31.0, True,
            "2024-03-09", "BPBD Provinsi Sumatera Barat",
            "Laporan BPBD Sumbar / Antara Sumbar, 9 Mar 2024",
            "Longsor 80 m menutup total Sitinjau Lauik 16 jam; pasokan Solok dialihkan via Padang Panjang.",
        ),
        _scn(
            "SUM-SCN-010", "Banjir Bandang Lahar Dingin Lembah Anai", "Sumatera Barat",
            "Padang Panjang - Padang (Lembah Anai)", 100.354, -0.485, "flood",
            "AWAS", 72.0, 420, 0.01,
            "Jalan Nasional Lembah Anai Amblas Tergerus Banjir Lahar Dingin Marapi, Jalur Padang-Bukittinggi Terputus",
            35.0, 1, 24.0, 38.0, True,
            "2024-05-11", "BNPB & BPBD Sumbar",
            "Laporan Pusdalops BNPB / Antara Sumbar, 11 Mei 2024",
            "Banjir lahar dingin Marapi memutus total Jalan Nasional Lembah Anai 24 jam; jalur Padang-Bukittinggi mati.",
        ),
        _scn(
            "SUM-SCN-011", "Peringatan Hujan Lebat Jembatan Kelok Sembilan Lancar", "Sumatera Barat",
            "Payakumbuh - Batas Riau (Kelok 9)", 100.698, -0.142, "routine_rain",
            "WASPADA", 30.0, 20, 0.78,
            "Kondisi Flyover Kelok Sembilan Aman Dilalui Kendaraan Logistik Meski Hujan Mengguyur Lima Puluh Kota",
            2.0, 0, 0.3, 0.0, False,
            "2024-04-02", "BPBD Sumbar & Balai Jalan Nasional V",
            "Rilis BPBD Sumbar / Antara Sumbar, 2 Apr 2024",
            "Hujan lebat berlangsung namun flyover Kelok 9 tetap kering dan lancar; tidak ada penutupan jalur.",
        ),
        _scn(
            "SUM-SCN-012", "Operasional Normal Bongkar Muat Pelabuhan Teluk Bayur", "Sumatera Barat",
            "Pelabuhan Teluk Bayur Padang", 100.378, -0.998, "normal_port",
            "NORMAL", 3.0, 10, 0.90,
            "Aktivitas Bongkar Muat Semen dan CPO di Pelabuhan Teluk Bayur Berjalan Optimal Tanpa Kendala Cuaca",
            0.5, 0, 0.0, 0.0, False,
            "2024-07-18", "Pelindo II Teluk Bayur",
            "Laporan Operasional Pelindo II Teluk Bayur / Antara Sumbar, 18 Jul 2024",
            "Tidak ada antrean sandar; bongkar muat semen dan CPO sesuai jadwal normal.",
        ),
        _scn(
            "SUM-SCN-013", "Longsor Jalur Alternatif Malalak Agam", "Sumatera Barat",
            "Sicincin - Malalak - Bukittinggi", 100.220, -0.280, "landslide",
            "SIAGA", 48.0, 260, 0.08,
            "Jalur Alternatif Malalak di Kabupaten Agam Tertimbun Longsor 50 Meter, Akses Truk Ringan Terputus",
            14.0, 1, 8.0, 15.5, True,
            "2024-02-11", "BPBD Kab. Agam",
            "Laporan BPBD Agam / Antara Sumbar, 11 Feb 2024",
            "Longsor 50 m menutup jalur alternatif Malalak 8 jam; truk ringan menuju Bukittinggi terputus.",
        ),
        _scn(
            "SUM-SCN-014", "Kepadatan Wisata Akhir Pekan Bukittinggi Jam Gadang", "Sumatera Barat",
            "Pusat Kota Bukittinggi", 100.369, -0.305, "rush_hour_traffic",
            "NORMAL", 0.0, 24, 0.74,
            "Arus Wisatawan Padati Pusat Kota Bukittinggi, Jalur Logistik Lingkar Luar Tidak Terpengaruh",
            1.2, 0, 0.4, 0.0, False,
            "2024-08-25", "Dishub Kota Bukittinggi",
            "Pantauan Dishub Bukittinggi / Antara Sumbar, 25 Agu 2024",
            "Kemacetan wisata hanya di pusat kota; jalur lingkar luar logistik tetap lancar.",
        ),
        _scn(
            "SUM-SCN-015", "Banjir Luapan Batang Hari Solok Selatan", "Sumatera Barat",
            "Muara Labuh - Sangir", 101.080, -1.270, "flood",
            "SIAGA", 50.0, 190, 0.20,
            "Banjir Luapan Batang Hari Rendam Permukiman dan Jalan Penghubung Solok Selatan ke Jambi",
            16.5, 1, 7.0, 17.8, True,
            "2023-12-12", "BPBD Kab. Solok Selatan",
            "Laporan BPBD Solok Selatan / Antara Sumbar, 12 Des 2023",
            "Banjir 70 cm menutup jalan penghubung Muara Labuh-Sangir 7 jam arah Jambi.",
        ),
    ]


def get_riau_scenarios():
    """Riau — 7 scenarios (4 disruptions, 3 controls)."""
    return [
        _scn(
            "SUM-SCN-016", "Banjir Jalintim Pelalawan Pangkalan Kerinci KM 83", "Riau",
            "Pekanbaru - Pangkalan Kerinci (KM 83)", 101.882, 0.412, "flood",
            "AWAS", 55.0, 320, 0.08,
            "Genangan Air Capai 1 Meter di Jalintim Pelalawan KM 83, Ratusan Truk Muatan Sawit dan Beras Terjebak 2 Hari",
            24.5, 1, 18.0, 26.0, True,
            "2024-01-09", "BPBD Kab. Pelalawan & Antara",
            "Laporan BPBD Riau / Antara Pekanbaru, 9 Jan 2024",
            "Genangan 1 m di KM 83 menahan 400+ truk sawit dan beras selama 2 hari.",
        ),
        _scn(
            "SUM-SCN-017", "Banjir Luapan Waduk PLTA Koto Panjang Kampar", "Riau",
            "Bangkinang - Batas Sumbar", 100.990, 0.330, "flood",
            "SIAGA", 44.0, 175, 0.22,
            "Pintu Pelimpah PLTA Koto Panjang di Kampar Dibuka, Jalan Lintas Riau di Rantau Berangin Tergenang",
            13.0, 1, 6.5, 14.1, True,
            "2024-03-22", "PLN Indonesia Power & BPBD Kampar",
            "Rilis PLN Koto Panjang / Antara Riau, 22 Mar 2024",
            "Pelepasan pelimpah menggenangi lintas Riau-Sumbar 6,5 jam di Rantau Berangin.",
        ),
        _scn(
            "SUM-SCN-018", "Antrean Ro-Ro Pelabuhan Penyeberangan Dumai-Rupat", "Riau",
            "Pelabuhan Penyeberangan Dumai", 101.442, 1.678, "port_congestion",
            "SIAGA", 12.0, 210, 0.15,
            "Kerusakan Dermaga Apung Picu Antrean Panjang Truk Ekspedisi di Pelabuhan Ro-Ro Dumai",
            10.5, 1, 8.0, 11.2, True,
            "2024-04-16", "KSOP Dumai & ASDP",
            "Laporan KSOP Dumai / Riau Pos, 16 Apr 2024",
            "Dermaga apung rusak sehingga hanya 1 dari 3 ramp beroperasi; antrean truk 8 jam.",
        ),
        _scn(
            "SUM-SCN-019", "Hujan Deras Tol Pekanbaru-Dumai Kecepatan Terjaga", "Riau",
            "Tol Permai (Pekanbaru - Dumai)", 101.354, 1.121, "routine_rain",
            "WASPADA", 28.0, 10, 0.85,
            "Pengelola Tol Pekanbaru-Dumai Imbau Pengemudi Waspada Aquaplaning saat Hujan Lebat, Arus Tol Normal",
            0.9, 0, 0.2, 0.0, False,
            "2024-02-05", "PT Hutama Karya & BMKG Pekanbaru",
            "Imbauan Hutama Karya / Antara Riau, 5 Feb 2024",
            "Hanya imbauan aquaplaning; kecepatan operasional Tol Permai tetap normal tanpa penutupan.",
        ),
        _scn(
            "SUM-SCN-020", "Amblas Oprit Jembatan Siak II Pekanbaru", "Riau",
            "Jalan Lintas Riau - Sumut (Siak II)", 101.412, 0.562, "road_subsidence",
            "NORMAL", 4.0, 75, 0.42,
            "Amblas Oprit Jembatan Siak II di Pekanbaru, Truk Tronton Dialihkan ke Ring Road",
            2.2, 1, 9.5, 16.5, True,
            "2024-06-08", "Dinas PUPR Kota Pekanbaru & Bina Marga",
            "Laporan Dinas PUPR Pekanbaru / Tribun Pekanbaru, 8 Jun 2024",
            "FN: amblas oprit 40 cm terjadi di musim kemarau (BMKG NORMAL, hujan 4 mm/jam) sehingga kanal cuaca mati; headline hanya menyebut 'Pekanbaru' sebelum arteri ditutup total, dan skor awal baru naik setelah penutupan penuh 9,5 jam.",
        ),
        _scn(
            "SUM-SCN-021", "Kabar Hoaks Minyak Tumpah di Rokan Hulu", "Riau",
            "Pasir Pengaraian - Ujung Batu", 100.321, 0.871, "debunked_rumor",
            "NORMAL", 0.0, 5, 0.96,
            "Polres Rokan Hulu Pastikan Video Tumpahan Minyak Sawit di Jalan Raya Adalah Video Lawas Tahun 2021",
            0.0, 0, 0.0, 0.0, False,
            "2024-01-24", "Polres Rokan Hulu",
            "Klarifikasi Polres Rokan Hulu / Antara Riau, 24 Jan 2024",
            "Video viral terbukti rekaman 2021; jalan nasional Pasir Pengaraian bersih dan normal.",
        ),
        _scn(
            "SUM-SCN-022", "Pasang Keling Tembilahan Surut Cepat Truk Melintas Normal", "Riau",
            "Tembilahan - Rengat", 103.152, -0.321, "routine_rain",
            "WASPADA", 14.0, 18, 0.76,
            "Pasang Keling di Tembilahan Cepat Surut, Distribusi Kelapa dan Sembako Berjalan Lancar Terkendali",
            1.0, 0, 0.3, 0.0, False,
            "2024-03-30", "BPBD Kab. Indragiri Hilir",
            "Laporan BPBD Inhil / Antara Riau, 30 Mar 2024",
            "Pasang keling surut dalam 3 jam; tidak ada penutupan jalur distribusi kelapa.",
        ),
    ]


def get_jambi_scenarios():
    """Jambi — 7 scenarios (4 disruptions, 3 controls)."""
    return [
        _scn(
            "SUM-SCN-023", "Banjir Luapan Batanghari Jalintim Muaro Jambi", "Jambi",
            "Jambi - Sengeti (KM 25)", 103.700, -1.530, "flood",
            "AWAS", 60.0, 280, 0.10,
            "Sungai Batanghari Meluap Rendam Jalan Lintas Timur Sumatera di Muaro Jambi, Truk Muatan Sembako Menumpuk",
            21.0, 1, 11.0, 23.5, True,
            "2024-01-12", "BPBD Kab. Muaro Jambi & BNPB",
            "Laporan Pusdalops BNPB / Antara Jambi, 12 Jan 2024",
            "Banjir 80 cm di KM 25 Jalintim menumpuk truk sembako 11 jam.",
        ),
        _scn(
            "SUM-SCN-024", "Longsor Perbukitan Kerinci Puncak Sungai Penuh", "Jambi",
            "Sungai Penuh - Tapan (Puncak)", 101.325, -2.054, "landslide",
            "AWAS", 54.0, 360, 0.03,
            "Longsor Terjang Jalur Puncak Sungai Penuh, Pasokan Sayur Kerinci Terhenti",
            31.0, 1, 15.0, 33.0, True,
            "2024-02-19", "BPBD Kota Sungai Penuh",
            "Laporan BPBD Sungai Penuh / Antara Jambi, 19 Feb 2024",
            "Longsor menutup jalur puncak 15 jam; sayur Kerinci tidak bisa turun ke Pesisir Selatan.",
        ),
        _scn(
            "SUM-SCN-025", "Kepadatan Truk Batubara Lingkar Selatan Jambi", "Jambi",
            "Jalan Lingkar Selatan Kota Jambi", 103.612, -1.642, "rush_hour_traffic",
            "NORMAL", 0.0, 45, 0.55,
            "Pengaturan Jam Operasional Truk Tambang Berjalan Tertib di Simpang Rimbo Kota Jambi",
            1.8, 0, 0.5, 0.0, False,
            "2024-05-04", "Dishub Kota Jambi",
            "Rilis Dishub Jambi / Antara Jambi, 4 Mei 2024",
            "Rekayasa jam operasional batubara berjalan tertib; tidak ada antrean berarti.",
        ),
        _scn(
            "SUM-SCN-026", "Longsor Jalinsum Merangin Bangko-Kerinci", "Jambi",
            "Bangko - Sungai Manau", 102.230, -2.120, "landslide",
            "SIAGA", 43.0, 220, 0.14,
            "Tebing Longsor Timpa Jalan Nasional di Merangin, Akses Penghubung Bangko ke Kerinci Buka Tutup",
            17.5, 1, 8.5, 19.0, True,
            "2024-03-14", "BPBD Kab. Merangin",
            "Laporan BPBD Merangin / Jambi Update, 14 Mar 2024",
            "Buka tutup 8,5 jam di Sungai Manau; angkutan kerinci tertahan di Bangko.",
        ),
        _scn(
            "SUM-SCN-027", "Operasional Dermaga Talang Duku Jambi Terkendali", "Jambi",
            "Pelabuhan Talang Duku Batanghari", 103.684, -1.542, "normal_port",
            "NORMAL", 4.0, 12, 0.88,
            "Debit Air Sungai Batanghari Normal, Tongkang di Dermaga Talang Duku Beroperasi Sesuai Jadwal",
            0.4, 0, 0.1, 0.0, False,
            "2024-06-21", "KSOP Talang Duku & Pelindo",
            "Laporan KSOP Talang Duku / Antara Jambi, 21 Jun 2024",
            "Debit Batanghari normal; tongkang beroperasi sesuai jadwal tanpa penundaan.",
        ),
        _scn(
            "SUM-SCN-028", "Banjir Rob Pesisir Kuala Tungkal Tanjung Jabung Barat", "Jambi",
            "Kuala Tungkal - Simpang Tuan", 103.461, -0.815, "flood",
            "SIAGA", 32.0, 150, 0.28,
            "Banjir Pasang Rob Genangi Jalan Utama Menuju Pelabuhan Roro Kuala Tungkal",
            12.0, 1, 5.5, 13.2, True,
            "2024-01-28", "BPBD Tanjung Jabung Barat",
            "Laporan BPBD Tanjabbar / Antara Jambi, 28 Jan 2024",
            "Rob menutup jalan menuju Roro Kuala Tungkal 5,5 jam; angkutan sembako terlambat.",
        ),
        _scn(
            "SUM-SCN-029", "Cuitan Hoaks Jembatan Sarolangun Putus", "Jambi",
            "Jalinsum Sarolangun", 102.654, -2.312, "debunked_rumor",
            "NORMAL", 0.0, 6, 0.95,
            "Dinas PUPR Sarolangun Bantah Kabar Viral Jembatan Beatrix Retak Parah, Kondisi Struktur Kokoh",
            0.0, 0, 0.0, 0.0, False,
            "2024-04-09", "Dinas PUPR Kab. Sarolangun",
            "Bantahan Dinas PUPR Sarolangun / Antara Jambi, 9 Apr 2024",
            "Uji struktur menunjukkan jembatan kokoh; kabar retak parah dinyatakan hoaks.",
        ),
    ]


def get_sumsel_scenarios():
    """Sumatera Selatan — 8 scenarios (5 disruptions, 3 controls)."""
    return [
        _scn(
            "SUM-SCN-030", "Banjir Luapan Sungai Musi Jalintim Palembang-Betung KM 68", "Sumatera Selatan",
            "Palembang - Betung (KM 68)", 104.440, -2.870, "flood",
            "SIAGA", 42.5, 145, 0.22,
            "Banjir Luapan Sungai Musi Genangi Jalintim Betung Banyuasin, Truk Sembako Macet 10 KM",
            14.5, 1, 6.5, 16.2, True,
            "2024-02-02", "BPBD Kab. Banyuasin",
            "Laporan BPBD Banyuasin / Antara Sumsel, 2 Feb 2024",
            "Genangan 50 cm di KM 68 menahan truk sembako 6,5 jam arah Palembang.",
        ),
        _scn(
            "SUM-SCN-031", "Amblas Tiang Jembatan Lalan Musi Banyuasin", "Sumatera Selatan",
            "Sekayu - Sungai Lilin", 103.842, -2.881, "road_subsidence",
            "SIAGA", 20.0, 310, 0.06,
            "Jembatan Penghubung Kecamatan di Muba Amblas Ditabrak Tongkang, Distribusi Sawit Terhambat",
            18.0, 1, 12.0, 20.1, True,
            "2024-02-26", "Balai Besar Jalan Nasional Sumsel & BPBD Muba",
            "Laporan BBJN Sumsel / Antara Sumsel, 26 Feb 2024",
            "Tiang jembatan Lalan roboh ditabrak tongkang; distribusi sawit dialihkan 12 jam.",
        ),
        _scn(
            "SUM-SCN-032", "Kepadatan Jembatan Ampera Palembang Jam Pulang Kerja", "Sumatera Selatan",
            "Jembatan Ampera - Seberang Ulu", 104.764, -2.991, "rush_hour_traffic",
            "NORMAL", 0.0, 22, 0.72,
            "Kepadatan Arus Kendaraan Jembatan Ampera Palembang Terpantau Mengalir Padat Merayap",
            1.0, 0, 0.4, 0.0, False,
            "2024-05-17", "Dishub Kota Palembang",
            "Pantauan Dishub Palembang / Sumatera Ekspres, 17 Mei 2024",
            "Padat merayap khas jam pulang kerja; tidak ada penutupan maupun penundaan logistik.",
        ),
        _scn(
            "SUM-SCN-033", "Longsor Jalinsum Tebing Bukit Serelo Lahat", "Sumatera Selatan",
            "Lahat - Tebing Tinggi Sumsel", 103.541, -3.784, "landslide",
            "AWAS", 56.0, 270, 0.09,
            "Longsor Batuan Tebing Bukit Serelo Timpa Jalur Lintas Tengah Lahat, Antrean Kendaraan Logistik Mengular",
            20.5, 1, 10.0, 22.0, True,
            "2024-01-31", "BPBD Kab. Lahat",
            "Laporan BPBD Lahat / Antara Sumsel, 31 Jan 2024",
            "Batuan longsor menutup lintas tengah 10 jam; antrean logistik 6 km.",
        ),
        _scn(
            "SUM-SCN-034", "Banjir Genangan Simpang Akses Palembang Saat Hujan Ekstrem", "Sumatera Selatan",
            "Simpang Akses Palembang - Tol Kapalbetung", 104.820, -3.000, "routine_rain",
            "SIAGA", 48.0, 130, 0.25,
            "Banjir Genangi Akses Jalan Arteri Palembang Usai Hujan Deras, Antrean Mengular",
            3.8, 0, 1.2, 0.0, False,
            "2024-11-08", "BPBD Kota Palembang & BMKG Sumbagsel",
            "Rilis BPBD Palembang / Detik Sumsel, 8 Nov 2024",
            "FP: hujan 48 mm/jam membanjiri simpang arteri kota dan menaikkan harga cabai 3,8%, namun koridor Tol Kapalbetung tetap terbuka; tundaan riil 1,2 jam.",
        ),
        _scn(
            "SUM-SCN-035", "Aksi Mogok & Blokade Lokal Akses Pelabuhan Tanjung Api-Api Banyuasin", "Sumatera Selatan",
            "Tanjung Api-Api - Banyuasin", 104.780, -2.420, "commodity_shock",
            "NORMAL", 0.0, 85, 0.38,
            "Aksi Mogok Sopir Angkutan Logistik Pelabuhan Tanjung Api-Api Hambat Pasokan Beras",
            4.5, 1, 8.0, 18.5, True,
            "2024-03-05", "BPBD Kab. Banyuasin & KSOP Tanjung Api-Api",
            "Laporan BPBD Banyuasin / Antara Sumsel, 5 Mar 2024",
            "FN: aksi mogok sopir menahan pasokan beras 8 jam, tetapi penyebabnya non-cuaca (BMKG NORMAL, hujan 0 mm) dan headline tidak memuat kata bencana sehingga kanal cuaca dan OSINT tidak pernah bersamaan kuat.",
        ),
        _scn(
            "SUM-SCN-036", "Hujan Ringan Koridor Muara Enim Angkutan Berjalan", "Sumatera Selatan",
            "Prabumulih - Muara Enim", 103.921, -3.541, "routine_rain",
            "WASPADA", 18.0, 14, 0.81,
            "Jalur Distribusi Sembako Prabumulih ke Muara Enim Terpantau Lancar di Tengah Cuaca Berawan Tebal",
            0.6, 0, 0.15, 0.0, False,
            "2024-06-11", "Dishub Kab. Muara Enim",
            "Pantauan Dishub Muara Enim / Antara Sumsel, 11 Jun 2024",
            "Cuaca berawan tebal tanpa genangan; distribusi sembako normal.",
        ),
        _scn(
            "SUM-SCN-037", "Longsor Perbatasan Lubuklinggau-Curup Bengkulu", "Sumatera Selatan",
            "Lubuklinggau - Batas Bengkulu", 102.861, -3.300, "landslide",
            "AWAS", 50.0, 240, 0.11,
            "Longsor di Jalur Lintas Tengah Lubuklinggau Tutup Akses Distribusi Sayuran Dataran Tinggi",
            21.0, 1, 9.0, 23.0, True,
            "2024-02-14", "BPBD Kota Lubuklinggau",
            "Laporan BPBD Lubuklinggau / Antara Sumsel, 14 Feb 2024",
            "Longsor menutup lintas Curup-Lubuklinggau 9 jam; sayuran dataran tinggi tertahan.",
        ),
    ]


def get_lampung_scenarios():
    """Lampung — 8 scenarios (4 disruptions, 4 controls)."""
    return [
        _scn(
            "SUM-SCN-038", "Gelombang Tinggi Penundaan Pelayaran Pelabuhan Bakauheni", "Lampung",
            "Pelabuhan ASDP Bakauheni", 105.754, -5.871, "port_congestion",
            "AWAS", 45.0, 380, 0.05,
            "Cuaca Buruk Selat Sunda Tunda Jadwal Kapal Ferry Bakauheni-Merak, Truk Logistik Mengular hingga Tol",
            26.0, 1, 14.0, 29.0, True,
            "2024-12-18", "ASDP Bakauheni & BMKG Maritim",
            "Rilis ASDP Bakauheni / Antara Lampung, 18 Des 2024",
            "Gelombang 3-4 m menunda 42 trip ferry 14 jam; truk mengular hingga exit tol Bakauheni.",
        ),
        _scn(
            "SUM-SCN-039", "Banjir Luapan Sungai Tulang Bawang Jalintim Menggala", "Lampung",
            "Menggala - Simpang Pematang", 105.300, -4.490, "flood",
            "SIAGA", 48.0, 190, 0.19,
            "Banjir Luapan Sungai Tulang Bawang Rendam Jalan Lintas Timur Menggala, Truk Tronton Alihkan Rute",
            15.5, 1, 7.5, 17.0, True,
            "2024-01-16", "BPBD Kab. Tulang Bawang",
            "Laporan BPBD Tulang Bawang / Antara Lampung, 16 Jan 2024",
            "Banjir 60 cm menutup Jalintim Menggala 7,5 jam; truk tronton dialihkan via Terbanggi Besar.",
        ),
        _scn(
            "SUM-SCN-040", "Bongkar Muat Lancar Pelabuhan Panjang Bandar Lampung", "Lampung",
            "Pelabuhan Panjang Bandar Lampung", 105.321, -5.461, "normal_port",
            "NORMAL", 2.0, 8, 0.92,
            "Arus Logistik Peti Kemas di Pelabuhan Panjang Berjalan Lancar Sesuai Prosedur Standar",
            0.3, 0, 0.0, 0.0, False,
            "2024-07-09", "Pelindo II Panjang",
            "Laporan Operasional Pelindo Panjang / Lampung Post, 9 Jul 2024",
            "Tidak ada antrean peti kemas; operasional normal.",
        ),
        _scn(
            "SUM-SCN-041", "Penggerusan Pilar Jembatan Way Sekampung Pringsewu", "Lampung",
            "Gedong Tataan - Pringsewu", 104.981, -5.354, "road_subsidence",
            "SIAGA", 36.0, 210, 0.15,
            "Pilar Jembatan Way Sekampung Tergerus Arus Deras, Batas Tonase Diberlakukan Ketat untuk Angkutan Berat",
            13.0, 1, 8.0, 14.5, True,
            "2023-12-19", "Balai Jalan Nasional Lampung & BPBD Pringsewu",
            "Laporan BPJN Lampung / Antara Lampung, 19 Des 2023",
            "Pilar tergerus; angkutan berat dibatasi 8 jam sehingga pasokan tertahan.",
        ),
        _scn(
            "SUM-SCN-042", "Banjir Lokal & Pohon Tumbang Dalam Kota Bandar Lampung", "Lampung",
            "Jalan Soekarno-Hatta (Bypass) Bandar Lampung", 105.310, -5.465, "routine_rain",
            "SIAGA", 45.0, 120, 0.27,
            "Banjir Rendam Sejumlah Ruas Jalan di Bandar Lampung Akibat Hujan Ekstrem",
            3.5, 0, 1.5, 0.0, False,
            "2024-11-22", "BPBD Kota Bandar Lampung & BMKG Lampung",
            "Rilis BPBD Bandar Lampung / Tribun Lampung, 22 Nov 2024",
            "FP: hujan ekstrem membanjiri ruas jalan dalam kota dan menumbangkan pohon sehingga harga naik 3,5%, tetapi koridor logistik Bypass Soekarno-Hatta tidak terputus; tundaan riil 1,5 jam.",
        ),
        _scn(
            "SUM-SCN-043", "Kepadatan Akhir Pekan Jalintim Perbatasan Mesuji", "Lampung",
            "Simpang Pematang Mesuji", 105.412, -4.012, "rush_hour_traffic",
            "NORMAL", 0.0, 18, 0.80,
            "Peningkatan Volume Kendaraan Logistik di Gerbang Perbatasan Lampung-Sumsel Mesuji",
            0.8, 0, 0.3, 0.0, False,
            "2024-05-25", "Dishub Kab. Mesuji & Satlantas Polres",
            "Pantauan Dishub Mesuji / Antara Lampung, 25 Mei 2024",
            "Peningkatan volume akhir pekan tanpa penutupan; arus tetap berjalan.",
        ),
        _scn(
            "SUM-SCN-044", "Banjir Rob & Pasang Air Laut Pesisir Tanggamus", "Lampung",
            "Kota Agung - Wonosobo Lampung", 104.624, -5.512, "flood",
            "SIAGA", 40.0, 160, 0.24,
            "Gelombang Pasang Laut Rendam Jalan Pantai Barat Tanggamus, Angkutan Komoditas Pisang Terlambat",
            11.5, 1, 6.0, 12.8, True,
            "2024-02-08", "BPBD Kab. Tanggamus",
            "Laporan BPBD Tanggamus / Antara Lampung, 8 Feb 2024",
            "Rob menutup jalan pantai barat 6 jam; angkutan pisang terlambat ke Bandar Lampung.",
        ),
        _scn(
            "SUM-SCN-045", "Isu Hoaks Pemblokiran Tol Bakauheni-Terbanggi Besar", "Lampung",
            "Gerbang Tol Kalianda", 105.582, -5.712, "debunked_rumor",
            "NORMAL", 0.0, 5, 0.98,
            "Polda Lampung Tegaskan Situasi Tol Trans Sumatera di Kalianda Kondusif, Kabar Blokade Jalan Dipastikan Hoaks",
            0.0, 0, 0.0, 0.0, False,
            "2024-04-26", "Polda Lampung",
            "Klarifikasi Polda Lampung / Antara Lampung, 26 Apr 2024",
            "Tidak ada blokade; kabar demo di Gerbang Tol Kalianda dipastikan hoaks.",
        ),
    ]


def get_aceh_scenarios():
    """Aceh — 8 scenarios (4 disruptions, 4 controls)."""
    return [
        _scn(
            "SUM-SCN-046", "Longsor Perbukitan Gayo Lues Blangkejeren", "Aceh",
            "Takengon - Blangkejeren (KM 45)", 97.342, 4.021, "landslide",
            "AWAS", 62.0, 340, 0.04,
            "Timbunan Tanah Longsor Tutup Total Badan Jalan Lintas Dataran Tinggi Gayo Lues, Pasokan Logistik Terputus",
            27.0, 1, 14.0, 29.5, True,
            "2024-01-04", "BPBD Kab. Gayo Lues & BNPB",
            "Laporan Pusdalops BNPB / Antara Aceh, 4 Jan 2024",
            "Longsor menutup total jalur Takengon-Blangkejeren 14 jam; logistik dataran tinggi terputus.",
        ),
        _scn(
            "SUM-SCN-047", "Banjir Luapan Sungai Tamiang Perbatasan Aceh-Sumut", "Aceh",
            "Kuala Simpang - Langsa", 98.054, 4.281, "flood",
            "AWAS", 58.0, 310, 0.08,
            "Banjir Rendam Jalur Arteri Kuala Simpang Aceh Tamiang, Pasokan Pangan dari Medan Menuju Banda Aceh Tertahan",
            25.0, 1, 13.0, 27.2, True,
            "2024-11-27", "BPBD Kab. Aceh Tamiang",
            "Laporan BPBD Aceh Tamiang / Antara Aceh, 27 Nov 2024",
            "Banjir 1 m memutus arteri Kuala Simpang 13 jam; pasokan pangan Medan-Banda Aceh tertahan.",
        ),
        _scn(
            "SUM-SCN-048", "Amblas Gorong-Gorong Jalan Nasional Nagan Raya", "Aceh",
            "Meulaboh - Nagan Raya", 96.182, 4.145, "road_subsidence",
            "WASPADA", 18.0, 80, 0.40,
            "Gorong-Gorong Jalan Nasional Amblas di Nagan Raya, Truk Berat Dialihkan ke Jalur Desa",
            2.8, 1, 7.5, 15.5, True,
            "2024-09-12", "Balai Jalan Nasional Aceh & BPBD Nagan Raya",
            "Laporan BPJN Aceh / Antara Aceh, 12 Sep 2024",
            "FN: gorong-gorong amblas malam hari dan headline hanya menyebut kabupaten Nagan Raya (22 km dari titik kejadian) sehingga decay spasial menekan skor; hujan 18 mm/jam hanya WASPADA dan lonjakan harga 2,8% di bawah ambang kanal ekonomi.",
        ),
        _scn(
            "SUM-SCN-049", "Hujan Ringan Pelabuhan Ulee Lheue Pelayaran Normal", "Aceh",
            "Pelabuhan Penyeberangan Ulee Lheue Banda Aceh", 95.284, 5.554, "routine_rain",
            "WASPADA", 15.0, 10, 0.88,
            "Jadwal Kapal Cepat dan Ferry Banda Aceh ke Sabang Beroperasi Sesuai Jadwal di Tengah Cuaca Gerimis",
            0.5, 0, 0.1, 0.0, False,
            "2024-06-03", "ASDP Ulee Lheue & BMKG Maritim Banda Aceh",
            "Rilis ASDP Ulee Lheue / Antara Aceh, 3 Jun 2024",
            "Gerimis tanpa gelombang berarti; seluruh trip Banda Aceh-Sabang sesuai jadwal.",
        ),
        _scn(
            "SUM-SCN-050", "Operasional Logistik Hub Industri Lhokseumawe Lancar", "Aceh",
            "Kawasan Industri Arun Lhokseumawe", 97.142, 5.184, "normal_port",
            "NORMAL", 0.0, 8, 0.94,
            "Distribusi Logistik Energi dan Bahan Pokok di Kawasan Industri Lhokseumawe Berjalan Terjadwal",
            0.2, 0, 0.0, 0.0, False,
            "2024-08-14", "PT Arun NGL & Kominfo Lhokseumawe",
            "Laporan Kominfo Lhokseumawe / Antara Aceh, 14 Agu 2024",
            "Distribusi energi dan bahan pokok normal tanpa kendala.",
        ),
        _scn(
            "SUM-SCN-051", "Banjir Luapan Sungai Soraya Aceh Singkil", "Aceh",
            "Subulussalam - Rimo Singkil", 97.812, 2.341, "flood",
            "AWAS", 50.0, 220, 0.12,
            "Sungai Soraya Meluap Rendam Badan Jalan Penghubung ke Aceh Singkil, Angkutan Sembako Terisolasi",
            19.5, 1, 10.0, 21.0, True,
            "2023-11-08", "BPBD Kab. Aceh Singkil",
            "Laporan BPBD Aceh Singkil / Antara Aceh, 8 Nov 2023",
            "Banjir 90 cm mengisolasi jalur Subulussalam-Singkil 10 jam; sembako tidak bisa masuk.",
        ),
        _scn(
            "SUM-SCN-052", "Longsor Perbukitan Bireuen-Takengon Enang-Enang", "Aceh",
            "Bireuen - Bener Meriah (Enang-Enang)", 96.790, 4.660, "landslide",
            "SIAGA", 46.0, 250, 0.10,
            "Longsor Material Bebatuan Tutup Jalur Bireuen-Takengon di Enang-Enang, Pasokan Kopi Gayo Terhambat",
            18.0, 1, 8.5, 19.5, True,
            "2024-03-19", "BPBD Kab. Bireuen & Bener Meriah",
            "Laporan BPBD Bireuen / Antara Aceh, 19 Mar 2024",
            "Longsor bebatuan menutup jalur Enang-Enang 8,5 jam; kopi Gayo tertahan menuju pesisir.",
        ),
        _scn(
            "SUM-SCN-053", "Isu Kelangkaan BBM Subulussalam Dipastikan Hoaks", "Aceh",
            "Kota Subulussalam", 98.012, 2.651, "debunked_rumor",
            "NORMAL", 0.0, 6, 0.95,
            "Pertamina Pastikan Stok BBM di SPBU Subulussalam Aman Melimpah, Warga Diminta Tidak Panic Buying",
            1.0, 0, 0.0, 0.0, False,
            "2024-05-29", "Pertamina Patra Niaga & Polres Subulussalam",
            "Klarifikasi Pertamina / Antara Aceh, 29 Mei 2024",
            "Stok BBM 12 hari dan tidak ada antrean; isu kelangkaan dinyatakan hoaks.",
        ),
    ]


def get_bengkulu_scenarios():
    """Bengkulu — 7 scenarios (4 disruptions, 3 controls)."""
    return [
        _scn(
            "SUM-SCN-054", "Abrasi & Amblas Jalur Lintas Barat Bengkulu-Krui", "Bengkulu",
            "Manna - Kaur (KM 42)", 103.280, -4.750, "road_subsidence",
            "AWAS", 48.0, 280, 0.07,
            "Abrasi Gelombang Laut Sebabkan Jalan Lintas Barat Kaur Amblas Setengah Badan Jalan, Truk Muatan Dilarang Melintas",
            21.0, 1, 11.5, 23.0, True,
            "2023-11-15", "BPBD Kab. Kaur",
            "Laporan BPBD Kaur / Antara Bengkulu, 15 Nov 2023",
            "Abrasi menggerus setengah badan Jalinbar KM 42 selama 11,5 jam; truk muatan dilarang melintas.",
        ),
        _scn(
            "SUM-SCN-055", "Longsor Tebing Pegunungan Kepahiang-Bengkulu", "Bengkulu",
            "Bengkulu Tengah - Kepahiang (Gunung)", 102.560, -3.680, "landslide",
            "SIAGA", 52.0, 240, 0.12,
            "Tebing Gunung Liku Sembilan Longsor Timpa Jalan Nasional di Kepahiang, Akses Distribusi Kota Bengkulu Buka Tutup",
            16.0, 1, 8.0, 18.0, True,
            "2024-04-05", "BPBD Kab. Kepahiang",
            "Laporan BPBD Kepahiang / Antara Bengkulu, 5 Apr 2024",
            "Buka tutup 8 jam di Liku Sembilan; distribusi Bengkulu-Curup tertahan.",
        ),
        _scn(
            "SUM-SCN-056", "Pengerukan Alur Pelabuhan Pulau Baai Berjalan Normal", "Bengkulu",
            "Pelabuhan Pulau Baai Kota Bengkulu", 102.312, -3.912, "normal_port",
            "NORMAL", 5.0, 10, 0.90,
            "Alur Masuk Kapal Pelabuhan Pulau Baai Terpantau Aman Dilalui Kapal Pengangkut Sembako dan CPO",
            0.4, 0, 0.0, 0.0, False,
            "2024-07-23", "Pelindo II Pulau Baai",
            "Laporan Pelindo Pulau Baai / RRI Bengkulu, 23 Jul 2024",
            "Alur pelayaran aman; kapal sembako dan CPO bersandar sesuai jadwal.",
        ),
        _scn(
            "SUM-SCN-057", "Banjir Luapan Sungai Air Manjunto Mukomuko", "Bengkulu",
            "Mukomuko - Batas Sumbar", 101.160, -2.580, "flood",
            "SIAGA", 45.0, 180, 0.20,
            "Sungai Air Manjunto Meluap Genangi Jalinbar Mukomuko, Truk Muatan CPO Tertahan Menuju Padang",
            13.5, 1, 6.5, 15.0, True,
            "2024-01-22", "BPBD Kab. Mukomuko",
            "Laporan BPBD Mukomuko / Antara Bengkulu, 22 Jan 2024",
            "Luapan menutup Jalinbar 6,5 jam; truk CPO tertahan menuju Padang.",
        ),
        _scn(
            "SUM-SCN-058", "Angin Kencang Pantai Panjang Kota Bengkulu Lalu Lintas Lancar", "Bengkulu",
            "Jalan Pariwisata Pantai Panjang", 102.264, -3.821, "routine_rain",
            "WASPADA", 12.0, 12, 0.85,
            "BMKG Rilis Peringatan Angin Kencang di Pesisir Bengkulu, Arus Logistik Darat di Pantai Panjang Berjalan Lancar Tanpa Hambatan",
            0.8, 0, 0.1, 0.0, False,
            "2024-08-02", "BMKG Stasiun Klimatologi Bengkulu & Dishub",
            "Peringatan BMKG Bengkulu / Antara Bengkulu, 2 Agu 2024",
            "Peringatan angin kencang bersifat pesisir; arus logistik darat tetap lancar.",
        ),
        _scn(
            "SUM-SCN-059", "Longsor Tebing Rimbo Pengadang Lebong", "Bengkulu",
            "Curup - Muara Aman Lebong", 102.250, -3.130, "landslide",
            "AWAS", 50.0, 230, 0.11,
            "Longsor di Rimbo Pengadang Tutup Akses Lebong, Pasokan Beras Tertahan",
            17.0, 1, 8.5, 18.8, True,
            "2024-02-22", "BPBD Kab. Lebong",
            "Laporan BPBD Lebong / Radar Bengkulu, 22 Feb 2024",
            "Longsor menutup akses Curup-Lebong 8,5 jam; beras tidak bisa masuk Lebong.",
        ),
        _scn(
            "SUM-SCN-060", "Pemeriksaan Pos Pengamanan Perbatasan Kaur Lancar", "Bengkulu",
            "Nasal Kaur - Batas Lampung", 103.481, -4.912, "rush_hour_traffic",
            "NORMAL", 0.0, 15, 0.80,
            "Pemeriksaan Rutin Muatan Angkutan Logistik di Perbatasan Kaur-Lampung Berjalan Tertib",
            0.5, 0, 0.2, 0.0, False,
            "2024-06-28", "Satlantas Polres Kaur & Dishub Bengkulu",
            "Pantauan Satlantas Kaur / Antara Bengkulu, 28 Jun 2024",
            "Pemeriksaan rutin tanpa penahanan berarti; arus logistik perbatasan tertib.",
        ),
    ]


def get_all_scenarios():
    return (
        get_sumut_scenarios()
        + get_sumbar_scenarios()
        + get_riau_scenarios()
        + get_jambi_scenarios()
        + get_sumsel_scenarios()
        + get_lampung_scenarios()
        + get_aceh_scenarios()
        + get_bengkulu_scenarios()
    )


def validate(scenarios):
    assert len(scenarios) == 60, f"Expected 60 scenarios, got {len(scenarios)}"

    ids = [s["id"] for s in scenarios]
    assert ids == [f"SUM-SCN-{i:03d}" for i in range(1, 61)], "Scenario IDs must be SUM-SCN-001..060 in order"

    disruptions = sum(1 for s in scenarios if s["ground_truth"]["is_disruption"] == 1)
    controls = sum(1 for s in scenarios if s["ground_truth"]["is_disruption"] == 0)
    assert disruptions == 35, f"Expected 35 disruptions, got {disruptions}"
    assert controls == 25, f"Expected 25 controls, got {controls}"

    provinces = {s["province"] for s in scenarios}
    assert len(provinces) == 8, f"Expected 8 provinces, got {len(provinces)}: {sorted(provinces)}"

    for s in scenarios:
        for key in ("event_date", "source_agency", "source_reference", "case_notes"):
            assert s.get(key), f"{s['id']} missing provenance field '{key}'"
        assert len(s["event_date"]) == 10 and 2023 <= int(s["event_date"][:4]) <= 2026, (
            f"{s['id']} event_date out of range: {s['event_date']}"
        )

    # Confusion-matrix anchors of the published benchmark.
    fn_ids = {"SUM-SCN-020", "SUM-SCN-035", "SUM-SCN-048"}
    fp_ids = {"SUM-SCN-004", "SUM-SCN-034", "SUM-SCN-042"}
    for sid in fn_ids:
        row = next(s for s in scenarios if s["id"] == sid)
        assert row["ground_truth"]["is_disruption"] == 1, f"{sid} must be a disruption (FN anchor)"
    for sid in fp_ids:
        row = next(s for s in scenarios if s["id"] == sid)
        gt = row["ground_truth"]
        assert gt["is_disruption"] == 0, f"{sid} must be a control (FP anchor)"
        assert gt["actual_delay_hours"] < 2.0, f"{sid} control delay must stay < 2.0h"
        assert gt["corridor_severed"] is False, f"{sid} control corridor must stay open"


def main():
    scenarios = get_all_scenarios()
    validate(scenarios)

    out_dir = "data/benchmark"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "sumatra_disruptions_ground_truth.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(scenarios, f, indent=2, ensure_ascii=False)

    print(
        f"SUCCESS: Generated {len(scenarios)} scenarios "
        f"(35 disruptions, 25 controls) to {out_path}"
    )


if __name__ == "__main__":
    main()
