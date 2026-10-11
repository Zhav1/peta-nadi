import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

import httpx
from app.scrapers.base_scraper import BaseScraper
from app.services.redis_client import STREAM_PIHPS, get_redis
from app.db.supabase_client import get_client, get_service_client

logger = logging.getLogger(__name__)

REGION = "north_sumatra"


def _get_write_client():
    """
    Supabase client for ingestion writes: prefer the service-role client
    (bypasses Row Level Security), falling back to the shared anon client
    when no service key is configured.
    """
    try:
        return get_service_client()
    except Exception:
        return get_client()


COMCAT_IDS = {
    "beras": "com_3",
    "cabai_merah": "com_13",
    "cabai_rawit": "com_16",
    "bawang_merah": "com_11",
    "bawang_putih": "com_12",
    "minyak_goreng": "com_17",
    "telur_ayam": "com_10",
}

SUMUT_PROVINCE_ID = 2

class PIHPSScraper(BaseScraper):
    source_name = "pihps"
    stream_key = STREAM_PIHPS
    normal_interval_seconds = 86400  # 24 hours
    crisis_interval_seconds = 900    # 15 minutes

    def __init__(self):
        super().__init__()

    def parse_period_to_date(self, period_str: str) -> Optional[str]:
        """
        Parse period strings like 'Jan 2026 (I)', 'Des 2025 (II)' to ISO date format.
        BI uses weekly numbering within a month.
        """
        months_map = {
            'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'Mei': 5, 'Jun': 6,
            'Jul': 7, 'Agu': 8, 'Sep': 9, 'Okt': 10, 'Nov': 11, 'Des': 12,
            'May': 5, 'Aug': 8, 'Oct': 10, 'Dec': 12,
        }
        week_days = {'I': 4, 'II': 11, 'III': 18, 'IV': 25, 'V': 29}

        pattern = r'(\w+)\s+(\d{4})\s+\((\w+)\)'
        m = re.match(pattern, str(period_str).strip())
        if m:
            mon_str, yr_str, week_str = m.groups()
            month = months_map.get(mon_str, 1)
            year = int(yr_str)
            day = week_days.get(week_str, 15)
            try:
                return datetime(year, month, min(day, 28)).strftime('%Y-%m-%d')
            except Exception:
                return None
        return None

    async def fetch(self) -> Dict[str, Any]:
        """Fetch data from Bank Indonesia PIHPS API for all commodities in Sumatera Utara."""
        results = {}
        # Fetch prices for the last 30 days to build/seed the baseline if empty
        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=30)
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
        }

        async with httpx.AsyncClient(follow_redirects=True) as client:
            for com_name, comcat_id in COMCAT_IDS.items():
                params = {
                    'price_type_id': 1,
                    'comcat_id': comcat_id,
                    'province_id': SUMUT_PROVINCE_ID,
                    'regency_id': '',
                    'market_id': '',
                    'tipe_laporan': 2,  # Weekly
                    'start_date': start_date.strftime('%Y-%m-%d'),
                    'end_date': end_date.strftime('%Y-%m-%d'),
                    '_': int(time.time() * 1000)
                }
                
                url = "https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah"
                try:
                    logger.debug(f"Fetching PIHPS for {com_name} ({comcat_id})")
                    resp = await client.get(url, params=params, headers=headers, timeout=20)
                    if resp.status_code == 200:
                        results[com_name] = resp.json()
                    else:
                        logger.warning(f"Failed to fetch PIHPS for {com_name}: status {resp.status_code}")
                except Exception as e:
                    logger.error(f"Error fetching PIHPS for {com_name}: {e}")
                
                # Small courtesy sleep to not trigger anti-dos on BI server
                await asyncio.sleep(0.5)

        return results

    async def parse(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Normalize raw price readings and detect spikes against the rolling baseline."""
        events = []
        r = get_redis()

        for com_name, data_payload in raw_data.items():
            rows = data_payload.get('data', []) if isinstance(data_payload, dict) else data_payload
            if not rows:
                continue

            # Prefer the commodity detail row (level 2, e.g. "Beras Kualitas Medium I")
            com_row = None
            for row in rows:
                if isinstance(row, dict) and str(row.get('level')) == '2':
                    com_row = row
                    break

            if com_row is None:
                # Some commodities (e.g. cabai_merah) only expose the province-level
                # aggregate row (level 1, e.g. "Cabai Merah") with no level-2 detail row.
                first_row = rows[0] if rows and isinstance(rows[0], dict) else None
                if first_row is not None and str(first_row.get('level')) == '1':
                    logger.warning(
                        f"No level-2 PIHPS row for {com_name}; falling back to province-level "
                        f"aggregate row '{first_row.get('name')}' (level 1)"
                    )
                    com_row = first_row
                else:
                    logger.warning(f"No usable PIHPS commodity row for {com_name}; skipping")
                    continue

            # Extract date columns
            period_cols = [k for k in com_row.keys() if re.match(r'\w+ \d{4} \(', k)]
            price_readings = []

            for col in period_cols:
                val_str = str(com_row[col]).replace(',', '').strip()
                if val_str in ('-', '', 'nan', 'None', '0'):
                    continue
                try:
                    price = float(val_str)
                    date_str = self.parse_period_to_date(col)
                    if price > 0 and date_str:
                        price_readings.append({"date": date_str, "price": price, "period": col})
                except ValueError:
                    continue

            # Sort price readings by date ascending
            price_readings.sort(key=lambda x: x["date"])
            if not price_readings:
                continue

            # Persist every per-period price point (idempotent; never raises)
            await self.persist_price_points(
                com_name,
                price_readings,
                row_name=com_row.get("name"),
                level=com_row.get("level"),
            )

            # Retrieve rolling history from Redis
            redis_key = f"lrip:pihps:rolling:{com_name}"
            try:
                history_raw = r.get(redis_key)
                history = json.loads(history_raw) if history_raw else []
            except Exception as e:
                logger.error(f"Failed to load PIHPS history for {com_name}: {e}")
                history = []

            # Populate history with prior readings if empty
            if not history and len(price_readings) > 1:
                # Use up to 7 oldest readings to seed baseline (leaving the latest one for evaluation)
                history = [p["price"] for p in price_readings[:-1]][-7:]
                try:
                    r.set(redis_key, json.dumps(history), ex=86400 * 10)
                except Exception as e:
                    logger.error(f"Failed to seed baseline in Redis: {e}")

            # Process the latest reading
            latest_date, latest_price = price_readings[-1]["date"], price_readings[-1]["price"]
            dedup_key = f"pihps:{com_name}:sumut:{latest_date.replace('-', '')}"

            # Check if this reading has already been published/processed
            try:
                if r.get(f"lrip:dedup:pihps:{dedup_key}"):
                    logger.debug(f"Reading {dedup_key} already processed. Skipping.")
                    continue
                # Set dedup key with 2-day TTL
                r.set(f"lrip:dedup:pihps:{dedup_key}", "1", ex=172800)
            except Exception as e:
                logger.error(f"Failed to check/set dedup key in Redis: {e}")

            # Check for spike against baseline
            severity = "low"
            event_type = "price_baseline"
            rolling_mean = sum(history) / len(history) if history else latest_price
            deviation = (latest_price - rolling_mean) / rolling_mean if rolling_mean > 0 else 0.0

            if deviation >= 0.15:
                severity = "critical"
                event_type = "price_spike"
            elif deviation >= 0.05:
                severity = "high"
                event_type = "price_spike"
            else:
                severity = "low"


            title = f"Baseline price update for {com_name}: Rp {latest_price:,.0f}"
            if event_type == "price_spike":
                title = f"SPIKE: {com_name} price rose to Rp {latest_price:,.0f} (+{deviation * 100:.1f}%)"

            events.append({
                "source": self.source_name,
                "event_type": event_type,
                "severity": severity,
                "lat": "3.5952",  # Centroid proxy for North Sumatra/Medan
                "lon": "98.6722",
                "title": title,
                "raw": json.dumps({
                    "commodity": com_name,
                    "price_today": latest_price,
                    "rolling_mean_7d": rolling_mean,
                    "deviation_pct": round(deviation * 100, 2),
                    "market": "Pasar Tradisional Sumatera Utara",
                    "province": "Sumatera Utara",
                    "tanggal": latest_date
                }),
                "ts": datetime.now(timezone.utc).isoformat(),
                "dedup_key": dedup_key,
            })

            # Update baseline in Redis
            history.append(latest_price)
            history = history[-7:]
            try:
                r.set(redis_key, json.dumps(history), ex=86400 * 10)
            except Exception as e:
                logger.error(f"Failed to update rolling history in Redis: {e}")

        return events

    async def persist_price_points(
        self,
        com_name: str,
        readings: List[Dict[str, Any]],
        row_name: Optional[str] = None,
        level: Any = None,
    ) -> int:
        """
        Persist per-period PIHPS readings into the Supabase commodity_prices table.

        Idempotent per (time, commodity, region) key: the table has no unique
        constraint, so any existing row for the key is deleted before inserting
        (no schema migration required).

        Never raises: missing credentials, an offline Supabase, or a failed write
        are logged as warnings and skipped so the scraper keeps running.
        Returns the number of price points successfully written.
        """
        if not readings:
            return 0

        try:
            sb = _get_write_client()
        except Exception as e:
            logger.warning(f"Supabase unavailable, skipping PIHPS persistence for {com_name}: {e}")
            return 0

        def _delete_point(time_iso: str):
            return (
                sb.table("commodity_prices")
                .delete()
                .eq("commodity", com_name)
                .eq("region", REGION)
                .eq("time", time_iso)
                .execute()
            )

        def _insert_point(record: Dict[str, Any]):
            return sb.table("commodity_prices").insert(record).execute()

        written = 0
        for reading in readings:
            time_iso = f"{reading['date']}T00:00:00+00:00"
            record = {
                "time": time_iso,
                "commodity": com_name,
                "region": REGION,
                "price_idr": reading["price"],
                "source": self.source_name,
                "metadata": {
                    "period": reading["period"],
                    "province": "Sumatera Utara",
                    "market": "Pasar Tradisional Sumatera Utara",
                    "row_name": row_name,
                    "level": level,
                },
            }
            try:
                await asyncio.to_thread(_delete_point, time_iso)
                await asyncio.to_thread(_insert_point, record)
                written += 1
            except Exception as e:
                logger.warning(f"Failed to persist PIHPS price point {com_name}@{reading['date']}: {e}")

        if written:
            logger.info(f"Persisted {written} PIHPS price points for {com_name} into commodity_prices")
        return written

    async def health_check(self) -> bool:
        """Check if BI website endpoint is reachable."""
        url = "https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.head(url, headers=headers, timeout=5)
                # It might return 405 Method Not Allowed for HEAD, which is fine as long as server responds
                return resp.status_code in (200, 405)
        except Exception:
            return False

if __name__ == "__main__":
    # Test script execution
    logging.basicConfig(level=logging.INFO)
    scraper = PIHPSScraper()
    async def run_test():
        is_healthy = await scraper.health_check()
        print("Health Check:", is_healthy)
        if is_healthy:
            raw = await scraper.fetch()
            events = await scraper.parse(raw)
            print("Events generated:", len(events))
            for e in events:
                print(e["title"], e["severity"])
    asyncio.run(run_test())
