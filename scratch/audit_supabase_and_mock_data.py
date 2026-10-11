import sys
import os
sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('backend'))

from app.db.supabase_client import get_client
import json

def audit_supabase():
    sb = get_client()
    tables = [
        "incidents",
        "route_approvals",
        "news_articles",
        "shipment_profiles",
        "data_sources",
        "commodity_prices",
        "profiles",
        "decision_traces",
        "decision_outcomes",
        "traffic_segments",
        "fleets"
    ]
    
    results = {}
    for t in tables:
        try:
            res = sb.table(t).select("*", count="exact").limit(5).execute()
            results[t] = {
                "status": "EXISTS",
                "count": res.count,
                "sample_count": len(res.data) if res.data else 0,
                "first_sample": res.data[0] if res.data else None
            }
        except Exception as e:
            results[t] = {
                "status": "ERROR_OR_NOT_FOUND",
                "error": str(e)
            }
            
    print(json.dumps(results, indent=2, default=str))

if __name__ == "__main__":
    audit_supabase()
