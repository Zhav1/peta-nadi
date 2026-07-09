import os
import sys
import json
import asyncio
import argparse
import pandas as pd
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

async def safe_goto(page, url):
    try:
        # Use wait_until="load" instead of "networkidle" as slow tracking scripts can block idle state indefinitely.
        await page.goto(url, wait_until="load", timeout=30000)
    except Exception as e:
        print(f"      [safe_goto] Navigation timeout or issue: {e}. Checking if target form element is loaded...")
        if await page.query_selector("select#subsektor"):
            print("      [safe_goto] Form select#subsektor is present. Continuing page interaction.")
            return
        raise Exception(f"Failed to load page {url} and select#subsektor was not found in the DOM.")

def parse_html_table(html_content):
    soup = BeautifulSoup(html_content, "html.parser")
    table = soup.find("table")
    if not table:
        return []
    
    rows = table.find_all("tr")
    if not rows:
        return []
        
    header_cols = [col.get_text().strip() for col in rows[0].find_all(["td", "th"])]
    
    # Identify the columns that represent years
    year_cols = []
    for idx, col in enumerate(header_cols):
        if col.isdigit() and len(col) == 4:
            year_cols.append((idx, col))
            
    data_records = []
    for r in rows[1:]:
        cols = [col.get_text().strip() for col in r.find_all(["td", "th"])]
        if len(cols) < 3:
            continue
        commodity = cols[1]
        unit = cols[2]
        
        values = {}
        for idx, year in year_cols:
            if idx < len(cols):
                val_str = cols[idx]
                try:
                    val_str_clean = val_str.replace(".", "").replace(",", ".")
                    val = float(val_str_clean)
                except ValueError:
                    val = 0.0
                values[year] = val
                
        data_records.append({
            "commodity": commodity,
            "unit": unit,
            "values": values
        })
        
    return data_records

class BDSPScraper:
    def __init__(self, output_dir="d:/College/Satria Data 2026/data/raw/kementan_bdsp", dry_run=False):
        self.output_dir = output_dir
        self.cache_dir = os.path.join(output_dir, "cache")
        self.dry_run = dry_run
        
    def setup_directories(self):
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.cache_dir, exist_ok=True)
        
    async def run(self):
        self.setup_directories()
        
        async with async_playwright() as p:
            print("Launching headless Chromium...")
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(ignore_https_errors=True)
            page = await context.new_page()
            
            print("Navigating to bdsp...")
            await safe_goto(page, "https://bdsp2.pertanian.go.id/bdsp/id/komoditas")
            
            subsektors = await page.evaluate("""() => {
                const el = document.querySelector('select#subsektor');
                return el ? Array.from(el.options).filter(o => o.value !== "00").map(o => ({ value: o.value, text: o.text })) : [];
            }""")
            
            if self.dry_run:
                subsektors = [s for s in subsektors if s['value'] == "01"]  # Tanaman Pangan
                
            print(f"Found {len(subsektors)} subsektors.")
            
            for sub in subsektors:
                sub_val = sub['value']
                sub_name = sub['text']
                print(f"\n--- Subsektor: {sub_name} ({sub_val}) ---")
                
                # Select subsektor
                await page.select_option("select#subsektor", sub_val)
                await page.wait_for_timeout(2000)
                
                indicators = await page.evaluate("""() => {
                    const el = document.querySelector('select#indikator');
                    return el ? Array.from(el.options).filter(o => o.value !== "00").map(o => ({ value: o.value, text: o.text })) : [];
                }""")
                
                if self.dry_run:
                    indicators = [ind for ind in indicators if ind['value'] == "0104"]  # PRODUKSI
                    
                print(f"Found {len(indicators)} indicators for {sub_name}.")
                
                for ind in indicators:
                    ind_val = ind['value']
                    ind_name = ind['text']
                    print(f"  Indicator: {ind_name} ({ind_val})")
                    
                    # Select indicator
                    await page.select_option("select#indikator", ind_val)
                    await page.wait_for_timeout(2000)
                    
                    # Select level (Provinsi)
                    await page.select_option("select#level", "02")
                    await page.wait_for_timeout(2000)
                    
                    provinces = await page.evaluate("""() => {
                        const el = document.querySelector('select#prov');
                        return el ? Array.from(el.options).filter(o => o.value !== "00").map(o => ({ value: o.value, text: o.text })) : [];
                    }""")
                    
                    if self.dry_run:
                        provinces = [p for p in provinces if p['value'] in ["11", "12"]]  # Aceh, Sumatera Utara
                        
                    print(f"  Found {len(provinces)} provinces.")
                    
                    for prov in provinces:
                        prov_val = prov['value']
                        prov_name = prov['text']
                        
                        cache_filename = f"sub_{sub_val}_ind_{ind_val}_prov_{prov_val}.json"
                        cache_filepath = os.path.join(self.cache_dir, cache_filename)
                        
                        if os.path.exists(cache_filepath):
                            print(f"    [SKIP] Already scraped: Subsektor={sub_name}, Indicator={ind_name}, Province={prov_name}")
                            continue
                            
                        print(f"    [FETCH] Scraping: Subsektor={sub_name}, Indicator={ind_name}, Province={prov_name} ({prov_val})...")
                        
                        success = False
                        retries = 3
                        for attempt in range(retries):
                            try:
                                # Ensure we are on the form page (if result-box is visible, back out)
                                is_result_visible = await page.evaluate("() => { const el = document.querySelector('#result-box'); return el ? el.style.display !== 'none' : false; }")
                                if is_result_visible:
                                    await page.evaluate("() => document.querySelector('button#back').click()")
                                    await page.wait_for_selector("select#prov", state="visible", timeout=10000)
                                    await page.wait_for_timeout(500)
                                    
                                # 1. Select province
                                await page.select_option("select#prov", prov_val)
                                await page.wait_for_timeout(1000)
                                
                                async def set_select_js(selector, value):
                                    await page.evaluate(f"""
                                        const el = document.querySelector('{selector}');
                                        if (el) {{
                                            el.value = '{value}';
                                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                        }}
                                    """)
                                    await page.wait_for_timeout(300)
                                    
                                # 2. Get form options
                                form_info = await page.evaluate("""() => {
                                    const getOpts = (sel) => {
                                        const el = document.querySelector(sel);
                                        return el ? Array.from(el.options).map(o => o.value) : [];
                                    };
                                    return {
                                        satuan: getOpts('select#satuan'),
                                        sts_angka: getOpts('select#sts_angka'),
                                        sumb_data: getOpts('select#sumb_data'),
                                        tahunAwal: getOpts('select#tahunAwal'),
                                        tahunAkhir: getOpts('select#tahunAkhir')
                                    };
                                }""")
                                
                                # Set hidden fields
                                val_satuan = "00" if "00" in form_info['satuan'] else (form_info['satuan'][1] if len(form_info['satuan']) > 1 else "00")
                                await set_select_js("select#satuan", val_satuan)
                                
                                val_sts = "6" if "6" in form_info['sts_angka'] else (form_info['sts_angka'][1] if len(form_info['sts_angka']) > 1 else "00")
                                await set_select_js("select#sts_angka", val_sts)
                                
                                val_sumb = "12" if "12" in form_info['sumb_data'] else ("01" if "01" in form_info['sumb_data'] else (form_info['sumb_data'][1] if len(form_info['sumb_data']) > 1 else "00"))
                                await set_select_js("select#sumb_data", val_sumb)
                                
                                val_yr_start = "1970" if "1970" in form_info['tahunAwal'] else (form_info['tahunAwal'][1] if len(form_info['tahunAwal']) > 1 else "00")
                                await set_select_js("select#tahunAwal", val_yr_start)
                                
                                val_yr_end = "2026" if "2026" in form_info['tahunAkhir'] else (form_info['tahunAkhir'][-1] if len(form_info['tahunAkhir']) > 1 else "00")
                                await set_select_js("select#tahunAkhir", val_yr_end)
                                
                                # 3. Click search
                                await page.evaluate("() => document.querySelector('button#search').click()")
                                
                                # 4. Wait for result-box to be visible
                                await page.wait_for_selector("#result-box", state="visible", timeout=20000)
                                await page.wait_for_timeout(500)
                                
                                # 5. Extract results
                                result_html = await page.evaluate("() => document.querySelector('#result').innerHTML")
                                data_records = parse_html_table(result_html)
                                
                                # 6. Save cache file
                                cache_data = {
                                    "subsektor_code": sub_val,
                                    "subsektor_name": sub_name,
                                    "indikator_code": ind_val,
                                    "indikator_name": ind_name,
                                    "prov_code": prov_val,
                                    "prov_name": prov_name,
                                    "data": data_records
                                }
                                with open(cache_filepath, "w", encoding="utf-8") as f:
                                    json.dump(cache_data, f, indent=4)
                                    
                                print(f"      [OK] Successfully scraped and cached.")
                                success = True
                                
                                # 7. Click back button
                                await page.evaluate("() => document.querySelector('button#back').click()")
                                await page.wait_for_selector("select#prov", state="visible", timeout=10000)
                                await page.wait_for_timeout(500)
                                break
                                
                            except Exception as e:
                                print(f"      [WARN] Attempt {attempt+1} failed: {e}")
                                try:
                                    print("      [RECOVER] Reloading page and re-initializing filters...")
                                    await safe_goto(page, "https://bdsp2.pertanian.go.id/bdsp/id/komoditas")
                                    await page.select_option("select#subsektor", sub_val)
                                    await page.wait_for_timeout(2000)
                                    await page.select_option("select#indikator", ind_val)
                                    await page.wait_for_timeout(2000)
                                    await page.select_option("select#level", "02")
                                    await page.wait_for_timeout(2000)
                                except Exception as re:
                                    print(f"      [ERROR] Recovery reload failed: {re}")
                                    
                        if not success:
                            print(f"      [ERROR] All {retries} attempts failed for subsektor={sub_name}, indicator={ind_name}, province={prov_name}. Skipping...")
                            
            await browser.close()
            
    def consolidate_data(self):
        print("\n=== CONSOLIDATING SCRAPED DATA ===")
        all_records = []
        
        if not os.path.exists(self.cache_dir):
            print("Cache directory does not exist! Nothing to consolidate.")
            return
            
        cache_files = [f for f in os.listdir(self.cache_dir) if f.endswith(".json")]
        print(f"Found {len(cache_files)} cached files.")
        
        for file in cache_files:
            filepath = os.path.join(self.cache_dir, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = json.load(f)
                    
                sub_name = content.get("subsektor_name")
                ind_name = content.get("indikator_name")
                prov_name = content.get("prov_name")
                data_list = content.get("data", [])
                
                for item in data_list:
                    commodity = item.get("commodity")
                    unit = item.get("unit")
                    values = item.get("values", {})
                    
                    for year, val in values.items():
                        all_records.append({
                            "subsektor": sub_name,
                            "indikator": ind_name,
                            "provinsi": prov_name,
                            "komoditas": commodity,
                            "satuan": unit,
                            "tahun": int(year),
                            "nilai": val
                        })
            except Exception as e:
                print(f"Error parsing cache file {file}: {e}")
                
        if not all_records:
            print("No records compiled.")
            return
            
        df = pd.DataFrame(all_records)
        output_filepath = os.path.join(self.output_dir, "bdsp_data_consolidated.csv")
        df.to_csv(output_filepath, index=False, encoding="utf-8")
        print(f"Consolidated dataset saved to: {output_filepath}")
        print(f"Total rows: {len(df)}")
        print("Data summary:")
        print(df.head())

def main():
    parser = argparse.ArgumentParser(description="Kementan BDSP Scraper")
    parser.add_argument("--dry-run", action="store_true", help="Run only a small test query")
    parser.add_argument("--consolidate-only", action="store_true", help="Only run data consolidation from existing cache")
    args = parser.parse_args()
    
    scraper = BDSPScraper(dry_run=args.dry_run)
    
    if args.consolidate_only:
        scraper.consolidate_data()
    else:
        asyncio.run(scraper.run())
        scraper.consolidate_data()

if __name__ == "__main__":
    main()
