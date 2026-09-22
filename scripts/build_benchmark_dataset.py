# PreHub Sumatra Disruption Benchmark Dataset Generator
import json
import os

def get_sumut_scenarios():
    return [
        {
            'id': 'SUM-SCN-001',
            'name': 'Banjir Rob Pasang Air Laut Pelabuhan Belawan',
            'province': 'Sumatera Utara',
            'corridor': 'Pelabuhan Belawan - KIM Mabar',
            'coordinates': [98.694, 3.784],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 38.5,
                'tomtom_congestion_delay_min': 180,
                'tomtom_speed_ratio': 0.18,
                'osint_verified_headline': 'Banjir Rob Pasang Air Laut Genangi Kawasan Industri Medan dan Akses Belawan, Truk Kontainer Terhenti',
                'pihps_staple_price_shock_pct': 12.8
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 7.5,
                'observed_price_impact_pct': 14.2,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-002',
            'name': 'Luapan Sungai Ular Jalintim Medan-Tebing Tinggi',
            'province': 'Sumatera Utara',
            'corridor': 'Medan - Tebing Tinggi (KM 36)',
            'coordinates': [98.921, 3.528],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 52.0,
                'tomtom_congestion_delay_min': 210,
                'tomtom_speed_ratio': 0.12,
                'osint_verified_headline': 'Sungai Ular Meluap Rendam Jalur Arteri Lintas Sumatera Serdang Bedagai, Antrean Logistik 8 KM',
                'pihps_staple_price_shock_pct': 18.4
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 9.0,
                'observed_price_impact_pct': 19.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-003',
            'name': 'Longsor Tebing Bukit Barisan Tarutung-Sibolga',
            'province': 'Sumatera Utara',
            'corridor': 'Tarutung - Sibolga (KM 22)',
            'coordinates': [98.882, 1.842],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 41.0,
                'tomtom_congestion_delay_min': 300,
                'tomtom_speed_ratio': 0.05,
                'osint_verified_headline': 'Material Longsor Tutup Total Jalur Logistik Tarutung-Sibolga, Truk Sembako Dialihkan via Dolok Sanggul',
                'pihps_staple_price_shock_pct': 22.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 12.0,
                'observed_price_impact_pct': 24.1,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-004',
            'name': 'Hujan Deras Kota Pematang Siantar Drainase Lancar',
            'province': 'Sumatera Utara',
            'corridor': 'Tebing Tinggi - Pematang Siantar',
            'coordinates': [99.068, 2.959],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 32.0,
                'tomtom_congestion_delay_min': 15,
                'tomtom_speed_ratio': 0.82,
                'osint_verified_headline': 'Hujan Lebat Guyur Siantar, Arus Lalu Lintas Distribusi Barang Terpantau Ramai Lancar',
                'pihps_staple_price_shock_pct': 1.5
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.25,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-005',
            'name': 'Kepadatan Rutin Jumat Sore Simpang Amplas Medan',
            'province': 'Sumatera Utara',
            'corridor': 'Terminal Amplas Medan',
            'coordinates': [98.718, 3.535],
            'disaster_type': 'rush_hour_traffic',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 2.0,
                'tomtom_congestion_delay_min': 35,
                'tomtom_speed_ratio': 0.65,
                'osint_verified_headline': 'Volume Kendaraan Meningkat di Pintu Keluar Tol Amplas Medan Akhir Pekan',
                'pihps_staple_price_shock_pct': 0.8
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.5,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-006',
            'name': 'Banjir Luapan Sungai Asahan Jalintim Kisaran',
            'province': 'Sumatera Utara',
            'corridor': 'Kisaran - Rantau Prapat (KM 15)',
            'coordinates': [99.641, 2.981],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 46.0,
                'tomtom_congestion_delay_min': 160,
                'tomtom_speed_ratio': 0.25,
                'osint_verified_headline': 'Banjir Luapan Sungai Asahan Rendam Badan Jalan Lintas Sumatera, Akses Truk Sawit dan Sembako Tersendat',
                'pihps_staple_price_shock_pct': 11.2
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 6.0,
                'observed_price_impact_pct': 12.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-007',
            'name': 'Isu Penimbunan Minyak Goreng Langkat Hoaks',
            'province': 'Sumatera Utara',
            'corridor': 'Stabat - Tanjung Pura',
            'coordinates': [98.455, 3.742],
            'disaster_type': 'debunked_rumor',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 8,
                'tomtom_speed_ratio': 0.95,
                'osint_verified_headline': 'Disperindag Langkat Klarifikasi Isu Kelangkaan Minyak Goreng, Pasokan Distributor Aman Terkendali',
                'pihps_staple_price_shock_pct': 2.1
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.5,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-008',
            'name': 'Banjir Bandang Sungai Batang Serangan Langkat',
            'province': 'Sumatera Utara',
            'corridor': 'Tanjung Pura - Batas Aceh',
            'coordinates': [98.243, 3.912],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 58.0,
                'tomtom_congestion_delay_min': 240,
                'tomtom_speed_ratio': 0.10,
                'osint_verified_headline': 'Tanggul Batang Serangan Jebol, Jalur Distribusi Sayur Langkat ke Medan Lumpuh',
                'pihps_staple_price_shock_pct': 19.8
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 10.5,
                'observed_price_impact_pct': 21.0,
                'corridor_severed': True
            }
        }
    ]

def get_sumbar_scenarios():
    return [
        {
            'id': 'SUM-SCN-009',
            'name': 'Longsor Ekstrem Sitinjau Lauik Jalur Padang-Solok',
            'province': 'Sumatera Barat',
            'corridor': 'Padang - Solok (Panorama II)',
            'coordinates': [100.521, -0.954],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 65.0,
                'tomtom_congestion_delay_min': 360,
                'tomtom_speed_ratio': 0.02,
                'osint_verified_headline': 'Longsor Besar di Sitinjau Lauik Tutup Total Akses Logistik Utama Padang-Solok, Alat Berat Dikerahkan',
                'pihps_staple_price_shock_pct': 28.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 16.0,
                'observed_price_impact_pct': 31.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-010',
            'name': 'Banjir Bandang Lahar Dingin Lembah Anai',
            'province': 'Sumatera Barat',
            'corridor': 'Padang Panjang - Padang (Lembah Anai)',
            'coordinates': [100.354, -0.485],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 72.0,
                'tomtom_congestion_delay_min': 420,
                'tomtom_speed_ratio': 0.01,
                'osint_verified_headline': 'Jalan Nasional Lembah Anai Amblas Tergerus Banjir Lahar Dingin Marapi, Jalur Padang-Bukittinggi Terputus',
                'pihps_staple_price_shock_pct': 35.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 24.0,
                'observed_price_impact_pct': 38.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-011',
            'name': 'Peringatan Hujan Lebat Jembatan Kelok Sembilan Lancar',
            'province': 'Sumatera Barat',
            'corridor': 'Payakumbuh - Batas Riau (Kelok 9)',
            'coordinates': [100.698, -0.142],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 30.0,
                'tomtom_congestion_delay_min': 20,
                'tomtom_speed_ratio': 0.78,
                'osint_verified_headline': 'Kondisi Flyover Kelok Sembilan Aman Dilalui Kendaraan Logistik Meski Hujan Mengguyur Lima Puluh Kota',
                'pihps_staple_price_shock_pct': 2.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.3,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-012',
            'name': 'Operasional Normal Bongkar Muat Pelabuhan Teluk Bayur',
            'province': 'Sumatera Barat',
            'corridor': 'Pelabuhan Teluk Bayur Padang',
            'coordinates': [100.378, -0.998],
            'disaster_type': 'normal_port',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 5.0,
                'tomtom_congestion_delay_min': 10,
                'tomtom_speed_ratio': 0.90,
                'osint_verified_headline': 'Aktivitas Bongkar Muat Semen dan CPO di Pelabuhan Teluk Bayur Berjalan Optimal Tanpa Kendala Cuaca',
                'pihps_staple_price_shock_pct': 0.5
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-013',
            'name': 'Longsor Jalur Alternatif Malalak Agam',
            'province': 'Sumatera Barat',
            'corridor': 'Sicincin - Malalak - Bukittinggi',
            'coordinates': [100.281, -0.345],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 48.0,
                'tomtom_congestion_delay_min': 260,
                'tomtom_speed_ratio': 0.08,
                'osint_verified_headline': 'Jalur Alternatif Malalak Tertimbun Longsor 50 Meter, Akses Truk Ringan Terputus',
                'pihps_staple_price_shock_pct': 14.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.0,
                'observed_price_impact_pct': 15.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-014',
            'name': 'Kepadatan Wisata Akhir Pekan Bukittinggi Jam Gadang',
            'province': 'Sumatera Barat',
            'corridor': 'Pusat Kota Bukittinggi',
            'coordinates': [100.369, -0.305],
            'disaster_type': 'rush_hour_traffic',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 40,
                'tomtom_speed_ratio': 0.60,
                'osint_verified_headline': 'Arus Wisatawan Padati Pusat Kota Bukittinggi, Jalur Logistik Lingkar Luar Tidak Terpengaruh',
                'pihps_staple_price_shock_pct': 1.2
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.4,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-015',
            'name': 'Banjir Luapan Batang Hari Solok Selatan',
            'province': 'Sumatera Barat',
            'corridor': 'Muara Labuh - Sangir',
            'coordinates': [101.124, -1.487],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 50.0,
                'tomtom_congestion_delay_min': 190,
                'tomtom_speed_ratio': 0.20,
                'osint_verified_headline': 'Banjir Luapan Batang Hari Rendam Permukiman dan Jalan Penghubung Solok Selatan ke Jambi',
                'pihps_staple_price_shock_pct': 16.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 7.0,
                'observed_price_impact_pct': 17.8,
                'corridor_severed': True
            }
        }
    ]

def get_riau_scenarios():
    return [
        {
            'id': 'SUM-SCN-016',
            'name': 'Banjir Jalintim Pelalawan Pangkalan Kerinci KM 83',
            'province': 'Riau',
            'corridor': 'Pekanbaru - Pangkalan Kerinci (KM 83)',
            'coordinates': [101.882, 0.412],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 55.0,
                'tomtom_congestion_delay_min': 320,
                'tomtom_speed_ratio': 0.08,
                'osint_verified_headline': 'Genangan Air Capai 1 Meter di Jalintim Pelalawan KM 83, Ratusan Truk Muatan Sawit dan Beras Terjebak 2 Hari',
                'pihps_staple_price_shock_pct': 24.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 18.0,
                'observed_price_impact_pct': 26.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-017',
            'name': 'Banjir Luapan Waduk PLTA Koto Panjang Kampar',
            'province': 'Riau',
            'corridor': 'Bangkinang - Batas Sumbar',
            'coordinates': [100.912, 0.324],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 44.0,
                'tomtom_congestion_delay_min': 175,
                'tomtom_speed_ratio': 0.22,
                'osint_verified_headline': 'Pintu Pelimpah PLTA Koto Panjang Dibuka, Jalan Lintas Riau-Sumbar di Rantau Berangin Tergenang',
                'pihps_staple_price_shock_pct': 13.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 6.5,
                'observed_price_impact_pct': 14.1,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-018',
            'name': 'Antrean Ro-Ro Pelabuhan Penyeberangan Dumai-Rupat',
            'province': 'Riau',
            'corridor': 'Pelabuhan Penyeberangan Dumai',
            'coordinates': [101.442, 1.678],
            'disaster_type': 'port_congestion',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 12.0,
                'tomtom_congestion_delay_min': 210,
                'tomtom_speed_ratio': 0.15,
                'osint_verified_headline': 'Kerusakan Dermaga Apung Picu Antrean Panjang Truk Ekspedisi di Pelabuhan Ro-Ro Dumai',
                'pihps_staple_price_shock_pct': 10.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.0,
                'observed_price_impact_pct': 11.2,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-019',
            'name': 'Hujan Deras Tol Pekanbaru-Dumai Kecepatan Terjaga',
            'province': 'Riau',
            'corridor': 'Tol Permai (Pekanbaru - Dumai)',
            'coordinates': [101.354, 1.121],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 28.0,
                'tomtom_congestion_delay_min': 10,
                'tomtom_speed_ratio': 0.85,
                'osint_verified_headline': 'Pengelola Tol Pekanbaru-Dumai Imbau Pengemudi Waspada Aquaplaning saat Hujan Lebat, Arus Tol Normal',
                'pihps_staple_price_shock_pct': 0.9
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.2,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-020',
            'name': 'Amblas Oprit Jembatan Siak II Pekanbaru',
            'province': 'Riau',
            'corridor': 'Jalan Lintas Riau - Sumut (Siak II)',
            'coordinates': [101.412, 0.562],
            'disaster_type': 'road_subsidence',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 15.0,
                'tomtom_congestion_delay_min': 250,
                'tomtom_speed_ratio': 0.10,
                'osint_verified_headline': 'Oprit Jembatan Siak II Amblas Sedalam 40 CM, Truk Tronton Dilarang Melintas dan Dialihkan ke Ring Road',
                'pihps_staple_price_shock_pct': 15.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 9.5,
                'observed_price_impact_pct': 16.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-021',
            'name': 'Kabar Hoaks Minyak Tumpah di Rokan Hulu',
            'province': 'Riau',
            'corridor': 'Pasir Pengaraian - Ujung Batu',
            'coordinates': [100.321, 0.871],
            'disaster_type': 'debunked_rumor',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 5,
                'tomtom_speed_ratio': 0.96,
                'osint_verified_headline': 'Polres Rokan Hulu Pastikan Video Tumpahan Minyak Sawit di Jalan Raya Adalah Video Lawas Tahun 2021',
                'pihps_staple_price_shock_pct': 0.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-022',
            'name': 'Pasang Keling Tembilahan Surut Cepat Truk Melintas Normal',
            'province': 'Riau',
            'corridor': 'Tembilahan - Rengat',
            'coordinates': [103.152, -0.321],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 14.0,
                'tomtom_congestion_delay_min': 18,
                'tomtom_speed_ratio': 0.76,
                'osint_verified_headline': 'Pasang Keling di Tembilahan Cepat Surut, Distribusi Kelapa dan Sembako Berjalan Lancar Terkendali',
                'pihps_staple_price_shock_pct': 1.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.3,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        }
    ]

def get_jambi_scenarios():
    return [
        {
            'id': 'SUM-SCN-023',
            'name': 'Banjir Luapan Batanghari Jalintim Muaro Jambi',
            'province': 'Jambi',
            'corridor': 'Jambi - Sengeti (KM 25)',
            'coordinates': [103.621, -1.482],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 60.0,
                'tomtom_congestion_delay_min': 280,
                'tomtom_speed_ratio': 0.10,
                'osint_verified_headline': 'Sungai Batanghari Meluap Rendam Jalan Lintas Timur Sumatera di Muaro Jambi, Truk Muatan Sembako Menumpuk',
                'pihps_staple_price_shock_pct': 21.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 11.0,
                'observed_price_impact_pct': 23.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-024',
            'name': 'Longsor Perbukitan Kerinci Puncak Sungai Penuh',
            'province': 'Jambi',
            'corridor': 'Sungai Penuh - Tapan (Puncak)',
            'coordinates': [101.325, -2.054],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 54.0,
                'tomtom_congestion_delay_min': 360,
                'tomtom_speed_ratio': 0.03,
                'osint_verified_headline': 'Longsor Terjang Jalur Puncak Sungai Penuh ke Pesisir Selatan, Pasokan Sayur Kerinci Terhenti',
                'pihps_staple_price_shock_pct': 31.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 15.0,
                'observed_price_impact_pct': 33.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-025',
            'name': 'Kepadatan Truk Batubara Lingkar Selatan Jambi',
            'province': 'Jambi',
            'corridor': 'Jalan Lingkar Selatan Kota Jambi',
            'coordinates': [103.612, -1.642],
            'disaster_type': 'rush_hour_traffic',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 45,
                'tomtom_speed_ratio': 0.55,
                'osint_verified_headline': 'Pengaturan Jam Operasional Angkutan Batubara Berjalan Tertib di Simpang Rimbo Jambi',
                'pihps_staple_price_shock_pct': 1.8
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.5,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-026',
            'name': 'Longsor Jalinsum Merangin Bangko-Kerinci',
            'province': 'Jambi',
            'corridor': 'Bangko - Sungai Manau',
            'coordinates': [102.184, -2.145],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 43.0,
                'tomtom_congestion_delay_min': 220,
                'tomtom_speed_ratio': 0.14,
                'osint_verified_headline': 'Tebing Longsor Timpa Jalan Nasional di Merangin, Akses Penghubung Bangko ke Kerinci Buka Tutup',
                'pihps_staple_price_shock_pct': 17.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.5,
                'observed_price_impact_pct': 19.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-027',
            'name': 'Operasional Dermaga Talang Duku Jambi Terkendali',
            'province': 'Jambi',
            'corridor': 'Pelabuhan Talang Duku Batanghari',
            'coordinates': [103.684, -1.542],
            'disaster_type': 'normal_port',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 4.0,
                'tomtom_congestion_delay_min': 12,
                'tomtom_speed_ratio': 0.88,
                'osint_verified_headline': 'Debit Air Sungai Batanghari Normal, Tongkang Angkutan Komoditas Beroperasi Sesuai Jadwal',
                'pihps_staple_price_shock_pct': 0.4
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.1,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-028',
            'name': 'Banjir Rob Pesisir Kuala Tungkal Tanjung Jabung Barat',
            'province': 'Jambi',
            'corridor': 'Kuala Tungkal - Simpang Tuan',
            'coordinates': [103.461, -0.815],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 32.0,
                'tomtom_congestion_delay_min': 150,
                'tomtom_speed_ratio': 0.28,
                'osint_verified_headline': 'Banjir Pasang Rob Genangi Jalan Utama Menuju Pelabuhan Roro Kuala Tungkal',
                'pihps_staple_price_shock_pct': 12.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 5.5,
                'observed_price_impact_pct': 13.2,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-029',
            'name': 'Cuitan Hoaks Jembatan Sarolangun Putus',
            'province': 'Jambi',
            'corridor': 'Jalinsum Sarolangun',
            'coordinates': [102.654, -2.312],
            'disaster_type': 'debunked_rumor',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 6,
                'tomtom_speed_ratio': 0.95,
                'osint_verified_headline': 'Dinas PUPR Sarolangun Bantah Kabar Viral Jembatan Beatrix Retak Parah, Kondisi Struktur Kokoh',
                'pihps_staple_price_shock_pct': 0.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        }
    ]

def get_sumsel_scenarios():
    return [
        {
            'id': 'SUM-SCN-030',
            'name': 'Banjir Luapan Sungai Musi Jalintim Palembang-Betung KM 68',
            'province': 'Sumatera Selatan',
            'corridor': 'Palembang - Betung (KM 68)',
            'coordinates': [104.512, -2.854],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 42.5,
                'tomtom_congestion_delay_min': 145,
                'tomtom_speed_ratio': 0.22,
                'osint_verified_headline': 'Banjir Luapan Sungai Musi Genangi Jalintim Betung, Truk Sembako Macet 10 KM',
                'pihps_staple_price_shock_pct': 14.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 6.5,
                'observed_price_impact_pct': 16.2,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-031',
            'name': 'Amblas Tiang Jembatan Lalan Musi Banyuasin',
            'province': 'Sumatera Selatan',
            'corridor': 'Sekayu - Sungai Lilin',
            'coordinates': [103.842, -2.881],
            'disaster_type': 'road_subsidence',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 20.0,
                'tomtom_congestion_delay_min': 310,
                'tomtom_speed_ratio': 0.06,
                'osint_verified_headline': 'Jembatan Penghubung Kecamatan di Muba Amblas Ditabrak Tongkang, Distribusi Sawit Terhambat',
                'pihps_staple_price_shock_pct': 18.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 12.0,
                'observed_price_impact_pct': 20.1,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-032',
            'name': 'Kepadatan Jembatan Ampera Palembang Jam Pulang Kerja',
            'province': 'Sumatera Selatan',
            'corridor': 'Jembatan Ampera - Seberang Ulu',
            'coordinates': [104.764, -2.991],
            'disaster_type': 'rush_hour_traffic',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 30,
                'tomtom_speed_ratio': 0.68,
                'osint_verified_headline': 'Kepadatan Arus Kendaraan Jembatan Ampera Palembang Terpantau Mengalir Padat Merayap',
                'pihps_staple_price_shock_pct': 1.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.4,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-033',
            'name': 'Longsor Jalinsum Tebing Bukit Serelo Lahat',
            'province': 'Sumatera Selatan',
            'corridor': 'Lahat - Tebing Tinggi Sumsel',
            'coordinates': [103.541, -3.784],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 56.0,
                'tomtom_congestion_delay_min': 270,
                'tomtom_speed_ratio': 0.09,
                'osint_verified_headline': 'Longsor Batuan Tebing Bukit Serelo Timpa Jalur Lintas Tengah Lahat, Antrean Kendaraan Logistik Mengular',
                'pihps_staple_price_shock_pct': 20.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 10.0,
                'observed_price_impact_pct': 22.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-034',
            'name': 'Hujan Deras Tol Kayuagung-Palembang Drainase Optimal',
            'province': 'Sumatera Selatan',
            'corridor': 'Tol Kapalbetung (Kayuagung - Palembang)',
            'coordinates': [104.851, -3.245],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 35.0,
                'tomtom_congestion_delay_min': 12,
                'tomtom_speed_ratio': 0.84,
                'osint_verified_headline': 'Hujan Intensitas Tinggi di Tol Kayuagung-Palembang, Kendaraan Diimbau Kurangi Kecepatan',
                'pihps_staple_price_shock_pct': 1.1
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.2,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-035',
            'name': 'Kelangkaan Pupuk & Mogok Angkutan Truk Banyuasin',
            'province': 'Sumatera Selatan',
            'corridor': 'Tanjung Api-Api - Banyuasin',
            'coordinates': [104.812, -2.624],
            'disaster_type': 'commodity_shock',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 190,
                'tomtom_speed_ratio': 0.25,
                'osint_verified_headline': 'Aksi Mogok Sopir Angkutan Logistik Pelabuhan Tanjung Api-Api Hambat Pasokan Beras Pasang Surut',
                'pihps_staple_price_shock_pct': 17.2
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.0,
                'observed_price_impact_pct': 18.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-036',
            'name': 'Hujan Ringan Koridor Muara Enim Angkutan Berjalan',
            'province': 'Sumatera Selatan',
            'corridor': 'Prabumulih - Muara Enim',
            'coordinates': [103.921, -3.541],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 18.0,
                'tomtom_congestion_delay_min': 14,
                'tomtom_speed_ratio': 0.81,
                'osint_verified_headline': 'Jalur Distribusi Sembako Prabumulih ke Muara Enim Terpantau Lancar di Tengah Cuaca Berawan Tebal',
                'pihps_staple_price_shock_pct': 0.6
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.15,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-037',
            'name': 'Longsor Perbatasan Lubuklinggau-Curup Bengkulu',
            'province': 'Sumatera Selatan',
            'corridor': 'Lubuklinggau - Batas Bengkulu',
            'coordinates': [102.812, -3.312],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 50.0,
                'tomtom_congestion_delay_min': 240,
                'tomtom_speed_ratio': 0.11,
                'osint_verified_headline': 'Longsor di Jalur Lintas Curup-Lubuklinggau Tutup Akses Distribusi Sayuran Dataran Tinggi',
                'pihps_staple_price_shock_pct': 21.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 9.0,
                'observed_price_impact_pct': 23.0,
                'corridor_severed': True
            }
        }
    ]

def get_lampung_scenarios():
    return [
        {
            'id': 'SUM-SCN-038',
            'name': 'Gelombang Tinggi Penundaan Pelayaran Pelabuhan Bakauheni',
            'province': 'Lampung',
            'corridor': 'Pelabuhan ASDP Bakauheni',
            'coordinates': [105.754, -5.871],
            'disaster_type': 'port_congestion',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 45.0,
                'tomtom_congestion_delay_min': 380,
                'tomtom_speed_ratio': 0.05,
                'osint_verified_headline': 'Cuaca Buruk Selat Sunda Tunda Jadwal Kapal Ferry Bakauheni-Merak, Truk Logistik Mengular hingga Tol',
                'pihps_staple_price_shock_pct': 26.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 14.0,
                'observed_price_impact_pct': 29.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-039',
            'name': 'Banjir Luapan Sungai Tulang Bawang Jalintim Menggala',
            'province': 'Lampung',
            'corridor': 'Menggala - Simpang Pematang',
            'coordinates': [105.241, -4.482],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 48.0,
                'tomtom_congestion_delay_min': 190,
                'tomtom_speed_ratio': 0.19,
                'osint_verified_headline': 'Banjir Luapan Sungai Tulang Bawang Rendam Jalan Lintas Timur Menggala, Truk Tronton Alihkan Rute',
                'pihps_staple_price_shock_pct': 15.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 7.5,
                'observed_price_impact_pct': 17.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-040',
            'name': 'Bongkar Muat Lancar Pelabuhan Panjang Bandar Lampung',
            'province': 'Lampung',
            'corridor': 'Pelabuhan Panjang Bandar Lampung',
            'coordinates': [105.321, -5.461],
            'disaster_type': 'normal_port',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 2.0,
                'tomtom_congestion_delay_min': 8,
                'tomtom_speed_ratio': 0.92,
                'osint_verified_headline': 'Arus Logistik Peti Kemas di Pelabuhan Panjang Berjalan Lancar Sesuai Prosedur Standar',
                'pihps_staple_price_shock_pct': 0.3
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-041',
            'name': 'Penggerusan Pilar Jembatan Way Sekampung Pringsewu',
            'province': 'Lampung',
            'corridor': 'Gedong Tataan - Pringsewu',
            'coordinates': [104.981, -5.354],
            'disaster_type': 'road_subsidence',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 36.0,
                'tomtom_congestion_delay_min': 210,
                'tomtom_speed_ratio': 0.15,
                'osint_verified_headline': 'Pilar Jembatan Way Sekampung Tergerus Arus Deras, Batas Tonase Diberlakukan Ketat untuk Angkutan Berat',
                'pihps_staple_price_shock_pct': 13.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.0,
                'observed_price_impact_pct': 14.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-042',
            'name': 'Hujan Lebat Kota Bandar Lampung Bypass Lancar',
            'province': 'Lampung',
            'corridor': 'Jalan Soekarno-Hatta (Bypass) Bandar Lampung',
            'coordinates': [105.284, -5.385],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 32.0,
                'tomtom_congestion_delay_min': 18,
                'tomtom_speed_ratio': 0.77,
                'osint_verified_headline': 'Hujan Guyur Jalur Bypass Bandar Lampung, Lalu Lintas Truk Ekspedisi Tetap Berjalan Teratur',
                'pihps_staple_price_shock_pct': 1.2
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.25,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-043',
            'name': 'Kepadatan Akhir Pekan Jalintim Perbatasan Mesuji',
            'province': 'Lampung',
            'corridor': 'Simpang Pematang Mesuji',
            'coordinates': [105.412, -4.012],
            'disaster_type': 'rush_hour_traffic',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 25,
                'tomtom_speed_ratio': 0.72,
                'osint_verified_headline': 'Peningkatan Volume Kendaraan Logistik di Gerbang Perbatasan Lampung-Sumsel Mesuji',
                'pihps_staple_price_shock_pct': 0.8
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.3,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-044',
            'name': 'Banjir Rob & Pasang Air Laut Pesisir Tanggamus',
            'province': 'Lampung',
            'corridor': 'Kota Agung - Wonosobo Lampung',
            'coordinates': [104.624, -5.512],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 40.0,
                'tomtom_congestion_delay_min': 160,
                'tomtom_speed_ratio': 0.24,
                'osint_verified_headline': 'Gelombang Pasang Laut Rendam Jalan Pantai Barat Tanggamus, Angkutan Komoditas Pisang Terlambat',
                'pihps_staple_price_shock_pct': 11.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 6.0,
                'observed_price_impact_pct': 12.8,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-045',
            'name': 'Isu Hoaks Pemblokiran Tol Bakauheni-Terbanggi Besar',
            'province': 'Lampung',
            'corridor': 'Gerbang Tol Kalianda',
            'coordinates': [105.582, -5.712],
            'disaster_type': 'debunked_rumor',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 5,
                'tomtom_speed_ratio': 0.98,
                'osint_verified_headline': 'Polda Lampung Tegaskan Situasi Tol Trans Sumatera Kondusif, Kabar Demo Blokade Jalan Dipastikan Hoaks',
                'pihps_staple_price_shock_pct': 0.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        }
    ]

def get_aceh_scenarios():
    return [
        {
            'id': 'SUM-SCN-046',
            'name': 'Longsor Perbukitan Gayo Lues Blangkejeren',
            'province': 'Aceh',
            'corridor': 'Takengon - Blangkejeren (KM 45)',
            'coordinates': [97.342, 4.021],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 62.0,
                'tomtom_congestion_delay_min': 340,
                'tomtom_speed_ratio': 0.04,
                'osint_verified_headline': 'Timbunan Tanah Longsor Tutup Total Badan Jalan Lintas Dataran Tinggi Gayo Lues, Pasokan Logistik Terputus',
                'pihps_staple_price_shock_pct': 27.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 14.0,
                'observed_price_impact_pct': 29.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-047',
            'name': 'Banjir Luapan Sungai Tamiang Perbatasan Aceh-Sumut',
            'province': 'Aceh',
            'corridor': 'Kuala Simpang - Langsa',
            'coordinates': [98.054, 4.281],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 58.0,
                'tomtom_congestion_delay_min': 310,
                'tomtom_speed_ratio': 0.08,
                'osint_verified_headline': 'Banjir Rendam Jalur Arteri Kuala Simpang, Pasokan Pangan dari Medan Menuju Banda Aceh Tertahan',
                'pihps_staple_price_shock_pct': 25.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 13.0,
                'observed_price_impact_pct': 27.2,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-048',
            'name': 'Amblas Gorong-Gorong Jalan Nasional Meulaboh',
            'province': 'Aceh',
            'corridor': 'Meulaboh - Nagan Raya',
            'coordinates': [96.182, 4.145],
            'disaster_type': 'road_subsidence',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 44.0,
                'tomtom_congestion_delay_min': 200,
                'tomtom_speed_ratio': 0.16,
                'osint_verified_headline': 'Gorong-Gorong Amblas di Jalan Lintas Barat Aceh Barat Daya, Truk Berat Dialihkan ke Jalur Desa',
                'pihps_staple_price_shock_pct': 14.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 7.5,
                'observed_price_impact_pct': 15.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-049',
            'name': 'Hujan Ringan Pelabuhan Ulee Lheue Pelayaran Normal',
            'province': 'Aceh',
            'corridor': 'Pelabuhan Penyeberangan Ulee Lheue Banda Aceh',
            'coordinates': [95.284, 5.554],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 15.0,
                'tomtom_congestion_delay_min': 10,
                'tomtom_speed_ratio': 0.88,
                'osint_verified_headline': 'Jadwal Kapal Cepat dan Ferry Banda Aceh ke Sabang Beroperasi Sesuai Jadwal di Tengah Cuaca Gerimis',
                'pihps_staple_price_shock_pct': 0.5
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.1,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-050',
            'name': 'Operasional Logistik Hub Industri Lhokseumawe Lancar',
            'province': 'Aceh',
            'corridor': 'Kawasan Industri Arun Lhokseumawe',
            'coordinates': [97.142, 5.184],
            'disaster_type': 'normal_port',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 8,
                'tomtom_speed_ratio': 0.94,
                'osint_verified_headline': 'Distribusi Logistik Energi dan Bahan Pokok di Kawasan Industri Lhokseumawe Berjalan Terjadwal',
                'pihps_staple_price_shock_pct': 0.2
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-051',
            'name': 'Banjir Luapan Sungai Soraya Aceh Singkil',
            'province': 'Aceh',
            'corridor': 'Subulussalam - Rimo Singkil',
            'coordinates': [97.812, 2.341],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 50.0,
                'tomtom_congestion_delay_min': 220,
                'tomtom_speed_ratio': 0.12,
                'osint_verified_headline': 'Sungai Soraya Meluap Rendam Badan Jalan Penghubung ke Aceh Singkil, Angkutan Sembako Terisolasi',
                'pihps_staple_price_shock_pct': 19.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 10.0,
                'observed_price_impact_pct': 21.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-052',
            'name': 'Longsor Perbukitan Bireuen-Takengon Enang-Enang',
            'province': 'Aceh',
            'corridor': 'Bireuen - Bener Meriah (Enang-Enang)',
            'coordinates': [96.884, 4.851],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 46.0,
                'tomtom_congestion_delay_min': 250,
                'tomtom_speed_ratio': 0.10,
                'osint_verified_headline': 'Longsor Material Bebatuan Tutup Jalur Enang-Enang, Pasokan Kopi Gayo dan Sayuran Terhambat Menuju Pesisir',
                'pihps_staple_price_shock_pct': 18.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.5,
                'observed_price_impact_pct': 19.5,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-053',
            'name': 'Isu Kelangkaan BBM Subulussalam Dipastikan Hoaks',
            'province': 'Aceh',
            'corridor': 'Kota Subulussalam',
            'coordinates': [98.012, 2.651],
            'disaster_type': 'debunked_rumor',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 6,
                'tomtom_speed_ratio': 0.95,
                'osint_verified_headline': 'Pertamina Pastikan Stok BBM di SPBU Subulussalam Melimpah, Warga Diminta Tidak Panic Buying',
                'pihps_staple_price_shock_pct': 1.0
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        }
    ]

def get_bengkulu_scenarios():
    return [
        {
            'id': 'SUM-SCN-054',
            'name': 'Abrasi & Amblas Jalur Lintas Barat Bengkulu-Krui',
            'province': 'Bengkulu',
            'corridor': 'Manna - Kaur (KM 42)',
            'coordinates': [103.142, -4.721],
            'disaster_type': 'road_subsidence',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 48.0,
                'tomtom_congestion_delay_min': 280,
                'tomtom_speed_ratio': 0.07,
                'osint_verified_headline': 'Abrasi Gelombang Laut Sebabkan Jalan Lintas Barat Kaur Amblas Setengah Badan Jalan, Truk Muatan Dilarang Melintas',
                'pihps_staple_price_shock_pct': 21.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 11.5,
                'observed_price_impact_pct': 23.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-055',
            'name': 'Longsor Tebing Pegunungan Kepahiang-Bengkulu',
            'province': 'Bengkulu',
            'corridor': 'Bengkulu Tengah - Kepahiang (Gunung)',
            'coordinates': [102.512, -3.742],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 52.0,
                'tomtom_congestion_delay_min': 240,
                'tomtom_speed_ratio': 0.12,
                'osint_verified_headline': 'Tebing Gunung Liku Sembilan Longsor Timpa Jalan Nasional, Akses Distribusi Kota Bengkulu ke Curup Buka Tutup',
                'pihps_staple_price_shock_pct': 16.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.0,
                'observed_price_impact_pct': 18.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-056',
            'name': 'Pengerukan Alur Pelabuhan Pulau Baai Berjalan Normal',
            'province': 'Bengkulu',
            'corridor': 'Pelabuhan Pulau Baai Kota Bengkulu',
            'coordinates': [102.312, -3.912],
            'disaster_type': 'normal_port',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 5.0,
                'tomtom_congestion_delay_min': 10,
                'tomtom_speed_ratio': 0.90,
                'osint_verified_headline': 'Alur Masuk Kapal Pelabuhan Pulau Baai Terpantau Aman Dilalui Kapal Pengangkut Sembako dan CPO',
                'pihps_staple_price_shock_pct': 0.4
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.0,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-057',
            'name': 'Banjir Luapan Sungai Air Manjunto Mukomuko',
            'province': 'Bengkulu',
            'corridor': 'Mukomuko - Batas Sumbar',
            'coordinates': [101.242, -2.581],
            'disaster_type': 'flood',
            'sensor_inputs': {
                'bmkg_alert_level': 'SIAGA',
                'openmeteo_rain_rate_mmh': 45.0,
                'tomtom_congestion_delay_min': 180,
                'tomtom_speed_ratio': 0.20,
                'osint_verified_headline': 'Sungai Air Manjunto Meluap Genangi Jalinbar Mukomuko, Truk Muatan CPO Tertahan Menuju Padang',
                'pihps_staple_price_shock_pct': 13.5
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 6.5,
                'observed_price_impact_pct': 15.0,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-058',
            'name': 'Angin Kencang Pantai Panjang Kota Bengkulu Lalu Lintas Lancar',
            'province': 'Bengkulu',
            'corridor': 'Jalan Pariwisata Pantai Panjang',
            'coordinates': [102.264, -3.821],
            'disaster_type': 'routine_rain',
            'sensor_inputs': {
                'bmkg_alert_level': 'WASPADA',
                'openmeteo_rain_rate_mmh': 12.0,
                'tomtom_congestion_delay_min': 12,
                'tomtom_speed_ratio': 0.85,
                'osint_verified_headline': 'BMKG Rilis Peringatan Angin Kencang di Pesisir Bengkulu, Arus Logistik Darat Berjalan Tanpa Hambatan',
                'pihps_staple_price_shock_pct': 0.8
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.1,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        },
        {
            'id': 'SUM-SCN-059',
            'name': 'Longsor Tebing Rimbo Pengadang Lebong',
            'province': 'Bengkulu',
            'corridor': 'Curup - Muara Aman Lebong',
            'coordinates': [102.384, -3.212],
            'disaster_type': 'landslide',
            'sensor_inputs': {
                'bmkg_alert_level': 'AWAS',
                'openmeteo_rain_rate_mmh': 50.0,
                'tomtom_congestion_delay_min': 230,
                'tomtom_speed_ratio': 0.11,
                'osint_verified_headline': 'Longsor Tutup Akses Curup-Lebong di Rimbo Pengadang, Pasokan Beras Lebong Tertahan',
                'pihps_staple_price_shock_pct': 17.0
            },
            'ground_truth': {
                'is_disruption': 1,
                'actual_delay_hours': 8.5,
                'observed_price_impact_pct': 18.8,
                'corridor_severed': True
            }
        },
        {
            'id': 'SUM-SCN-060',
            'name': 'Pemeriksaan Pos Pengamanan Perbatasan Kaur Lancar',
            'province': 'Bengkulu',
            'corridor': 'Nasal Kaur - Batas Lampung',
            'coordinates': [103.481, -4.912],
            'disaster_type': 'rush_hour_traffic',
            'sensor_inputs': {
                'bmkg_alert_level': 'NORMAL',
                'openmeteo_rain_rate_mmh': 0.0,
                'tomtom_congestion_delay_min': 15,
                'tomtom_speed_ratio': 0.80,
                'osint_verified_headline': 'Pemeriksaan Rutin Muatan Angkutan Logistik di Perbatasan Bengkulu-Lampung Berjalan Tertib',
                'pihps_staple_price_shock_pct': 0.5
            },
            'ground_truth': {
                'is_disruption': 0,
                'actual_delay_hours': 0.2,
                'observed_price_impact_pct': 0.0,
                'corridor_severed': False
            }
        }
    ]

def main():
    all_scenarios = (
        get_sumut_scenarios() +
        get_sumbar_scenarios() +
        get_riau_scenarios() +
        get_jambi_scenarios() +
        get_sumsel_scenarios() +
        get_lampung_scenarios() +
        get_aceh_scenarios() +
        get_bengkulu_scenarios()
    )
    
    assert len(all_scenarios) == 60, f'Expected 60 scenarios, got {len(all_scenarios)}'
    disruptions = sum(1 for s in all_scenarios if s['ground_truth']['is_disruption'] == 1)
    controls = sum(1 for s in all_scenarios if s['ground_truth']['is_disruption'] == 0)
    assert disruptions == 35, f'Expected 35 disruptions, got {disruptions}'
    assert controls == 25, f'Expected 25 controls, got {controls}'
    
    out_dir = 'data/benchmark'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'sumatra_disruptions_ground_truth.json')
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(all_scenarios, f, indent=2, ensure_ascii=False)
        
    print(f'SUCCESS: Generated {len(all_scenarios)} scenarios ({disruptions} disruptions, {controls} controls) to {out_path}')

if __name__ == '__main__':
    main()
