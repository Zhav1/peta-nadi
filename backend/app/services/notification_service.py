"""
WhatsApp Cloud API notification service for PetaNadi.

Sends formatted crisis alerts when the consensus gate produces a validated event.
Falls back to log-only if WHATSAPP_TOKEN is not configured (safe for local dev).
"""
import logging
from typing import Any, Dict
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Env vars required for a live WhatsApp send. Kept as a mapping so callers can
# report exactly which integration inputs are missing (degraded_sources).
_WHATSAPP_SETTINGS = {
    "WHATSAPP_TOKEN": "whatsapp_token",
    "WHATSAPP_PHONE_NUMBER_ID": "whatsapp_phone_number_id",
    "WHATSAPP_RECIPIENT_NUMBER": "whatsapp_recipient_number",
}


def whatsapp_config_status() -> Dict[str, Any]:
    """Returns whether the WhatsApp integration is configured and what is missing.

    A missing configuration is a *degraded* state, never an error: validated
    alerts still flow to Redis/SSE and are logged locally.
    """
    missing = [
        env_name
        for env_name, attr_name in _WHATSAPP_SETTINGS.items()
        if not getattr(settings, attr_name, "")
    ]
    return {"configured": not missing, "missing": missing}


async def notify_validated_alert(incident: dict) -> Dict[str, Any]:
    """Dispatches a validated alert through the WhatsApp service.

    Never raises. Returns a structured outcome so the caller (Agent 6 / the
    notify route) can surface honest degradation instead of swallowing a 404:

        {"status": "sent" | "failed" | "degraded_log_only",
         "configured": bool, "missing": [...], "degraded_sources": [...]}
    """
    status = whatsapp_config_status()
    missing = status["missing"]

    if not status["configured"]:
        logger.warning(
            "WhatsApp notification degraded to log-only; missing=%s",
            ",".join(missing),
        )
        try:
            # send_crisis_alert() logs the formatted body when unconfigured.
            await send_crisis_alert(incident)
        except Exception as exc:  # defensive: logging must never break the agent
            logger.error("Log-only WhatsApp fallback failed: %s", exc)
        return {
            "status": "degraded_log_only",
            "configured": False,
            "missing": missing,
            "degraded_sources": ["whatsapp"],
        }

    try:
        sent = await send_crisis_alert(incident)
    except Exception as exc:  # send_crisis_alert already guards; belt and braces
        logger.error("WhatsApp notification dispatch crashed: %s", exc)
        sent = False

    return {
        "status": "sent" if sent else "failed",
        "configured": True,
        "missing": [],
        "degraded_sources": [] if sent else ["whatsapp"],
    }


async def send_crisis_alert(incident: dict) -> bool:
    """
    Sends a formatted WhatsApp notification for a validated incident.
    Returns True if successfully sent, False otherwise.
    """
    token = settings.whatsapp_token
    phone_id = settings.whatsapp_phone_number_id
    recipient = settings.whatsapp_recipient_number
    app_url = settings.app_url

    # Extract info from incident dictionary
    incident_id = incident.get("incident_id")
    title = incident.get("title", "Unnamed Crisis Event")
    crisis_type = incident.get("type", "unknown").replace("_", " ").title()
    severity = incident.get("severity", "high").upper()
    confidence = int(incident.get("overall_confidence", 0.0) * 100)
    region = incident.get("region", "unknown").replace("_", " ").title()
    
    # Get top route recommendation if available
    routes = incident.get("route_recommendations", [])
    recommendation_text = "No route alternative generated."
    if routes and len(routes) > 0:
        top_route = routes[0]
        desc = top_route.get("description", "Alternative Route")
        dist = top_route.get("distance_km", 0.0)
        risk = int(top_route.get("risk_score", 0.0) * 100)
        recommendation_text = f"{desc} ({dist:.1f} km, risk: {risk}%)"

    # Build plain text message body
    body = (
        f"🚨 ALERT : PetaNadi Crisis Detected\n"
        f"────────────────────────────────\n"
        f"Type:       {crisis_type}\n"
        f"Severity:   {severity} ({confidence}% confidence)\n"
        f"Region:     {region}\n"
        f"────────────────────────────────\n"
        f"Recommended Action:\n"
        f"{recommendation_text}\n"
        f"────────────────────────────────\n"
        f"📍 View full dashboard:\n"
        f"{app_url}/?crisis={incident_id}\n"
        f"────────────────────────────────\n"
        f"Powered by PetaNadi LRIP System"
    )

    if not token or not phone_id or not recipient:
        logger.info("WhatsApp notifications not configured in .env. Logging alert instead:")
        logger.info(f"\n{body}")
        return False

    url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {
            "body": body
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=5.0)
            if response.status_code == 200:
                logger.info(f"WhatsApp notification sent successfully for incident {incident_id}")
                return True
            else:
                logger.error(
                    f"Failed to send WhatsApp notification. Status: {response.status_code}, Response: {response.text}"
                )
                return False
    except Exception as e:
        logger.error(f"Error sending WhatsApp notification: {e}")
        return False
