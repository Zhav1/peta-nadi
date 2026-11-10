import pytest
from unittest.mock import MagicMock, patch

from app.adapters.bmkg_adapter import BMKGAdapter


@pytest.mark.asyncio
@patch("app.adapters.bmkg_adapter.get_redis")
async def test_bmkg_weather_parses_public_api_field_names(mock_get_redis):
    """The public BMKG forecast uses `weather` (int) and `weather_desc`.

    Regression: the parser read `code`/`desc`, which never exist in the API
    payload, so `warnings_found` was always empty and bmkg published zero
    weather events forever (cuaca.count pinned at 0).
    """
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    raw_data = {
        "earthquake": None,
        "weather": {
            "data": [
                {
                    "lokasi": {"kotkab": "Medan", "lat": 3.59, "lon": 98.67},
                    "cuaca": [
                        [
                            {
                                "weather": 95,
                                "weather_desc": "Hujan Petir",
                                "local_datetime": "2026-11-10T08:00:00Z",
                            }
                        ]
                    ],
                }
            ]
        },
    }

    events = await BMKGAdapter().parse(raw_data)

    assert len(events) == 1
    assert events[0]["event_type"] == "weather_warning"
    assert events[0]["severity"] == "high"
    assert events[0]["title"].startswith("BMKG forecast: Hujan Petir")