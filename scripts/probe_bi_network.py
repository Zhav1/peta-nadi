"""
BI PIHPS - Network Intercept Approach
1. Intercept the download API call when Download button is clicked
2. Find the endpoint + parameters
3. Replay with different commodity/date parameters
"""
import sys
import os
import asyncio
import json

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERROR: playwright not installed")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE_DIR, "data", "raw", "pihps_bi")
os.makedirs(OUT_DIR, exist_ok=True)

captured_requests = []

async def probe_network():
    print("Probing BI PIHPS network requests...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, slow_mo=300)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        # Intercept ALL requests
        async def on_request(req):
            url = req.url
            method = req.method
            if any(kw in url.lower() for kw in ['api', 'data', 'export', 'excel', 'download', 'report', 'harga']):
                captured_requests.append({'url': url, 'method': method, 'post': req.post_data})
                print(f"  [REQ] {method} {url}")
                if req.post_data:
                    print(f"       POST: {req.post_data[:200]}")

        async def on_response(resp):
            url = resp.url
            ct = resp.headers.get('content-type', '')
            if any(kw in url.lower() for kw in ['api', 'data', 'export', 'excel', 'download', 'report']):
                print(f"  [RESP] {resp.status} {url} | Content-Type: {ct}")

        page.on('request', on_request)
        page.on('response', on_response)

        print("\nLoading page...")
        await page.goto(
            "https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah",
            wait_until='networkidle', timeout=30000
        )
        await page.wait_for_timeout(3000)

        # Get full page HTML to inspect structure
        html = await page.content()
        # Save for inspection
        with open(os.path.join(OUT_DIR, "page_source.html"), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"Page HTML saved: {len(html)} chars")

        # Find ALL input IDs, select IDs
        all_inputs = await page.evaluate("""
            () => {
                var result = [];
                document.querySelectorAll('input, select, textarea').forEach(function(el) {
                    result.push({
                        tag: el.tagName,
                        id: el.id,
                        name: el.name,
                        type: el.type,
                        value: el.value,
                        placeholder: el.placeholder,
                        class: el.className.substring(0, 80)
                    });
                });
                return result;
            }
        """)
        print(f"\nAll form elements ({len(all_inputs)}):")
        for el in all_inputs:
            print(f"  <{el['tag']}> id='{el['id']}' name='{el['name']}' type='{el['type']}' value='{el['value']}' placeholder='{el['placeholder']}'")

        # Find ALL buttons and their onclick
        all_btns = await page.evaluate("""
            () => {
                var result = [];
                document.querySelectorAll('button, a.btn, input[type="button"], input[type="submit"]').forEach(function(el) {
                    result.push({
                        tag: el.tagName,
                        id: el.id,
                        text: el.textContent.trim().substring(0, 50),
                        href: el.href || '',
                        onclick: (el.getAttribute('onclick') || '').substring(0, 200),
                        class: el.className.substring(0, 80)
                    });
                });
                return result;
            }
        """)
        print(f"\nAll buttons ({len(all_btns)}):")
        for btn in all_btns:
            print(f"  <{btn['tag']}> id='{btn['id']}' text='{btn['text']}' onclick='{btn['onclick']}' class='{btn['class']}'")

        # Find DevExpress widgets
        dx_info = await page.evaluate("""
            () => {
                var result = {};
                // Find all dx widget instances via jQuery
                if (typeof $ !== 'undefined') {
                    $('[id]').each(function() {
                        var el = $(this);
                        var data = $._data(this, 'dxComponents');
                        if (data && Object.keys(data).length > 0) {
                            result[this.id] = Object.keys(data);
                        }
                    });
                }
                return result;
            }
        """)
        print(f"\nDevExpress widgets by ID: {json.dumps(dx_info, indent=2)}")

        # Look for cboCommodity or similar
        commodity_ids = await page.evaluate("""
            () => {
                var ids = [];
                document.querySelectorAll('[id*="cbo"], [id*="Commodity"], [id*="komoditas"], [id*="Komoditas"], [id*="commodity"]').forEach(function(el) {
                    ids.push({id: el.id, tag: el.tagName, class: el.className.substring(0,50)});
                });
                return ids;
            }
        """)
        print(f"\nPotential commodity elements: {commodity_ids}")

        # Click "Lihat Laporan" to trigger a data load and capture requests
        print("\nClicking 'Lihat Laporan' to capture data request...")
        lihat_btn = await page.query_selector('button:has-text("Lihat Laporan"), a:has-text("Lihat Laporan"), input[value*="Lihat"]')
        if not lihat_btn:
            # Try all buttons
            btns = await page.query_selector_all('button')
            for b in btns:
                t = await b.text_content()
                print(f"  Button: '{t}'")
                if 'lihat' in (t or '').lower():
                    lihat_btn = b
                    break
        
        if lihat_btn:
            await lihat_btn.click()
            await page.wait_for_timeout(4000)
            print("Clicked Lihat Laporan")
        else:
            print("WARNING: Could not find Lihat Laporan button")

        # Try clicking download
        print("\nClicking 'Download' to capture download request...")
        download_btn = await page.query_selector('.btn-success')
        if download_btn:
            text = await download_btn.text_content()
            print(f"  Found btn: '{text}'")
            onclick = await download_btn.get_attribute('onclick')
            print(f"  onclick: {onclick}")
            
            # Try to get the download URL before clicking
            href = await download_btn.get_attribute('href')
            print(f"  href: {href}")
            
            # Click and capture download
            try:
                async with page.expect_download(timeout=10000) as dl:
                    await download_btn.click()
                download = await dl.value
                save_path = os.path.join(OUT_DIR, "test_download.xlsx")
                await download.save_as(save_path)
                print(f"  DOWNLOAD SUCCESS: {save_path}")
            except Exception as e:
                print(f"  Download click result: {e}")
        else:
            print("  No .btn-success found")

        print(f"\n\nAll captured API requests ({len(captured_requests)}):")
        for r in captured_requests:
            print(f"  {r['method']} {r['url']}")
            if r['post']:
                print(f"    POST data: {r['post'][:300]}")

        await browser.close()

def main():
    if sys.platform == 'win32':
        loop = asyncio.ProactorEventLoop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(probe_network())
        loop.close()
    else:
        asyncio.run(probe_network())

if __name__ == "__main__":
    main()
