import os
import time
import requests
import pandas as pd
from datetime import datetime

PROVINCES_COORDS = {
    'Aceh': {'lat': 5.548, 'lon': 95.323},
    'Sumatera Utara': {'lat': 3.595, 'lon': 98.672},
    'Sumatera Barat': {'lat': -0.947, 'lon': 100.417},
    'Riau': {'lat': 0.507, 'lon': 101.447},
    'Jambi': {'lat': -1.610, 'lon': 103.613},
    'Sumatera Selatan': {'lat': -2.990, 'lon': 104.756},
    'Bengkulu': {'lat': -3.795, 'lon': 102.265},
    'Lampung': {'lat': -5.449, 'lon': 105.266},
    'Kepulauan Bangka Belitung': {'lat': -2.130, 'lon': 106.116},
    'Kepulauan Riau': {'lat': 0.914, 'lon': 104.442},
    'DKI Jakarta': {'lat': -6.208, 'lon': 106.845},
    'Jawa Barat': {'lat': -6.917, 'lon': 107.619},
    'Jawa Tengah': {'lat': -6.993, 'lon': 110.420},
    'DI Yogyakarta': {'lat': -7.795, 'lon': 110.369},
    'Jawa Timur': {'lat': -7.257, 'lon': 112.752},
    'Banten': {'lat': -6.115, 'lon': 106.150},
    'Bali': {'lat': -8.670, 'lon': 115.212},
    'Nusa Tenggara Barat': {'lat': -8.583, 'lon': 116.116},
    'Nusa Tenggara Timur': {'lat': -10.177, 'lon': 123.607},
    'Kalimantan Barat': {'lat': -0.026, 'lon': 109.342},
    'Kalimantan Tengah': {'lat': -2.208, 'lon': 113.916},
    'Kalimantan Selatan': {'lat': -3.316, 'lon': 114.590},
    'Kalimantan Timur': {'lat': -0.494, 'lon': 117.153},
    'Kalimantan Utara': {'lat': 2.837, 'lon': 117.365},
    'Sulawesi Utara': {'lat': 1.474, 'lon': 124.840},
    'Sulawesi Tengah': {'lat': -0.891, 'lon': 119.870},
    'Sulawesi Selatan': {'lat': -5.147, 'lon': 119.432},
    'Sulawesi Tenggara': {'lat': -3.972, 'lon': 122.514},
    'Gorontalo': {'lat': 0.543, 'lon': 123.056},
    'Sulawesi Barat': {'lat': -2.677, 'lon': 118.888},
    'Maluku': {'lat': -3.695, 'lon': 128.181},
    'Maluku Utara': {'lat': 0.730, 'lon': 127.340},
    'Papua Barat': {'lat': -0.861, 'lon': 134.062},
    'Papua': {'lat': -2.541, 'lon': 140.669}
}

def fetch_weather_for_province(prov, lat, lon):
    print(f"Fetching weather for {prov} ({lat}, {lon})...")
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": "2020-01-01",
        "end_date": "2026-06-23",
        "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max",
        "timezone": "GMT"
    }
    
    try:
        r = requests.get(url, params=params, timeout=20)
        if r.status_code == 200:
            res = r.json()
            daily = res.get('daily', {})
            
            df = pd.DataFrame({
                'provinsi': prov,
                'tanggal': daily.get('time', []),
                'temp_max_c': daily.get('temperature_2m_max', []),
                'temp_min_c': daily.get('temperature_2m_min', []),
                'temp_avg_c': daily.get('temperature_2m_mean', []),
                'kelembapan_pct': daily.get('relative_humidity_2m_mean', []),
                'curah_hujan_mm': daily.get('precipitation_sum', []),
                'kec_angin_ms': daily.get('wind_speed_10m_max', [])
            })
            return df
        else:
            print(f"Error {r.status_code} for {prov}")
    except Exception as e:
        print(f"Exception for {prov}: {e}")
        
    return pd.DataFrame()

def main():
    raw_dir = os.path.join('data', 'raw', 'bmkg')
    os.makedirs(raw_dir, exist_ok=True)
    
    dfs = []
    for prov, coords in PROVINCES_COORDS.items():
        df_p = fetch_weather_for_province(prov, coords['lat'], coords['lon'])
        if not df_p.empty:
            dfs.append(df_p)
            print(f"  Acquired {len(df_p)} rows")
        else:
            print(f"  Warning: No data returned for {prov}")
        time.sleep(1.0) # Respect rate limits
        
    if dfs:
        df_all = pd.concat(dfs, ignore_index=True)
        csv_path = os.path.join(raw_dir, '01 - Weather - 2020 s.d 23 Jun 2026.csv')
        df_all.to_csv(csv_path, index=False)
        print(f"\n[SUCCESS] Saved all weather data to {csv_path} ({len(df_all)} rows)")
    else:
        print("\n[ERROR] Failed to fetch weather data for all provinces.")

if __name__ == "__main__":
    main()
