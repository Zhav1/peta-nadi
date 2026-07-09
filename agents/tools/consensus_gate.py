from agents.state import CrisisState


def compute_consensus(state: CrisisState) -> dict:
    """
    Computes weighted consensus score and returns routing decision.
    Weights: Hazard 30%, Social 20%, Geospatial 30%, Economics 20%.
    """
    # Safe get confidence from findings, default to 0.5 if finding not present
    hazard_finding = state.get("osint_hazard_finding") or {}
    hazard_conf = hazard_finding.get("confidence", 0.5)

    social_finding = state.get("data_collection_finding") or {}
    social_conf = social_finding.get("confidence", 0.5)

    prediction_finding = state.get("prediction_finding") or {}
    prediction_conf = prediction_finding.get("confidence", 0.5)

    route_finding = state.get("route_optimization_finding") or {}
    route_conf = route_finding.get("confidence", 0.5)

    geo_conf = (prediction_conf * 0.5) + (route_conf * 0.5)

    econ_finding = state.get("economic_intelligence_finding") or {}
    econ_conf = econ_finding.get("confidence", 0.5)

    breakdown = {
        "hazard": round(0.30 * hazard_conf, 4),
        "social": round(0.20 * social_conf, 4),
        "geospatial": round(0.30 * geo_conf, 4),
        "economics": round(0.20 * econ_conf, 4),
    }
    
    overall = sum(breakdown.values())
    
    return {
        "overall_confidence": round(overall, 4),
        "consensus_breakdown": breakdown,
        "route": "validated" if overall >= 0.85 else "unconfirmed",
    }
