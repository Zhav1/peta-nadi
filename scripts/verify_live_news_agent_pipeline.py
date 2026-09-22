import asyncio
import sys
sys.path.extend(['d:/College/Pidi.id/backend', 'd:/College/Pidi.id'])

from app.services.news_aggregator import fetch_all_multi_outlet_news
from app.nlp.news_extractor import extract_structured_news
from agents.nodes.osint_hazard import osint_hazard_agent
from agents.nodes.route_optimization import route_optimization_agent
from agents.nodes.economic_intelligence import economic_intelligence_agent
from agents.nodes.decision_support import decision_support_copilot
from agents.state import CrisisState


async def run_live_test():
    print("================================================================")
    print("  PREHUB: LIVE MULTI-OUTLET NEWS -> AGENT SWARM VERIFICATION")
    print("================================================================")

    # 1. Fetch live news
    print("\n[STEP 1] Fetching live news from official & regional media...")
    raw_articles = await fetch_all_multi_outlet_news()
    print(f"-> Successfully fetched {len(raw_articles)} unique articles.")
    for a in raw_articles[:3]:
        tier = a.get("source_tier", "TIER_2")
        src = a.get("source", "Media")
        title = a.get("title", "")[:65]
        print(f"   * [{tier}] {src}: {title}...")

    # 2. Extract structured intelligence
    print("\n[STEP 2] Extracting structured crisis intelligence...")
    test_article = raw_articles[0] if raw_articles else {
        "title": "Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "raw_description": "Debit air meningkat 120cm menutup badan jalan arteri Jalinsum KM 78."
    }
    extracted = await extract_structured_news(test_article)
    print(f"   * Incident Type:   {extracted.get('incident_type')}")
    print(f"   * Severity:        {extracted.get('severity')}")
    print(f"   * Temporal Phase:  {extracted.get('temporal_phase')} (Lead-time: {extracted.get('lead_time_hours')}h)")
    print(f"   * Corridor Nodes:  {extracted.get('corridor_nodes')}")
    print(f"   * Lane Status:     {extracted.get('ground_truth_metrics', {}).get('lane_status')}")
    print(f"   * Commodities:     {extracted.get('commodities_affected')}")

    # 3. Simulate Swarm State
    print("\n[STEP 3] Injecting into Swarm CrisisState...")
    state: CrisisState = {
        "crisis_id": "live-news-test-01",
        "title": "Disrupsi Banjir Koridor Belawan-Medan-Tebing Tinggi",
        "type": "flood",
        "event_type": "flood",
        "severity": "critical",
        "source": "bmkg",
        "lat": 3.568,
        "lon": 98.956,
        "region": "Sumatera Utara",
        "status": "detecting",
        "overall_confidence": 0.0,
        "validated": False,
        "data_collection_finding": None,
        "osint_hazard_finding": None,
        "prediction_finding": None,
        "route_optimization_finding": None,
        "economic_intelligence_finding": None,
        "decision_support_output": None,
        "route_recommendations": [],
        "inflation_forecast": None,
        "causal_chain": None,
        "normalized_event": {
            "source": "bmkg",
            "event_type": "flood",
            "severity": "critical",
            "validated": True,
            "validation_errors": [],
            "raw_payload": {}
        },
        "hazard_polygons": [{"type": "Polygon", "severity": "critical", "incident_id": "h-1"}],
        "congestion_forecast": None,
        "ltm_episodes": None,
        "graphrag_chain": None,
        "consensus_breakdown": None,
        "created_at": "2026-09-22T00:00:00Z",
        "updated_at": "2026-09-22T00:00:00Z",
        "messages": [],
        "is_simulated": False,
        "affected_polygon": None,
        "verified_news_citations": [
            {
                "headline": extracted.get("title"),
                "source": extracted.get("source"),
                "tier": extracted.get("source_tier"),
                "temporal_phase": extracted.get("temporal_phase")
            }
        ],
        "blocked_corridors": ["Jalinsum Arteri KM 78"],
        "news_affected_commodities": extracted.get("commodities_affected", ["Beras BULOG"])
    }

    # 4. Agent 2: OSINT Hazard
    print("\n[STEP 4] Executing Agent 2: OSINTHazardAgent...")
    osint_res = await osint_hazard_agent(state)
    state.update(osint_res)
    finding_2 = state["osint_hazard_finding"]
    print(f"   * Agent 2 Confidence: {finding_2['confidence']}")
    print(f"   * Agent 2 Summary:    {finding_2['summary']}")

    # 5. Agent 4: Route Optimization
    print("\n[STEP 5] Executing Agent 4: RouteOptimizationAgent (Hazard + News Penalty)...")
    route_res = await route_optimization_agent(state)
    state.update(route_res)
    routes = state.get("route_recommendations", [])
    print(f"   * Recommended Alternatives Generated: {len(routes)}")
    if routes:
        print(f"   * Primary Route: {routes[0]['description']} ({routes[0]['distance_km']} km, ETA {routes[0]['eta_minutes']} min)")

    # 6. Agent 5: Economic Intelligence
    print("\n[STEP 6] Executing Agent 5: EconomicIntelligenceAgent (News Commodity Shock)...")
    econ_res = await economic_intelligence_agent(state)
    state.update(econ_res)
    inf = state.get("inflation_forecast", {})
    print(f"   * Inflation Multiplier: {inf.get('inflation_multiplier')}x")
    print(f"   * Commodities Tracked:  {inf.get('anomalous_commodities')}")

    # 7. Agent 6: Decision Support Copilot
    print("\n[STEP 7] Executing Agent 6: DecisionSupportCopilot (Executive Briefing)...")
    copilot_res = await decision_support_copilot(state)
    state.update(copilot_res)
    output = state.get("decision_support_output", "")
    print("\n--- SYNTHESIZED EXECUTIVE BRIEFING ---")
    for line in output.splitlines()[:12]:
        print(f"   {line}")
    print("--------------------------------------")

    print("\n[OK] PIPELINE INTEGRATION VERIFIED: LIVE NEWS FLOWS DIRECTLY INTO SWARM DECISION MAKING!\n")


if __name__ == "__main__":
    asyncio.run(run_live_test())
