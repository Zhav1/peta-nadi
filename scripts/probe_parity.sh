#!/usr/bin/env bash
# Phase 58 Task 4.3: local-vs-Render probe matrix with pass/fail + latency.
# Usage: bash scripts/probe_parity.sh [BASE_URL]   (default http://localhost:8000)
# Note: first Render hit after deploy may cold-start 30-50s; keep-alive cron */10 stays.
set -u
BASE="${1:-http://localhost:8000}"
PASS=0; FAIL=0

probe() { # $1=name $2=url $3=expected-substring $4=extra-curl-args
  local name="$1" url="$2" want="$3"; shift 3
  local start end ms body code
  start=$(date +%s%3N 2>/dev/null || date +%s)
  body=$(curl -s --max-time 90 "$url" "$@" 2>/dev/null || echo "CURL_FAIL")
  end=$(date +%s%3N 2>/dev/null || date +%s)
  if [[ "$start" =~ ^[0-9]{13}$ ]]; then ms=$((end-start)); else ms=$(((end-start)*1000)); fi
  if [[ "$body" == *"$want"* ]]; then
    echo "PASS ${name} (${ms}ms) :: ${url}"
    PASS=$((PASS+1))
  else
    echo "FAIL ${name} (${ms}ms) :: ${url} :: want '${want}', got: $(echo "$body" | head -c 200)"
    FAIL=$((FAIL+1))
    code=1
  fi
}

echo "=== Phase 58 parity matrix vs ${BASE} ==="
probe "health"              "${BASE}/health"                        '"status"'
probe "agents-status"       "${BASE}/api/v1/agents/status"          '"active_agents"'
probe "sources"             "${BASE}/api/v1/health/sources"         'BMKG'
probe "news-live"           "${BASE}/api/v1/news/live?limit=2"      'live'
probe "market-regime"       "${BASE}/api/v1/news/market-regime"     'volatility'
probe "incidents"           "${BASE}/api/v1/incidents?limit=2"      '"id"'
probe "chat-degraded-flag"  "${BASE}/api/v1/agent/chat"             '"degraded"' \
  -X POST -H 'Content-Type: application/json' -d '{"message":"berapa biaya hedging?"}'

echo "--- SSE stream (synthetic flood, max 120s) ---"
STREAM_OUT=$(curl -sN -X POST "${BASE}/api/v1/simulate/stream" \
  -H 'Content-Type: application/json' \
  -d '{"type":"flood","lat":3.79,"lon":98.67,"region":"north_sumatra","severity":"high","is_simulated":true}' \
  --max-time 120 2>/dev/null | grep -c "simulation_complete\|node_update" || true)
if [[ "${STREAM_OUT:-0}" -ge 2 ]]; then
  echo "PASS sse-stream (${STREAM_OUT} events)"
  PASS=$((PASS+1))
else
  echo "FAIL sse-stream (got ${STREAM_OUT:-0} matching events; cold start may exceed 120s on Render free)"
  FAIL=$((FAIL+1))
fi

echo "=== RESULT: ${PASS} pass / ${FAIL} fail ==="
[[ "$FAIL" -eq 0 ]]
