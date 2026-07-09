"""
BI PIHPS Complete Scraper - Direct JSON API
Mengunduh semua 7 komoditas 2020-2026 secara langsung dari API BI
"""
import sys
import os
import json
import time
import re
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR   = os.path.join(BASE_DIR, "data", "raw", "pihps")
CACHE_DIR = os.path.join(BASE_DIR, "data", "raw", "pihps_bi", "api_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

BASE_URL = "https://www.bi.go.id/hargapangan/WebSite/TabelHarga"

SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
})

# Target commodities: name -> (comcat_id, output_filename)
KOMODITAS = {
    'Beras Kualitas Medium I':    ('com_3',  '01 - Beras - 2020 s.d 23 Jun 2026.csv'),
    'Cabai Merah Besar':           ('com_13', '02 - Cabai Merah - 2020 s.d 23 Jun 2026.csv'),
    'Cabai Rawit Merah':           ('com_16', '03 - Cabai Rawit - 2020 s.d 23 Jun 2026.csv'),
    'Bawang Merah Ukuran Sedang':  ('com_11', '04 - Bawang Merah - 2020 s.d 23 Jun 2026.csv'),
    'Bawang Putih Ukuran Sedang':  ('com_12', '05 - Bawang Putih - 2020 s.d 23 Jun 2026.csv'),
    'Minyak Goreng Curah':         ('com_17', '06 - Minyak Goreng - 2020 s.d 23 Jun 2026.csv'),
    'Telur Ayam Ras Segar':        ('com_10', '07 - Telur Ayam Ras - 2020 s.d 23 Jun 2026.csv'),
}

# Province IDs from GetRefProvince API
PROV_IDS = {
    'Aceh': 1, 'Bali': 17, 'Banten': 11, 'Bengkulu': 7,
    'DI Yogyakarta': 15, 'DKI Jakarta': 13, 'Gorontalo': 25, 'Jambi': 6,
    'Jawa Barat': 12, 'Jawa Tengah': 14, 'Jawa Timur': 16,
    'Kalimantan Barat': 20, 'Kalimantan Selatan': 21, 'Kalimantan Tengah': 22,
    'Kalimantan Timur': 23, 'Kalimantan Utara': 24,
    'Kepulauan Bangka Belitung': 9, 'Kepulauan Riau': 5, 'Lampung': 10,
    'Maluku': 31, 'Maluku Utara': 32, 'Nusa Tenggara Barat': 18,
    'Nusa Tenggara Timur': 19, 'Papua': 33, 'Papua Barat': 34, 'Riau': 4,
    'Sulawesi Barat': 30, 'Sulawesi Selatan': 26, 'Sulawesi Tengah': 28,
    'Sulawesi Tenggara': 27, 'Sulawesi Utara': 29, 'Sumatera Barat': 3,
    'Sumatera Selatan': 8, 'Sumatera Utara': 2,
}

def api_get(endpoint, params=None, retries=3):
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(retries):
        try:
            resp = SESSION.get(url, params=params, timeout=45)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < retries - 1:
                print(f"    Retry {attempt+1}: {e}")
                time.sleep(3 * (attempt + 1))
            else:
                print(f"    FAILED: {e}")
                return None

def parse_period_to_dates(period_str):
    """
    Parse period strings like 'Jan 2022 (I)', 'Jan 2022 (II)' to approximate dates.
    BI uses weekly numbering within a month.
    Week I  ~ day 1-7
    Week II ~ day 8-14
    Week III~ day 15-21
    Week IV ~ day 22-28
    Week V  ~ day 29-31
    Returns the middle date of the week period.
    """
    months_id = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'Mei': 5, 'Jun': 6,
        'Jul': 7, 'Agu': 8, 'Sep': 9, 'Okt': 10, 'Nov': 11, 'Des': 12,
        # Also handle English
        'May': 5, 'Aug': 8, 'Oct': 10, 'Dec': 12,
    }
    week_day = {'I': 4, 'II': 11, 'III': 18, 'IV': 25, 'V': 29}

    pattern = r'(\w+)\s+(\d{4})\s+\((\w+)\)'
    m = re.match(pattern, str(period_str).strip())
    if m:
        mon_str, yr_str, week_str = m.groups()
        month = months_id.get(mon_str, 1)
        year = int(yr_str)
        day = week_day.get(week_str, 15)
        try:
            return datetime(year, month, min(day, 28)).strftime('%Y-%m-%d')
        except:
            return None
    return None

def fetch_commodity_data(comcat_id, com_name):
    """
    Fetch per-province data for one commodity.
    Loop each province separately since comcat_id filter returns only national avg.
    """
    print(f"\n  Fetching: {com_name} (id={comcat_id})")

    all_records = []

    # Generate 6-month query periods
    start = datetime(2020, 1, 1)
    end   = datetime(2026, 6, 23)
    chunks = []
    cur = start
    while cur <= end:
        if cur.month <= 6:
            chunk_end = min(datetime(cur.year, 6, 30), end)
        else:
            chunk_end = min(datetime(cur.year, 12, 31), end)
        chunks.append((cur.strftime('%Y-%m-%d'), chunk_end.strftime('%Y-%m-%d')))
        if cur.month <= 6:
            cur = datetime(cur.year, 7, 1)
        else:
            cur = datetime(cur.year + 1, 1, 1)

    total_provs = len(PROV_IDS)
    for prov_idx, (prov_name, prov_id) in enumerate(PROV_IDS.items()):
        prov_records = 0
        for ds, de in chunks:
            cache_key = f"{comcat_id}_prov{prov_id}_{ds}_{de}.json"
            cache_path = os.path.join(CACHE_DIR, cache_key)

            if os.path.exists(cache_path):
                with open(cache_path) as f:
                    resp_data = json.load(f)
            else:
                params = {
                    'price_type_id': 1,
                    'comcat_id': comcat_id,
                    'province_id': prov_id,
                    'regency_id': '',
                    'market_id': '',
                    'tipe_laporan': 2,  # Weekly
                    'start_date': ds,
                    'end_date': de,
                    '_': int(time.time() * 1000)
                }
                resp_data = api_get("GetGridDataDaerah", params)
                if resp_data is not None:
                    with open(cache_path, 'w') as f:
                        json.dump(resp_data, f)
                time.sleep(0.5)

            if not resp_data:
                continue

            rows = resp_data.get('data', []) if isinstance(resp_data, dict) else resp_data
            # Find rows with level=2 (commodity, not category)
            for row in rows:
                if not isinstance(row, dict):
                    continue
                if row.get('level', 0) != 2:
                    continue

                # This row IS the commodity data for this province
                period_cols = [k for k in row.keys() if re.match(r'\w+ \d{4} \(', k)]
                for period_col in period_cols:
                    price_str = str(row.get(period_col, '')).replace(',', '').strip()
                    if price_str in ('-', '', 'nan', 'None', '0'):
                        continue
                    try:
                        price = float(price_str)
                        if price <= 0:
                            continue
                    except:
                        continue

                    tanggal = parse_period_to_dates(period_col)
                    if tanggal:
                        all_records.append({
                            'provinsi': prov_name,
                            'tanggal': tanggal,
                            'harga_rp': price,
                        })
                        prov_records += 1

        if prov_records > 0:
            print(f"    [{prov_idx+1}/{total_provs}] {prov_name}: {prov_records} records")

    print(f"    Total raw records: {len(all_records)}")
    return all_records

def main():
    print("=" * 60)
    print("BI PIHPS Complete Scraper")
    print("=" * 60)

    all_results = {}

    for com_name, (comcat_id, out_fname) in KOMODITAS.items():
        records = fetch_commodity_data(comcat_id, com_name)

        if not records:
            print(f"  WARNING: No data for {com_name}")
            continue

        df = pd.DataFrame(records)
        df['tanggal'] = pd.to_datetime(df['tanggal'])
        df = df.sort_values(['provinsi', 'tanggal']).drop_duplicates(subset=['provinsi', 'tanggal'])

        out_path = os.path.join(OUT_DIR, out_fname)
        df.to_csv(out_path, index=False)

        n_prov = df['provinsi'].nunique()
        cv = df['harga_rp'].std() / df['harga_rp'].mean() * 100
        mean_p = df['harga_rp'].mean()
        print(f"  SAVED: {out_fname}")
        print(f"    Records: {len(df)}, Provinces: {n_prov}, Mean: Rp{mean_p:,.0f}, CV: {cv:.1f}%")
        print(f"    Date range: {df['tanggal'].min().date()} to {df['tanggal'].max().date()}")
        all_results[com_name] = {'records': len(df), 'provinces': n_prov, 'cv': cv, 'mean': mean_p}

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, stats in all_results.items():
        print(f"  {name}: {stats['records']} records, {stats['provinces']} prov, CV={stats['cv']:.1f}%, mean=Rp{stats['mean']:,.0f}")

    print("\nDone! Data saved to data/raw/pihps/")

if __name__ == "__main__":
    main()
