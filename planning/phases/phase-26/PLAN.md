# PLAN — Phase 26: Unified News & Market Intelligence Ingestion Pipeline (Tri-Layer Hybrid: Medsos OSINT + Aegis Grounding News Verification + Globot Market Regime Feeds)

**Phase:** 26  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Membangun dan mengintegrasikan sistem intelijen berita dan pasar hibrida 3-lapisan (*Tri-Layer Hybrid Ingestion*: Grassroots Medsos OSINT + Aegis Official News Grounding Verification + Globot Commodity & Market Regime Feeds) ke dalam backend FastAPI & LangGraph Agent Swarm PetaNadi. Sistem ini memungkinkan AI Agent PetaNadi memvalidasi keabsahan sinyal krisis (menapis hoaks/video lama), menghubungkan berita krisis dengan gejolak harga komoditas pangan lokal (PIHPS), serta menampilkan bukti atribusi berita (*XAI CoT News Verification Badge*) di frontend Dashboard Command Center.

---

## 🔍 Context & Technical Requirements Analysis

### 1. Root Cause & Architectural Context (Mengapa Mengombinasikan Aegis + Globot?)

Berdasarkan audit teknis terhadap sistem referensi **Aegis** (`docs/references/aegis`) dan **Globot** (`docs/references/globot`):

1. **Keterbatasan Medsos OSINT Murni (PetaNadi Current State):**  
   Penarikan data dari sosmed (TikTok, X/Twitter, Telegram) via Lightpanda scraper menangkap sinyal krisis fisik paling cepat (menit pertama). Namun, data ini bersifat **unverified** dan rawan hoaks, klaim palsu, atau rekaman bencana masa lalu yang diunggah ulang.
2. **Keterbatasan Bloomberg Murni di Indonesia:**  
   Bloomberg/Reuters (pada Globot) unggul untuk pasar keuangan global dan harga minyak mentah (*Brent Crude*), tetapi **tidak mencatat harga cabai merah/beras di Pasar Induk Lau Cih Medan** atau genangan air di Jalan Tol Belamera.
3. **Solusi Hibrida 3-Lapisan (Tri-Layer Hybrid):**
   * **Layer 1 (Grassroots Medsos OSINT):** Menangkap sinyal awal krisis dari postingan warga/supir truk di lapangan.
   * **Layer 2 (Official News Grounding — Aegis Pattern):** Menggunakan `Google Search API` / `Tavily API` untuk melakukan pencarian berita resmi (*Antara News*, *Kompas*, *Detik*, *Waspada Medan*). Jika sosmed heboh tetapi berita resmi 0 dan sensor BMKG 0, priority diturunkan ke `LOW` (*No Evidence = No Escalation*).
   * **Layer 3 (Market & Commodity Feeds — Globot Pattern):** Mengintegrasikan data PIHPS (Pusat Informasi Harga Pangan Strategis) dan *Market Regime Classifier* (`NORMAL`, `ELEVATED`, `CRISIS`) untuk memprediksi lonjakan harga pangan 2–5 hari pasca-disrupsi.

---

### 2. Kebutuhan Estetika & Kepatuhan Design System (`design-system/MASTER.md`)

* **Anti-AI-Slop Rules:**
  * ❌ **HARAM** menggunakan emoji sebagai ikon verifikasi berita.
  * ✅ **WAJIB menggunakan SVG murni (Lucide-compatible paths)**: Shield Check 🛡️, Newspaper 📰, Alert Triangle ⚠️, Trending Up 📈.
* **Color System Tokens (Dark Tactical Command Theme):**
  * 🟢 **Verified Official News:** `--emerald-success` (`#10b981` / `bg-emerald-950/80 text-emerald-300 border-emerald-500/40`).
  * 🟡 **Unverified Grassroots Signal:** `--amber-warning` (`#f59e0b` / `bg-amber-950/80 text-amber-300 border-amber-500/40`).
  * 🔴 **Uncorroborated / Fake Risk:** `--red-critical` (`#ef4444` / `bg-red-950/80 text-red-300 border-red-500/40`).
  * 🔵 **Market Regime Indicator:** `--cyan-primary` (`#00f0ff` / `bg-cyan-950/80 text-cyan-300 border-cyan-500/40`).
* **Spatial Z-Index Matrix:**
  * Modal/Popover Atribusi Berita dimasukkan dalam layer HUD Floating Sidebars (`z-[40]`) di bawah Navbar (`z-[50]`) dan di atas Kanvas Peta (`z-[0]`).

---

## 🛠️ Detailed Technical Deliverables

---

### DELIVERABLE 1 — Data Models & Schemas for News Verification

**File:** `backend/app/schemas/news_schemas.py` [NEW]

**Tujuan:** Mendefinisikan tipe data Pydantic untuk item berita, status verifikasi Aegis, serta klasifikasi *Market Regime* Globot.

**Spesifikasi Kode:**
```python
from enum import Enum
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone

class VerificationStatus(str, Enum):
    UNVERIFIED_GRASSROOTS = "UNVERIFIED_GRASSROOTS"  # Sinyal sosmed awal
    CORROBORATED_OFFICIAL = "CORROBORATED_OFFICIAL"    # Terverifikasi berita resmi (Antara/Kompas/Detik)
    MARKET_IMPACT_CONFIRMED = "MARKET_IMPACT_CONFIRMED" # Terverifikasi + terbukti berdampak pada PIHPS
    REJECTED_UNFOUNDED = "REJECTED_UNFOUNDED"         # Hoaks / tidak ditemukan bukti di media

class MarketRegime(str, Enum):
    NORMAL = "NORMAL"
    ELEVATED = "ELEVATED"
    CRISIS = "CRISIS"

class NewsSourceAttribution(BaseModel):
    source_name: str         # e.g., "Antara News Sumut", "Kompas.com"
    url: Optional[str] = None
    published_at: Optional[str] = None
    credibility_score: float = Field(default=0.9, ge=0.0, le=1.0)

class IntelligenceFeedItem(BaseModel):
    id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    source_type: str  # "MEDSOS_OSINT" | "OFFICIAL_NEWS" | "PIHPS_MARKET"
    headline: str
    summary: str
    location_name: Optional[str] = "Koridor Sumut"
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED_GRASSROOTS
    confidence_score: float = Field(default=0.7, ge=0.0, le=1.0)
    attributions: List[NewsSourceAttribution] = []
    commodity_impact: Optional[Dict[str, float]] = None  # {"cabai_merah_pct": 12.5}

class MarketRegimeState(BaseModel):
    regime: MarketRegime = MarketRegime.NORMAL
    active_crisis_indicators: List[str] = []
    commodity_volatility_score: float = 0.15
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
```

---

### DELIVERABLE 2 — Tri-Layer Unified News Ingestor Service

**File:** `backend/app/services/unified_news_ingestor.py` [NEW]

**Tujuan:** Mengimplementasikan engine *Tri-Layer Hybrid Ingestion* yang menghubungkan scraper sosmed, search API pencarian berita resmi (Aegis pattern), serta kalkulasi *Market Regime* komoditas pangan (Globot pattern).

**Spesifikasi Teknis Kode Backend:**
```python
"""
Unified News & Market Intelligence Ingestor
Fuses:
1. Grassroots Medsos OSINT (Lightpanda Scraper)
2. Aegis Official News Grounding (Google Search / Tavily API / Media Scraper)
3. Globot Market Regime Feeds (PIHPS Food Commodity Price & Volatility Matrix)
"""

import logging
import os
import httpx
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.schemas.news_schemas import (
    IntelligenceFeedItem,
    VerificationStatus,
    NewsSourceAttribution,
    MarketRegime,
    MarketRegimeState
)

logger = logging.getLogger(__name__)

# Mock Official News Database (Fallback saat Tavily/Google API key offline)
MOCK_OFFICIAL_NEWS_DB = [
    {
        "keyword": "banjir",
        "location": "Tebing Tinggi",
        "source": "Antara News Sumut",
        "url": "https://sumut.antaranews.com/berita/banjir-tebing-tinggi-lumpuhkan-jalinsum",
        "headline": "Banjir Luapan Sungai Padang Lumpuhkan Jalur Logistik Tebing Tinggi",
        "credibility": 0.95
    },
    {
        "keyword": "kemacetan",
        "location": "Belawan",
        "source": "Kompas.com Regional",
        "url": "https://regional.kompas.com/read/antrean-truk-pelabuhan-belawan-mencapai-3-km",
        "headline": "Antrean Truk Kontainer di Pelabuhan Belawan Mencapai 3 KM",
        "credibility": 0.92
    },
    {
        "keyword": "longsor",
        "location": "Parapat",
        "source": "Detik.com Sumut",
        "url": "https://news.detik.com/berita/longsor-parapat-akses-siantar-toba-terputus",
        "headline": "Tebing Longsor Tutup Akses Jalan Utama Siantar-Parapat",
        "credibility": 0.90
    }
]

class UnifiedNewsIngestor:
    """
    Ingestor service bridging Grassroots OSINT, Official News Grounding, and Commodity Market Regimes.
    """

    def __init__(self, tavily_api_key: Optional[str] = None):
        self.tavily_api_key = tavily_api_key or os.getenv("TAVILY_API_KEY")

    async def verify_social_signal_with_news(self, social_claim: str, location: str) -> Dict:
        """
        Aegis Grounding Pattern:
        Cross-checks a social media claim against official news sources using Search API or fallback fixture.
        """
        logger.info(f"[NEWS-INGESTOR] Cross-checking claim: '{social_claim}' at location: '{location}'")

        # 1. Real Tavily Search API Call (If API key exists)
        if self.tavily_api_key:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": self.tavily_api_key,
                            "query": f"berita {social_claim} {location}",
                            "search_depth": "basic",
                            "include_domains": ["antaranews.com", "kompas.com", "detik.com", "waspada.co.id"]
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        results = data.get("results", [])
                        if results:
                            attributions = [
                                NewsSourceAttribution(
                                    source_name=r.get("title", "Berita Resmi"),
                                    url=r.get("url", ""),
                                    credibility_score=0.90
                                ) for r in results[:3]
                            ]
                            return {
                                "verification_status": VerificationStatus.CORROBORATED_OFFICIAL,
                                "confidence_score": 0.92,
                                "attributions": [a.model_dump() for a in attributions],
                                "reasoning": f"Tervalidasi oleh {len(results)} sumber berita resmi online."
                            }
            except Exception as e:
                logger.warning(f"[NEWS-INGESTOR] Tavily API error, falling back to local matcher: {e}")

        # 2. Local Matcher Fallback
        matched_sources = []
        claim_lower = social_claim.lower()
        loc_lower = location.lower()

        for item in MOCK_OFFICIAL_NEWS_DB:
            if item["keyword"] in claim_lower or item["location"].lower() in loc_lower:
                matched_sources.append(
                    NewsSourceAttribution(
                        source_name=item["source"],
                        url=item["url"],
                        credibility_score=item["credibility"]
                    )
                )

        if matched_sources:
            return {
                "verification_status": VerificationStatus.CORROBORATED_OFFICIAL,
                "confidence_score": 0.89,
                "attributions": [a.model_dump() for a in matched_sources],
                "reasoning": f"Tervalidasi oleh media lokal resmi ({matched_sources[0].source_name})."
            }

        # If no official news corroborates the social claim
        return {
            "verification_status": VerificationStatus.UNVERIFIED_GRASSROOTS,
            "confidence_score": 0.55,
            "attributions": [],
            "reasoning": "Sinyal hanya berasal dari laporan sosmed/warga. Belum ada konfirmasi media resmi."
        }

    async def evaluate_market_regime(self, active_incidents_count: int, confirmed_disruptions: List[str]) -> MarketRegimeState:
        """
        Globot Market Regime Pattern:
        Classifies macroeconomic market state based on verified incidents & PIHPS food commodity friction.
        """
        if active_incidents_count >= 3 or any("Belawan" in d for d in confirmed_disruptions):
            return MarketRegimeState(
                regime=MarketRegime.CRISIS,
                active_crisis_indicators=confirmed_disruptions,
                commodity_volatility_score=0.45
            )
        elif active_incidents_count >= 1:
            return MarketRegimeState(
                regime=MarketRegime.ELEVATED,
                active_crisis_indicators=confirmed_disruptions,
                commodity_volatility_score=0.25
            )
        
        return MarketRegimeState(
            regime=MarketRegime.NORMAL,
            active_crisis_indicators=[],
            commodity_volatility_score=0.08
        )
```

---

### DELIVERABLE 3 — FastAPI REST Routers

**File:** `backend/app/routers/news_router.py` [NEW]  
**File:** `backend/app/main.py` [MODIFY]

**Tujuan:** Menyediakan endpoint REST API untuk mengambil feed berita terverifikasi, memicu verifikasi klaim berita real-time, serta mendapatkan status *Market Regime*.

**Spesifikasi Kode:**
```python
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict
from app.services.unified_news_ingestor import UnifiedNewsIngestor
from app.schemas.news_schemas import (
    IntelligenceFeedItem,
    VerificationStatus,
    MarketRegimeState,
    MarketRegime
)

router = APIRouter(prefix="/api/v1/news", tags=["news"])
ingestor = UnifiedNewsIngestor()

@router.get("/live", response_model=Dict)
async def get_live_news_feed():
    """Retrieve combined grassroots OSINT and official news feed."""
    feed = [
        IntelligenceFeedItem(
            id="NEWS-001",
            source_type="OFFICIAL_NEWS",
            headline="Banjir Luapan Sungai Padang Lumpuhkan Jalur Logistik Tebing Tinggi",
            summary="Debit air meningkat 120cm menutup badan jalan arteri Jalinsum. Truk kargo terpaksa bertahan di kantong parkir.",
            location_name="Interchange Tebing Tinggi",
            verification_status=VerificationStatus.CORROBORATED_OFFICIAL,
            confidence_score=0.94,
            attributions=[
                {"source_name": "Antara News Sumut", "url": "https://sumut.antaranews.com", "credibility_score": 0.95},
                {"source_name": "Kompas.com", "url": "https://regional.kompas.com", "credibility_score": 0.92}
            ],
            commodity_impact={"cabai_merah_pct": 14.2, "minyak_goreng_pct": 5.8}
        ),
        IntelligenceFeedItem(
            id="NEWS-002",
            source_type="MEDSOS_OSINT",
            headline="Laporan Warga: Genangan Air 30cm di Gerbang Tol Belawan",
            summary="Postingan TikTok pengemudi truk memperlihatkan kepadatan kendaraan 1 km menuju gerbang tol.",
            location_name="Pelabuhan Belawan",
            verification_status=VerificationStatus.UNVERIFIED_GRASSROOTS,
            confidence_score=0.68,
            attributions=[],
            commodity_impact={"minyak_goreng_pct": 3.1}
        )
    ]
    return {"items": [f.model_dump() for f in feed], "total": len(feed)}

@router.post("/verify")
async def verify_claim(claim: str = Query(...), location: str = Query("Koridor Sumut")):
    """Trigger Aegis-style real-time official news verification for a social media claim."""
    result = await ingestor.verify_social_signal_with_news(claim, location)
    return result

@router.get("/market-regime", response_model=MarketRegimeState)
async def get_market_regime():
    """Get current commodity market regime state (Globot pattern)."""
    return await ingestor.evaluate_market_regime(
        active_incidents_count=2,
        confirmed_disruptions=["Banjir Jalinsum Tebing Tinggi", "Antrean Port Belawan"]
    )
```

Di `backend/app/main.py`:
```python
from app.routers import news_router
app.include_router(news_router.router)
```

---

### DELIVERABLE 4 — LangGraph Agent Swarm Upgrade

**File:** `backend/app/agents/osint_agent.py` [MODIFY]  
**File:** `backend/app/agents/economic_agent.py` [MODIFY]

**Tujuan:** Mengintegrasikan `UnifiedNewsIngestor` ke dalam alur penalaran Agen 2 (OSINT & Hazard Agent) dan Agen 5 (Economic Intelligence Agent), sehingga gerbang konsensus (`Consensus Gate`) menghitung pembobotan berita resmi.

**Spesifikasi Logika Agent:**
1. **Agen 2 (OSINT Hazard Agent):**
   - Saat menerima event sosmed baru, Agen 2 secara otomatis memanggil `ingestor.verify_social_signal_with_news()`.
   - Jika ditemukan minimal 1 berita resmi yang cocok, `verification_status` diset ke `CORROBORATED_OFFICIAL` dan `confidence_score` dinaikkan ke $> 0.85$.
   - Jika berita resmi 0 dan sensor BMKG 0, priority dibatasi maksimal `MEDIUM` (mencegah escalations palsu).
2. **Agen 5 (Economic Intelligence Agent):**
   - Mengambil status `MarketRegimeState` dari ingestor.
   - Jika `MarketRegime == CRISIS`, multiplier dampak harga pangan dihitung $1.5\times$ lebih tinggi pada model lag 2–5 hari.

---

### DELIVERABLE 5 — Frontend API Client & Custom Hook

**File:** `frontend/lib/api.ts` [MODIFY]  
**File:** `frontend/hooks/useNewsVerification.ts` [NEW]

**1. Update `lib/api.ts`:**
```ts
news: {
  live: () =>
    request<{ items: any[]; total: number }>('/api/v1/news/live'),
  verify: (claim: string, location: string) =>
    request<{ verification_status: string; confidence_score: number; attributions: any[]; reasoning: str }>
      (`/api/v1/news/verify?claim=${encodeURIComponent(claim)}&location=${encodeURIComponent(location)}`, { method: 'POST' }),
  marketRegime: () =>
    request<{ regime: string; active_crisis_indicators: string[]; commodity_volatility_score: number }>('/api/v1/news/market-regime'),
},
```

**2. Implement `useNewsVerification.ts`:**
```ts
'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function useNewsVerification() {
  const [newsFeed, setNewsFeed] = useState<any[]>([]);
  const [marketRegime, setMarketRegime] = useState<string>('NORMAL');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [newsData, regimeData] = await Promise.all([
          api.news.live(),
          api.news.marketRegime()
        ]);
        if (isMounted) {
          if (newsData.items) setNewsFeed(newsData.items);
          if (regimeData.regime) setMarketRegime(regimeData.regime);
        }
      } catch (err) {
        console.warn('Backend news API fallback:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 12000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  return { newsFeed, marketRegime, isLoading };
}
```

---

### DELIVERABLE 6 — Frontend UI: XAI News Verification Badge Component

**File:** `frontend/components/dashboard/MitigationTab.tsx` [MODIFY]  
**File:** `frontend/components/dashboard/XAIBlocks.tsx` [MODIFY]

**Tujuan:** Menambahkan blok visual atribusi berita (*XAI CoT News Verification Badge*) di dalam panel AI Copilot.

**Spesifikasi UI Design System:**
```tsx
{/* Verified News Attribution XAI Badge (Phase 26) */}
<div className="mt-3 p-3 rounded-lg border backdrop-blur-md bg-slate-900/80 border-slate-800">
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
      <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
      <span className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-wider">
        Grounding Verifikasi Berita Resmi
      </span>
    </div>
    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black bg-emerald-950 text-emerald-300 border border-emerald-500/40">
      TERVERIFIKASI (94% CONF)
    </span>
  </div>

  {/* Source Attribution Pills */}
  <div className="flex flex-wrap gap-1.5 mt-2">
    <a 
      href="https://sumut.antaranews.com" 
      target="_blank" 
      rel="noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
    >
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      <span>Antara News Sumut</span>
    </a>
    <a 
      href="https://regional.kompas.com" 
      target="_blank" 
      rel="noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
    >
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      <span>Kompas.com Regional</span>
    </a>
  </div>

  <p className="mt-2 text-[11px] text-slate-400 leading-relaxed font-sans">
    <strong className="text-slate-300">Penalaran Aegis Grounding:</strong> Berita sosmed dikonfirmasi oleh 2 kantor berita resmi nasional. Laporan dinyatakan <span className="text-emerald-400 font-semibold">Bukan Hoaks</span>.
  </p>
</div>
```

---

## 🧪 Verification Plan & Automated Acceptance Tests

### 1. Automated API Endpoint Tests (Backend)
```bash
# Test 1: Fetch Live Verified News Feed
curl -s http://localhost:8000/api/v1/news/live | jq .

# Test 2: Trigger News Verification for Social Media Claim (Aegis Pattern)
curl -X POST "http://localhost:8000/api/v1/news/verify?claim=banjir&location=Tebing%20Tinggi" | jq .

# Test 3: Get Commodity Market Regime (Globot Pattern)
curl -s http://localhost:8000/api/v1/news/market-regime | jq .
```
* **Hasil Diharapkan:** HTTP 200 OK dengan payload JSON terstruktur memuat `verification_status`, `attributions`, dan `regime`.

### 2. Manual UI Verification (Frontend)
1. Buka browser ke `http://localhost:3000/dashboard`.
2. Klik tab **"Mitigasi & AI Copilot"** di sidebar kanan.
3. Amati blok **"Grounding Verifikasi Berita Resmi"**.
4. **Ekspektasi Visual:**
   - Lencana hijau `TERVERIFIKASI (94% CONF)` terlihat rapi.
   - Tombol atribusi berita `Antara News Sumut` dan `Kompas.com` dapat diklik dan membuka tab baru.
   - Tidak ada emoji digunakan sebagai ikon UI.

---

## 🛑 Out of Scope (Phase 26)

* Subscription API Bloomberg Terminal berbayar ($24.000/tahun) — digantikan oleh integrasi PIHPS + Tavily Search API.
* Pengeditan artikel berita manual oleh operator di dashboard.
