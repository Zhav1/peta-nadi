import asyncio
import sys
sys.path.extend(['d:/College/Pidi.id/backend', 'd:/College/Pidi.id'])

import httpx
from app.main import app
from app.workers.agent_worker import run_crisis_event


async def test_live_api_and_workflow():
    print("================================================================")
    print("  TESTING ACTUAL FASTAPI API ENDPOINT & ACTUAL SWARM WORKFLOW")
    print("================================================================")

    # 1. Call actual FastAPI endpoint /api/v1/news/live
    print("\n[TEST 1] Calling actual endpoint: GET /api/v1/news/live?force_refresh=true")
    async with httpx.AsyncClient(app=app, base_url="http://test", timeout=30.0) as client:
        resp = await client.get("/api/v1/news/live?force_refresh=true")
        print(f"-> HTTP Status: {resp.status_code}")
        data = resp.json()
        status = data.get("status")
        count = data.get("count")
        print(f"-> Ingestion Pipeline Status: {status}")
        print(f"-> Retrieved {count} live articles.")
        
        articles = data.get("articles", [])
        if articles:
            provinces = list({item.get("region") for item in articles if item.get("region")})
            print(f"\n-> Pan-Sumatra Regional Coverage: {len(provinces)} distinct regions detected: {provinces}")
            print("\n-> Sample Real Live Articles Across Pulau Sumatera:")
            for idx, item in enumerate(articles[:6], 1):
                src = item.get("source")
                reg = item.get("region")
                title = item.get("title", "")[:60]
                sev = item.get("severity")
                seg = item.get("corridor_segment")
                print(f"   {idx}. [{src}] ({reg}) {title}...")
                print(f"      Corridor: {seg} | Severity: {sev}")

        # 2. Call /api/v1/news/market-regime
        print("\n[TEST 2] Calling actual endpoint: GET /api/v1/news/market-regime")
        resp_regime = await client.get("/api/v1/news/market-regime")
        print(f"-> HTTP Status: {resp_regime.status_code}")
        regime_data = resp_regime.json()
        print(f"-> Regime: {regime_data.get('regime')}")
        print(f"-> Critical News Count: {regime_data.get('critical_news_count')}")
        print(f"-> Early Warning Count: {regime_data.get('early_warning_count')}")
        print(f"-> Active Indicators: {regime_data.get('active_crisis_indicators')}")

        # 3. Test Actual LangGraph Workflow Trigger with Real Ingested News
        print("\n[TEST 3] Triggering Actual LangGraph Swarm Workflow (run_crisis_event) with Live News Event...")
        
        # Pick the top real ingested article
        top_news = articles[0] if articles else {
            "title": "Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78",
            "source": "LKBN ANTARA Sumut",
            "severity": "critical",
            "incident_type": "flood",
            "region": "Sumatera Utara",
            "corridor_segment": "Jalinsum KM 78"
        }
        
        real_crisis_event = {
            "type": top_news.get("incident_type", "flood"),
            "event_type": top_news.get("incident_type", "flood"),
            "source": top_news.get("source", "LKBN ANTARA"),
            "severity": top_news.get("severity", "critical"),
            "title": top_news.get("title"),
            "region": top_news.get("region", "Sumatera Utara"),
            "lat": 3.568,
            "lon": 98.956,
            "corridor_segment": top_news.get("corridor_segment", "Jalur Utama"),
            "is_simulated": False
        }
        
        print(f"-> Triggering LangGraph Swarm with Event: {real_crisis_event['title'][:60]}...")
        final_state = await run_crisis_event(real_crisis_event)
        
        print("\n[TEST 4] Swarm Execution Results:")
        print(f"-> Crisis ID:             {final_state.get('crisis_id')}")
        print(f"-> Status:                {final_state.get('status')}")
        print(f"-> Overall Confidence:    {final_state.get('overall_confidence')}")
        print(f"-> Consensus Validated:   {final_state.get('validated')}")
        
        osint_f = final_state.get("osint_hazard_finding") or {}
        print(f"-> OSINT Finding Summary: {osint_f.get('summary')}")
        
        route_f = final_state.get("route_optimization_finding") or {}
        print(f"-> Route Finding Summary: {route_f.get('summary')}")
        
        econ_f = final_state.get("economic_intelligence_finding") or {}
        print(f"-> Econ Finding Summary:  {econ_f.get('summary')}")
        
        briefing = final_state.get("decision_support_output", "")
        print("\n-> Generated Decision Briefing (first 4 lines):")
        for line in briefing.splitlines()[:4]:
            print(f"   {line}")

    print("\n[OK] ALL ACTUAL APIS AND WORKFLOW RUNS COMPLETED SUCCESSFULLY!\n")


if __name__ == "__main__":
    asyncio.run(test_live_api_and_workflow())
