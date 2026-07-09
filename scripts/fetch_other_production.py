import os
import requests
import pandas as pd
import numpy as np

API_KEY = "2c1888ff06364c9e1c6f1ee0b5f187c1"
BASE_URL = "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000"

PROVINSI_34 = [
    'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau',
    'Jambi', 'Sumatera Selatan', 'Bengkulu', 'Lampung',
    'Kepulauan Bangka Belitung', 'Kepulauan Riau',
    'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah',
    'DI Yogyakarta', 'Jawa Timur', 'Banten',
    'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
    'Kalimantan Barat', 'Kalimantan Tengah',
    'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
    'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan',
    'Sulawesi Tenggara', 'Gorontalo', 'Sulawesi Barat',
    'Maluku', 'Maluku Utara', 'Papua Barat', 'Papua'
]

def clean_province(name):
    name = str(name).strip().upper()
    mapping = {
        'DKI JAKARTA': 'DKI Jakarta',
        'D.I. YOGYAKARTA': 'DI Yogyakarta',
        'DI YOGYAKARTA': 'DI Yogyakarta',
        'KEP. BANGKA BELITUNG': 'Kepulauan Bangka Belitung',
        'KEPULAUAN BANGKA BELITUNG': 'Kepulauan Bangka Belitung',
        'KEP. RIAU': 'Kepulauan Riau',
        'KEPULAUAN RIAU': 'Kepulauan Riau',
        'PAPUA BARAT': 'Papua Barat',
        'NUSA TENGGARA BARAT': 'Nusa Tenggara Barat',
        'NUSA TENGGARA TIMUR': 'Nusa Tenggara Timur',
        'NANGGROE ACEH DARUSSALAM': 'Aceh',
        'ACEH': 'Aceh'
    }
    for k, v in mapping.items():
        if k in name:
            return v
    return name.title()

def fetch_bps_variable(var_id, target_turvars=None):
    print(f"Fetching variable {var_id} from BPS API...")
    batches = ["120:122", "123:125", "126:126"]
    records = []
    
    for batch in batches:
        url = f"{BASE_URL}/var/{var_id}/th/{batch}/key/{API_KEY}"
        try:
            r = requests.get(url, timeout=15)
            if r.status_code != 200:
                print(f"  Error {r.status_code} for batch {batch}")
                continue
                
            res = r.json()
            if res.get("status") != "OK" or res.get("data-availability") != "available":
                continue
                
            # Parse mappings
            vervar_map = {str(item['val']): item['label'] for item in res.get('vervar', [])}
            turvar_map = {str(item['val']): item['label'] for item in res.get('turvar', [])}
            tahun_map = {str(item['val']): item['label'] for item in res.get('tahun', [])}
            turtahun_map = {str(item['val']): item['label'] for item in res.get('turtahun', [])}
            
            content = res.get('datacontent', {})
            for key, val in content.items():
                if val is None or val == "" or val == "-":
                    continue
                
                # Decode key: {vervar_val}{var_id}{turvar_val}{tahun_val}{turtahun_val}
                th_val = None
                tuth_val = None
                for th in tahun_map.keys():
                    for tuth in turtahun_map.keys():
                        suffix = th + tuth
                        if key.endswith(suffix):
                            th_val = th
                            tuth_val = tuth
                            break
                    if th_val:
                        break
                        
                if not th_val:
                    continue
                    
                prefix = key[:-len(th_val + tuth_val)]
                
                tur_val = None
                for tur in turvar_map.keys():
                    if prefix.endswith(tur):
                        tur_val = tur
                        break
                        
                if not tur_val:
                    continue
                
                # Check if we only want specific turvars
                if target_turvars is not None and tur_val not in target_turvars:
                    continue
                    
                ver_prefix = prefix[:-len(tur_val)]
                var_str = str(var_id)
                v_val = None
                if ver_prefix.endswith(var_str):
                    v_val = ver_prefix[:-len(var_str)]
                
                if v_val and v_val in vervar_map:
                    prov_raw = vervar_map[v_val]
                    prov_clean = clean_province(prov_raw)
                    if prov_clean in PROVINSI_34:
                        year = tahun_map[th_val]
                        period_lbl = turtahun_map[tuth_val]
                        tur_lbl = turvar_map[tur_val]
                        
                        try:
                            val_float = float(val)
                        except ValueError:
                            continue
                            
                        records.append({
                            'provinsi': prov_clean,
                            'tahun': int(year),
                            'periode': period_lbl,
                            'kategori': tur_lbl,
                            'nilai': val_float
                        })
        except Exception as e:
            print(f"  Exception for batch {batch}: {e}")
            
    return pd.DataFrame(records)

def main():
    raw_dir = os.path.join('data', 'raw', 'bps')
    os.makedirs(raw_dir, exist_ok=True)
    
    # 1. Vegetables (Cabai, Bawang) - Var ID 61
    # Turvars: '121' -> Bawang Merah, '122' -> Bawang Putih, '132' -> Cabai Besar, '133' -> Cabai Rawit
    df_veg = fetch_bps_variable(61, target_turvars=['121', '122', '132', '133'])
    
    # 2. Plantation Crops (Kelapa Sawit) - Var ID 132
    # Turvar: '252' -> Kelapa Sawit
    df_plantation = fetch_bps_variable(132, target_turvars=['252'])
    
    # 3. Corn (Jagung) - Var ID 2204
    # Turvar: '1193' -> Produksi (ton)
    df_corn = fetch_bps_variable(2204, target_turvars=['1193'])
    
    # 4. Eggs (Telur Ayam Petelur) - Var ID 491
    # Turvar: '0' -> Tidak ada
    df_eggs = fetch_bps_variable(491, target_turvars=['0'])
    
    # 5. Chicken Meat (Daging Ayam Ras Pedaging) - Var ID 488
    # Turvar: '0' -> Tidak ada
    df_chicken = fetch_bps_variable(488, target_turvars=['0'])
    
    # Process and save each commodity
    commodities = [
        ('Bawang Merah', df_veg, 'Bawang Merah (Ton)', '06 - Production_Bawang_Merah - 2020 s.d 23 Jun 2026.csv'),
        ('Bawang Putih', df_veg, 'Bawang Putih (Ton)', '07 - Production_Bawang_Putih - 2020 s.d 23 Jun 2026.csv'),
        ('Cabai Besar', df_veg, 'Cabai Besar (Ton)', '08 - Production_Cabai_Merah - 2020 s.d 23 Jun 2026.csv'),
        ('Cabai Rawit', df_veg, 'Cabai Rawit (Ton)', '09 - Production_Cabai_Rawit - 2020 s.d 23 Jun 2026.csv'),
        ('Kelapa Sawit', df_plantation, 'Kelapa Sawit', '10 - Production_Kelapa_Sawit - 2020 s.d 23 Jun 2026.csv'),
        ('Jagung', df_corn, 'Produksi (ton)', '11 - Production_Jagung - 2020 s.d 23 Jun 2026.csv'),
        ('Telur Ayam Petelur', df_eggs, 'Tidak ada', '12 - Production_Telur_Ayam_Ras - 2020 s.d 23 Jun 2026.csv'),
        ('Daging Ayam Ras Pedaging', df_chicken, 'Tidak ada', '13 - Production_Daging_Ayam - 2020 s.d 23 Jun 2026.csv')
    ]
    
    for name, df, category, filename in commodities:
        if df.empty:
            print(f"Warning: No data for {name}")
            continue
            
        # Filter for the specific category
        df_filtered = df[df['kategori'] == category]
        if df_filtered.empty:
            df_filtered = df  # fallback if single category queried
            
        # Aggregate to annual values per province
        df_ann = df_filtered.groupby(['provinsi', 'tahun'])['nilai'].mean().reset_index()
        df_ann['kategori'] = name
        
        # Save to CSV
        csv_path = os.path.join(raw_dir, filename)
        df_ann.to_csv(csv_path, index=False)
        print(f"Saved: {csv_path} ({len(df_ann)} rows)")

if __name__ == "__main__":
    main()
