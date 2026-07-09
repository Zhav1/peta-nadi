"""
PIHPS Full Scraper - Bank Indonesia Portal
Scrape all 7 commodities 2020-2026, download Excel per year, merge to CSV
"""
import sys
import os
import asyncio
import time
import glob
import shutil

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERROR: Run: pip install playwright && playwright install chromium")
    sys.exit(1)

import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "data", "raw", "pihps_bi", "downloads")
OUT_DIR      = os.path.join(BASE_DIR, "data", "raw", "pihps")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

# Target: one sub-variety per commodity (most representative)
KOMODITAS_LIST = [
    "Beras Kualitas Medium I",      # -> Beras
    "Cabai Merah Besar",             # -> Cabai Merah
    "Cabai Rawit Merah",             # -> Cabai Rawit
    "Bawang Merah Ukuran Sedang",    # -> Bawang Merah
    "Bawang Putih Ukuran Sedang",    # -> Bawang Putih
    "Minyak Goreng Curah",           # -> Minyak Goreng
    "Telur Ayam Ras Segar",          # -> Telur Ayam Ras
]

KOMODITAS_FNAME = {
    "Beras Kualitas Medium I":    "01 - Beras - 2020 s.d 23 Jun 2026.csv",
    "Cabai Merah Besar":           "02 - Cabai Merah - 2020 s.d 23 Jun 2026.csv",
    "Cabai Rawit Merah":           "03 - Cabai Rawit - 2020 s.d 23 Jun 2026.csv",
    "Bawang Merah Ukuran Sedang":  "04 - Bawang Merah - 2020 s.d 23 Jun 2026.csv",
    "Bawang Putih Ukuran Sedang":  "05 - Bawang Putih - 2020 s.d 23 Jun 2026.csv",
    "Minyak Goreng Curah":         "06 - Minyak Goreng - 2020 s.d 23 Jun 2026.csv",
    "Telur Ayam Ras Segar":        "07 - Telur Ayam Ras - 2020 s.d 23 Jun 2026.csv",
}

# Date ranges per year
DATE_RANGES = [
    ("01/01/2020", "31/12/2020"),
    ("01/01/2021", "31/12/2021"),
    ("01/01/2022", "31/12/2022"),
    ("01/01/2023", "31/12/2023"),
    ("01/01/2024", "31/12/2024"),
    ("01/01/2025", "31/12/2025"),
    ("01/01/2026", "23/06/2026"),
]

PROVINCE_MAP = {
    'Aceh': 'Aceh', 'Sumatera Utara': 'Sumatera Utara', 'Sumatera Barat': 'Sumatera Barat',
    'Riau': 'Riau', 'Jambi': 'Jambi', 'Sumatera Selatan': 'Sumatera Selatan',
    'Bengkulu': 'Bengkulu', 'Lampung': 'Lampung', 'Kepulauan Bangka Belitung': 'Kepulauan Bangka Belitung',
    'Kepulauan Riau': 'Kepulauan Riau', 'DKI Jakarta': 'DKI Jakarta', 'Jawa Barat': 'Jawa Barat',
    'Jawa Tengah': 'Jawa Tengah', 'DI Yogyakarta': 'DI Yogyakarta', 'Jawa Timur': 'Jawa Timur',
    'Banten': 'Banten', 'Bali': 'Bali', 'Nusa Tenggara Barat': 'Nusa Tenggara Barat',
    'Nusa Tenggara Timur': 'Nusa Tenggara Timur', 'Kalimantan Barat': 'Kalimantan Barat',
    'Kalimantan Tengah': 'Kalimantan Tengah', 'Kalimantan Selatan': 'Kalimantan Selatan',
    'Kalimantan Timur': 'Kalimantan Timur', 'Kalimantan Utara': 'Kalimantan Utara',
    'Sulawesi Utara': 'Sulawesi Utara', 'Sulawesi Tengah': 'Sulawesi Tengah',
    'Sulawesi Selatan': 'Sulawesi Selatan', 'Sulawesi Tenggara': 'Sulawesi Tenggara',
    'Gorontalo': 'Gorontalo', 'Sulawesi Barat': 'Sulawesi Barat',
    'Maluku': 'Maluku', 'Maluku Utara': 'Maluku Utara', 'Papua Barat': 'Papua Barat', 'Papua': 'Papua',
}

async def select_devexpress_dropdown(page, dropdown_selector_or_label, option_text):
    """Click a DevExpress dropdown and select an option by text."""
    # Find the dropdown container - DevExpress uses dxSelectBox or similar
    # Try clicking on the dropdown using text content
    try:
        # Method 1: Find by aria-label or placeholder
        dropdown = await page.query_selector(f'[aria-label*="{dropdown_selector_or_label}"], [placeholder*="{dropdown_selector_or_label}"]')
        if dropdown:
            await dropdown.click()
            await page.wait_for_timeout(800)
        
        # Method 2: Find option in dropdown list
        option = await page.query_selector(f'.dx-list-item:has-text("{option_text}"), .dx-item:has-text("{option_text}")')
        if option:
            await option.click()
            await page.wait_for_timeout(500)
            return True
        
        # Method 3: Use keyboard or JS
        items = await page.query_selector_all('.dx-list-item, .dx-item, li')
        for item in items:
            text = (await item.text_content() or '').strip()
            if text == option_text:
                await item.click()
                await page.wait_for_timeout(500)
                return True
    except Exception as e:
        print(f"  Warning: dropdown selection error: {e}")
    return False

async def fill_date_input(page, label_text, date_str):
    """Fill date input field near a label with given text."""
    try:
        # Find input near the label
        label = await page.query_selector(f'label:has-text("{label_text}"), span:has-text("{label_text}")')
        if label:
            # Get sibling or child input
            parent = await label.evaluate_handle('el => el.parentElement')
            inp = await parent.query_selector('input')
            if inp:
                await inp.triple_click()
                await inp.type(date_str, delay=50)
                await page.wait_for_timeout(300)
                return True
        
        # Fallback: find by placeholder
        inp = await page.query_selector(f'input[placeholder*="Tanggal"], input[id*="date"], input[name*="date"]')
        if inp:
            await inp.triple_click()
            await inp.type(date_str, delay=50)
            return True
    except Exception as e:
        print(f"  Warning: date fill error: {e}")
    return False

async def scrape_commodity_year(page, commodity_name, date_start, date_end, download_context):
    """Scrape one commodity for one year range. Returns downloaded file path."""
    print(f"  Scraping: {commodity_name} | {date_start} - {date_end}")
    
    # Navigate fresh each time to reset state
    url = "https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah"
    await page.goto(url, wait_until='networkidle', timeout=30000)
    await page.wait_for_timeout(3000)
    
    # === Select Commodity ===
    # DevExpress dropdowns - find by looking at visible dropdown containers
    # First, let's get all clickable elements with the commodity names
    
    # Find commodity dropdown (typically a dxSelectBox)
    # Click the commodity dropdown
    komoditas_dropdown = None
    
    # Try to find dropdown by inspecting the DOM
    all_dropdowns = await page.query_selector_all('.dx-selectbox, .dx-dropdowneditor, [role="combobox"]')
    print(f"    Found {len(all_dropdowns)} DevExpress dropdowns")
    
    if all_dropdowns:
        # First dropdown is usually commodity
        await all_dropdowns[0].click()
        await page.wait_for_timeout(1000)
        
        # Find and click the target commodity option
        popup_items = await page.query_selector_all('.dx-list-item, .dx-popup-content .dx-item')
        print(f"    Dropdown items: {len(popup_items)}")
        
        clicked = False
        for item in popup_items:
            text = (await item.text_content() or '').strip()
            if text == commodity_name:
                await item.click()
                await page.wait_for_timeout(500)
                clicked = True
                print(f"    Selected commodity: {commodity_name}")
                break
        
        if not clicked:
            # Try scrolling to find item
            for item in popup_items:
                text = (await item.text_content() or '').strip()
                print(f"      Available: {text}")
            print(f"    WARNING: Could not find '{commodity_name}' in dropdown")
            # Close dropdown by pressing Escape
            await page.keyboard.press('Escape')
            return None
    
    # === Set Date Range ===
    # Find date inputs
    date_inputs = await page.query_selector_all('input.dx-texteditor-input, input[type="text"]')
    print(f"    Found {len(date_inputs)} text inputs")
    
    # Usually tanggal mulai is the 3rd or 4th input, tanggal selesai is next
    # Let's check all inputs
    for i, inp in enumerate(date_inputs):
        placeholder = await inp.get_attribute('placeholder') or ''
        val = await inp.get_attribute('value') or ''
        role = await inp.get_attribute('role') or ''
        id_attr = await inp.get_attribute('id') or ''
        print(f"    Input[{i}]: placeholder='{placeholder}', value='{val}', id='{id_attr}'")
    
    # Find the date inputs by looking at page context
    # On the BI PIHPS page, there should be "Tanggal Mulai" and "Tanggal Selesai"
    # These are likely DevExpress DateBox components
    date_boxes = await page.query_selector_all('.dx-datebox, [id*="date"], [id*="Date"]')
    print(f"    DateBox elements: {len(date_boxes)}")
    
    # Set Tanggal Mulai
    page_html = await page.content()
    
    # Use JS to set DevExpress component values
    # This is more reliable than UI interaction for DevExpress
    set_date_result = await page.evaluate(f"""
        () => {{
            // Find all dxDateBox instances
            var dateBoxes = [];
            document.querySelectorAll('.dx-datebox').forEach(function(el) {{
                var instance = $(el).dxDateBox('instance');
                if (instance) dateBoxes.push(instance);
            }});
            
            if (dateBoxes.length >= 2) {{
                // Parse dates
                var parts1 = '{date_start}'.split('/');
                var startDate = new Date(parts1[2], parts1[1]-1, parts1[0]);
                var parts2 = '{date_end}'.split('/');
                var endDate = new Date(parts2[2], parts2[1]-1, parts2[0]);
                
                dateBoxes[0].option('value', startDate);
                dateBoxes[1].option('value', endDate);
                return 'OK: set ' + dateBoxes.length + ' datebox(es)';
            }}
            return 'FAIL: found ' + dateBoxes.length + ' datebox(es)';
        }}
    """)
    print(f"    Date set result: {set_date_result}")
    await page.wait_for_timeout(500)
    
    # Click "Lihat Laporan" button
    lihat_btn = await page.query_selector('button:has-text("Lihat Laporan"), input[value*="Lihat"], a:has-text("Lihat Laporan")')
    if not lihat_btn:
        # Try by class or ID
        lihat_btn = await page.query_selector('[id*="btnLihat"], [id*="btnView"], .btn-primary:has-text("Lihat")')
    if lihat_btn:
        await lihat_btn.click()
        print(f"    Clicked 'Lihat Laporan'")
        await page.wait_for_timeout(4000)  # Wait for report to load
    else:
        print("    WARNING: Could not find 'Lihat Laporan' button")
        # List all buttons
        all_btns = await page.query_selector_all('button, input[type="button"], input[type="submit"]')
        for btn in all_btns:
            text = await btn.text_content()
            print(f"      Button: '{text}'")
    
    # === Download Excel ===
    download_btn = await page.query_selector('.btn-success:has-text("Download"), button:has-text("Download"), a:has-text("Download")')
    if download_btn:
        # Set up download handler
        async with page.expect_download(timeout=15000) as dl_info:
            await download_btn.click()
        download = await dl_info.value
        
        # Save the file
        safe_date = date_start.replace('/', '-')
        save_name = f"{commodity_name.replace(' ', '_')}_{safe_date}.xlsx"
        save_path = os.path.join(DOWNLOAD_DIR, save_name)
        await download.save_as(save_path)
        print(f"    Downloaded: {save_name}")
        return save_path
    else:
        print("    WARNING: Could not find Download button")
        return None

def parse_excel_to_long(excel_path, commodity_name):
    """Parse the downloaded Excel file to long format (provinsi, tanggal, harga_rp)."""
    try:
        df = pd.read_excel(excel_path, header=None)
        print(f"  Parsing {os.path.basename(excel_path)}: shape {df.shape}")
        
        # Standard format: 
        # Row 0: headers (No, Komoditas (Rp), date1, date2, ...)
        # Row 1+: data rows (number, province, price1, price2, ...)
        
        # Find header row
        header_row = 0
        for i in range(min(5, len(df))):
            row = df.iloc[i].astype(str)
            if any('/' in str(v) and len(str(v)) == 10 for v in row):
                header_row = i
                break
        
        headers = df.iloc[header_row].tolist()
        data = df.iloc[header_row+1:].reset_index(drop=True)
        
        # Find province column (usually column 1)
        prov_col_idx = 1
        # Find date columns (columns with date-like headers)
        date_cols = []
        for i, h in enumerate(headers):
            h_str = str(h).strip()
            # Check if it looks like a date
            if '/' in h_str and len(h_str.replace(' ', '')) >= 8:
                try:
                    pd.to_datetime(h_str, format='%d/ %m/ %Y')
                    date_cols.append((i, h_str))
                except:
                    try:
                        pd.to_datetime(h_str.replace(' ', ''), format='%d/%m/%Y')
                        date_cols.append((i, h_str))
                    except:
                        pass
        
        print(f"  Found {len(date_cols)} date columns")
        if not date_cols:
            # Try alternative parsing
            for i, h in enumerate(headers):
                h_str = str(h).strip()
                if i >= 2 and h_str not in ['nan', 'None', '']:
                    date_cols.append((i, h_str))
        
        records = []
        for _, row in data.iterrows():
            prov = str(row.iloc[prov_col_idx]).strip() if len(row) > prov_col_idx else ''
            if prov in ('nan', 'None', '', 'NaN') or prov not in PROVINCE_MAP:
                continue
            prov_norm = PROVINCE_MAP[prov]
            
            for col_idx, date_str in date_cols:
                if col_idx >= len(row):
                    continue
                price = row.iloc[col_idx]
                if pd.isna(price) or str(price).strip() in ('-', '', 'nan', 'None'):
                    continue
                try:
                    price_float = float(str(price).replace(',', '').strip())
                    if price_float <= 0:
                        continue
                    # Parse date
                    date_parsed = pd.to_datetime(date_str.replace(' ', ''), format='%d/%m/%Y')
                    records.append({
                        'provinsi': prov_norm,
                        'tanggal': date_parsed.strftime('%Y-%m-%d'),
                        'harga_rp': price_float
                    })
                except Exception as e:
                    continue
        
        return pd.DataFrame(records)
    except Exception as e:
        print(f"  ERROR parsing {excel_path}: {e}")
        return pd.DataFrame()

async def main():
    print("=" * 60)
    print("BI PIHPS Full Scraper - All Commodities 2020-2026")
    print("=" * 60)
    
    all_downloaded = {}  # commodity -> list of excel paths
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            slow_mo=200,
        )
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        # First probe to understand page structure
        await page.goto(
            "https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah",
            wait_until='networkidle', timeout=30000
        )
        await page.wait_for_timeout(3000)
        
        # Inspect DevExpress dropdowns structure
        dropdown_info = await page.evaluate("""
            () => {
                var result = [];
                document.querySelectorAll('.dx-selectbox').forEach(function(el, i) {
                    var val = '';
                    try { val = $(el).dxSelectBox('instance').option('value'); } catch(e) {}
                    result.push({
                        index: i,
                        id: el.id,
                        class: el.className,
                        value: val
                    });
                });
                return result;
            }
        """)
        print(f"\nDevExpress SelectBoxes found: {len(dropdown_info)}")
        for d in dropdown_info:
            print(f"  [{d['index']}] id={d['id']}, value={d['value']}")
        
        # Get commodity options
        commodity_options = await page.evaluate("""
            () => {
                var items = [];
                document.querySelectorAll('.dx-selectbox').forEach(function(el, i) {
                    if (i === 0) {  // First dropdown = commodity
                        try {
                            var inst = $(el).dxSelectBox('instance');
                            var ds = inst.option('dataSource');
                            if (ds && ds.length) {
                                ds.forEach(function(item) {
                                    items.push(typeof item === 'string' ? item : JSON.stringify(item));
                                });
                            }
                        } catch(e) { items.push('error: ' + e.message); }
                    }
                });
                return items;
            }
        """)
        print(f"\nCommodity options from dataSource: {commodity_options[:20]}")
        
        # Get all list items currently visible or in dropdowns
        list_items = await page.evaluate("""
            () => {
                var items = [];
                document.querySelectorAll('.dx-list-item, .dx-dropdownlist-popup-wrapper .dx-item').forEach(function(el) {
                    items.push(el.textContent.trim());
                });
                return items;
            }
        """)
        print(f"List items visible: {list_items[:20]}")
        
        # Try clicking first dropdown to see options
        first_dropdown = await page.query_selector('.dx-selectbox')
        if first_dropdown:
            await first_dropdown.click()
            await page.wait_for_timeout(1500)
            
            popup_items = await page.query_selector_all('.dx-overlay-wrapper .dx-list-item, .dx-popup .dx-item')
            print(f"\nDropdown popup items after click: {len(popup_items)}")
            popup_texts = []
            for item in popup_items:
                text = (await item.text_content() or '').strip()
                popup_texts.append(text)
            print(f"Options: {popup_texts[:30]}")
            
            # Now close without selecting
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(500)
        
        # Now scrape each commodity
        for commodity_name in KOMODITAS_LIST:
            print(f"\n{'='*50}")
            print(f"Processing: {commodity_name}")
            downloaded_files = []
            
            for date_start, date_end in DATE_RANGES:
                try:
                    filepath = await scrape_commodity_year(page, commodity_name, date_start, date_end, context)
                    if filepath:
                        downloaded_files.append((filepath, date_start, date_end))
                        print(f"  OK: {date_start} - {date_end}")
                    else:
                        print(f"  FAILED: {date_start} - {date_end}")
                    await asyncio.sleep(2)
                except Exception as e:
                    print(f"  ERROR {date_start}: {e}")
                    await asyncio.sleep(3)
            
            all_downloaded[commodity_name] = downloaded_files
        
        await browser.close()
    
    # ── Parse and merge all downloaded files ───────────────────────────────────
    print("\n\nParsing downloaded Excel files...")
    
    for commodity_name, files_list in all_downloaded.items():
        if not files_list:
            print(f"  No files for {commodity_name}")
            continue
        
        frames = []
        for filepath, ds, de in files_list:
            df_parsed = parse_excel_to_long(filepath, commodity_name)
            if not df_parsed.empty:
                frames.append(df_parsed)
                print(f"  Parsed {os.path.basename(filepath)}: {len(df_parsed)} records")
        
        if frames:
            merged = pd.concat(frames, ignore_index=True)
            merged = merged.drop_duplicates(subset=['provinsi', 'tanggal'])
            merged = merged.sort_values(['provinsi', 'tanggal'])
            
            out_fname = KOMODITAS_FNAME[commodity_name]
            out_path = os.path.join(OUT_DIR, out_fname)
            merged.to_csv(out_path, index=False)
            
            cv = merged['harga_rp'].std() / merged['harga_rp'].mean() * 100
            print(f"  SAVED {out_fname}: {len(merged)} records, {merged['provinsi'].nunique()} provinces, CV={cv:.1f}%")
        else:
            print(f"  No data parsed for {commodity_name}")
    
    print("\n\nDone! Check data/raw/pihps/ for updated CSV files.")

if __name__ == "__main__":
    if sys.platform == 'win32':
        loop = asyncio.ProactorEventLoop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main())
        loop.close()
    else:
        asyncio.run(main())
