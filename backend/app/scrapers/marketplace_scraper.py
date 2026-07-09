import asyncio
import logging
import random
import json
from datetime import datetime, timezone
from typing import List, Dict, Any

from playwright.async_api import async_playwright
from app.scrapers.base_scraper import BaseScraper
from app.services.redis_client import STREAM_PIHPS
from app.config import get_settings

logger = logging.getLogger(__name__)

# Default fallback prices in case scraping is blocked
DEFAULT_MARKETPLACE_DATA = [
    {
        "commodity": "minyak_goreng",
        "product_name": "Minyak Goreng SunCo 2L",
        "price": 38500.0,
        "seller": "Sumatera Jaya Utama",
        "market": "Tokopedia Medan"
    },
    {
        "commodity": "minyak_goreng",
        "product_name": "Bimoli Minyak Goreng Klasik 2L",
        "price": 39000.0,
        "seller": "Toko Berkah Medan",
        "market": "Tokopedia Medan"
    },
    {
        "commodity": "beras",
        "product_name": "Beras Premium Anak Raja 5kg",
        "price": 72500.0,
        "seller": "Distributor Beras Sumut",
        "market": "Tokopedia Medan"
    },
    {
        "commodity": "beras",
        "product_name": "Beras Ramos Cap Topi Koki 5kg",
        "price": 74000.0,
        "seller": "Sembako Murah Medan",
        "market": "Tokopedia Medan"
    }
]

class MarketplaceScraper(BaseScraper):
    source_name = "marketplace"
    stream_key = STREAM_PIHPS
    normal_interval_seconds = 86400  # 24 hours
    crisis_interval_seconds = 3600   # 1 hour (best-effort, less frequent to avoid blocks)

    def __init__(self):
        super().__init__()

    async def fetch(self) -> List[Dict[str, Any]]:
        """Fetch search result prices from Tokopedia via Playwright/Lightpanda."""
        settings = get_settings()
        scraped_products = []
        
        # Connect to Lightpanda over CDP if configured, otherwise use local headless chromium
        playwright_args = {}
        use_cdp = bool(settings.lightpanda_url)
        
        logger.info(f"Starting marketplace scrape. Mode: {'Lightpanda CDP' if use_cdp else 'Local Chromium'}")
        
        try:
            async with async_playwright() as p:
                if use_cdp:
                    browser = await p.chromium.connect_over_cdp(settings.lightpanda_url)
                    context = browser.contexts[0]
                    page = context.pages[0]
                else:
                    browser = await p.chromium.launch(headless=True)
                    context = await browser.new_context()
                    page = await context.new_page()

                # User-Agent to decrease bot flags
                await page.set_extra_http_headers({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                })

                # Target search terms
                search_queries = [
                    ("minyak_goreng", "minyak goreng 2l medan"),
                    ("beras", "beras 5kg medan")
                ]

                for commodity, query in search_queries:
                    # Tokopedia search URL
                    url = f"https://www.tokopedia.com/search?q={query.replace(' ', '%20')}"
                    logger.debug(f"Navigating to Tokopedia search: {url}")
                    
                    try:
                        # Fail fast if page hangs (common with bot detection)
                        await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                        await page.wait_for_timeout(3000)  # wait for JS cards to load

                        # Check for bot challenge/captcha
                        content = await page.content()
                        if "captcha" in content.lower() or "challenge" in content.lower() or "blocked" in content.lower():
                            logger.warning(f"Bot detection triggered on Tokopedia for query '{query}'")
                            raise RuntimeError("Bot detection triggered")

                        # Extract product cards (class name pattern for Tokopedia grid cards)
                        cards = await page.query_selector_all('[data-testid="lstCL2ProductLnk"]')
                        if not cards:
                            # Try general selector fallback
                            cards = await page.query_selector_all('.css-llwpvs, .css-1asz3by, .css-545233')
                            
                        logger.debug(f"Found {len(cards)} product elements on search page")

                        count = 0
                        for card in cards:
                            if count >= 3:  # Only take top 3 results per query to be polite
                                break

                            # Get price, title, seller
                            title_el = await card.query_selector('[data-testid="spnSRPProdName"]')
                            if not title_el:
                                title_el = await card.query_selector('.css-1bj3vn8, .css-h66vki')
                            
                            price_el = await card.query_selector('[data-testid="spnSRPProdPrice"]')
                            if not price_el:
                                price_el = await card.query_selector('.css-o5u40x, .css-1ksb19c')

                            shop_el = await card.query_selector('.css-1rn01z5, .css-1kr22w3')

                            if title_el and price_el:
                                title = (await title_el.text_content() or '').strip()
                                price_str = (await price_el.text_content() or '').strip()
                                shop = (await shop_el.text_content() or '').strip() if shop_el else "Official Store"
                                
                                # Clean price string (e.g. "Rp38.500" -> 38500.0)
                                clean_price = float(re.sub(r'[^\d]', '', price_str))
                                
                                scraped_products.append({
                                    "commodity": commodity,
                                    "product_name": title,
                                    "price": clean_price,
                                    "seller": shop,
                                    "market": "Tokopedia Medan"
                                })
                                count += 1
                                
                    except Exception as e:
                        logger.error(f"Failed to scrape Tokopedia query '{query}': {e}")
                        # Keep scraping other terms or raise to trigger fallback
                        continue

                await browser.close()
                
        except Exception as e:
            logger.error(f"Error in Playwright Tokopedia browser context: {e}")
            # Raise exception to trigger the BaseAdapter's degraded/fallback logic
            raise RuntimeError("Marketplace scraper failed to execute browser session") from e

        # If we failed to get any products, raise error to trigger fallback
        if not scraped_products:
            raise RuntimeError("Scrape returned 0 products from Tokopedia")

        return scraped_products

    async def parse(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Parse raw product prices into comparison price events."""
        events = []
        
        # Group by commodity
        by_commodity = {}
        for item in raw_data:
            comm = item["commodity"]
            if comm not in by_commodity:
                by_commodity[comm] = []
            by_commodity[comm].append(item["price"])

        for comm, prices in by_commodity.items():
            median_price = sorted(prices)[len(prices)//2]
            dedup_key = f"market:{comm}:{datetime.now(timezone.utc).strftime('%Y%m%d')}"
            
            events.append({
                "source": "marketplace",
                "event_type": "market_comparison",
                "severity": "low",
                "lat": "3.5952",
                "lon": "98.6722",
                "title": f"Market price update for {comm}: Median Rp {median_price:,.0f} (Tokopedia)",
                "raw": json.dumps({
                    "commodity": comm,
                    "median_price": median_price,
                    "sample_size": len(prices),
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }),
                "ts": datetime.now(timezone.utc).isoformat(),
                "dedup_key": dedup_key
            })

        return events

    async def health_check(self) -> bool:
        """Verify Tokopedia homepage is reachable."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.head("https://www.tokopedia.com", timeout=5)
                return resp.status_code in (200, 301, 302, 403) # 403 is fine, means CDN blocked HEAD but server is up
        except Exception:
            return False

    def get_cached_events(self) -> List[Dict[str, Any]]:
        """Override to supply synthetic fallback data if cache is empty."""
        cached = super().get_cached_events()
        if cached:
            return cached

        # Generate fresh simulated comparison events
        events = []
        for comm in ["minyak_goreng", "beras"]:
            matching = [item["price"] for item in DEFAULT_MARKETPLACE_DATA if item["commodity"] == comm]
            median = sorted(matching)[len(matching)//2]
            
            events.append({
                "source": "marketplace",
                "event_type": "market_comparison",
                "severity": "low",
                "lat": "3.5952",
                "lon": "98.6722",
                "title": f"Market price update for {comm}: Median Rp {median:,.0f} (Tokopedia Fallback)",
                "raw": json.dumps({
                    "commodity": comm,
                    "median_price": median,
                    "sample_size": len(matching),
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }),
                "ts": datetime.now(timezone.utc).isoformat(),
                "dedup_key": f"market:{comm}:{datetime.now(timezone.utc).strftime('%Y%m%d')}"
            })
        return events

import re
