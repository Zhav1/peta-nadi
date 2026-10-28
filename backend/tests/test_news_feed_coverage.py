"""Phase 176.7 (M9) — news feed supply cover for the three thin provinces.

Live audit of ``GET /api/v1/news/live``: 31 articles across 7/10 provinces, with
Jambi, Kepulauan Bangka Belitung and Bengkulu at **zero**. Root cause was the
supply side: no feed in ``OFFICIAL_RSS_FEEDS`` published a qualifying regional
article for those provinces inside the 150-row read window, so no quota could
fill them. Phase 176.7 adds only feeds verified live (HTTP 200 + parseable RSS
with items).

These tests are offline/static: they assert the *configured* feed registry is
complete and honest. No network access.
"""
from collections import Counter

import pytest

from app.nlp.news_extractor import declared_province
from app.services.news_aggregator import OFFICIAL_RSS_FEEDS

# The ten Sumatra provinces, in the vocabulary the feed registry is written in
# (official names). ``declared_province`` canonicalises them into the news
# pipeline's buckets (e.g. "Kepulauan Bangka Belitung" -> "Bangka Belitung").
OFFICIAL_PROVINCES = {
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Kepulauan Riau",
    "Jambi",
    "Sumatera Selatan",
    "Kepulauan Bangka Belitung",
    "Bengkulu",
    "Lampung",
}

# A province may be served only by national/regional Google-News queries instead
# of a dedicated feed. None is needed today; the mapping stays explicit so a
# future removal has to be documented here rather than silently dropping cover.
DOCUMENTED_COVERAGE_EXCEPTIONS: dict[str, str] = {}

FEEDS_BY_URL = {feed["url"]: feed for feed in OFFICIAL_RSS_FEEDS}


def test_every_sumatra_province_has_a_declaring_feed():
    declared = {
        canonical
        for canonical in (declared_province(feed.get("province")) for feed in OFFICIAL_RSS_FEEDS)
        if canonical
    }
    uncovered = {
        province
        for province in OFFICIAL_PROVINCES
        if declared_province(province) not in declared
    }
    assert uncovered == set(DOCUMENTED_COVERAGE_EXCEPTIONS), (
        f"provinces with no declaring feed: {sorted(uncovered)}; "
        f"documented exceptions: {sorted(DOCUMENTED_COVERAGE_EXCEPTIONS)}"
    )
    # Every exception must carry a written reason.
    assert all(reason.strip() for reason in DOCUMENTED_COVERAGE_EXCEPTIONS.values())


def test_feed_entries_are_complete_and_unique():
    required = ("source", "url", "province")
    for feed in OFFICIAL_RSS_FEEDS:
        for field in required:
            assert isinstance(feed.get(field), str) and feed[field].strip(), feed
        assert feed["url"].startswith(("http://", "https://")), feed
        # A feed may declare a real Sumatra province or "Nasional" (no province
        # claim). A city name or a typo is neither: it would be discarded by
        # `declared_province` and silently shrink cover.
        assert feed["province"] == "Nasional" or declared_province(feed["province"]), feed

    duplicates = [url for url, count in Counter(f["url"] for f in OFFICIAL_RSS_FEEDS).items() if count > 1]
    assert duplicates == [], f"duplicate feed URLs: {duplicates}"


# Every URL below returned HTTP 200 with parseable RSS items when probed live on
# 2026-10-28 (item counts in the phase report). If one starts failing the right
# fix is to verify a replacement — deleting an assertion hides the defect.
NEWLY_ADDED_FEEDS = {
    "https://jambi.tribunnews.com/rss": "Jambi",
    "https://jambiseru.com/feed": "Jambi",
    "https://bangka.tribunnews.com/rss": "Kepulauan Bangka Belitung",
    "https://babel.tribunnews.com/rss": "Kepulauan Bangka Belitung",
    "https://bangkaterkini.id/feed": "Kepulauan Bangka Belitung",
    "https://bengkulu.tribunnews.com/rss": "Bengkulu",
    "https://bengkulusatu.com/feed": "Bengkulu",
    "https://www.kupasbengkulu.com/feed": "Bengkulu",
}


@pytest.mark.parametrize("url,province", sorted(NEWLY_ADDED_FEEDS.items()))
def test_newly_added_feeds_declare_the_missing_provinces(url, province):
    feed = FEEDS_BY_URL.get(url)
    assert feed is not None, f"{url} is not configured"
    assert declared_province(feed["province"]) == declared_province(province), feed


@pytest.mark.parametrize(
    "province",
    ["Jambi", "Kepulauan Bangka Belitung", "Bengkulu"],
)
def test_missing_provinces_gained_redundant_supply(province):
    """One feed per province is what produced the zero-article window; demand 2."""
    declaring = [
        feed
        for feed in OFFICIAL_RSS_FEEDS
        if declared_province(feed.get("province")) == declared_province(province)
    ]
    assert len(declaring) >= 2, f"{province} has only {len(declaring)} declaring feed(s)"
