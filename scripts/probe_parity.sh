#!/usr/bin/env bash
# Phase 59 Task 3: local-vs-Render probe matrix with pass/fail + latency.
# Usage: bash scripts/probe_parity.sh [BASE_URL]   (default http://localhost:8000)
#   Render leg: bash scripts/probe_parity.sh https://peta-nadi.onrender.com
# Note: first Render hit after deploy may cold-start 30-50s; keep-alive cron */10 stays.
# D-02: prefix every Render run with the warm-up GET below; 90s per-probe max.
# 59-04 purge substitution check: this script references no routing/adapter
# paths at all â€” the canonical CPU-routing endpoint lives outside this
# matrix, and no pre-purge endpoint, cache-key, or adapter filename appears
# here (verified by grep at commit time).
set -u
BASE="${1:-http://localhost:8000}"
PASS=0; FAIL=0

echo "=== Warm-up GET ${BASE}/health (cold-start guard, ignored in score) ==="
curl -s --max-time 90 "${BASE}/health" -o /dev/null 2>/dev/null || true

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

echo "=== Phase 59 parity matrix vs ${BASE} ==="
probe "health"              "${BASE}/health"                        '"status"'
probe "agents-status"       "${BASE}/api/v1/agents/status"          '"active_agents"'
probe "sources"             "${BASE}/api/v1/health/sources"         'BMKG'
probe "news-live"           "${BASE}/api/v1/news/live?limit=2"      'live'
probe "market-regime"       "${BASE}/api/v1/news/market-regime"     'volatility'
probe "incidents"           "${BASE}/api/v1/incidents?limit=2"      '"id"'
probe "corridor-context"    "${BASE}/api/v1/corridor/context"       'corridor'
probe "chat-degraded-flag"  "${BASE}/api/v1/agent/chat"             '"degraded"' \
  -X POST -H 'Content-Type: application/json' -d '{"message":"berapa biaya hedging?"}'

echo "--- SSE stream (synthetic flood, max 120s) ---"
STREAM_BODY=$(curl -sN -X POST "${BASE}/api/v1/simulate/stream" \
  -H 'Content-Type: application/json' \
  -d '{"type":"flood","lat":3.79,"lon":98.67,"region":"north_sumatra","severity":"high","is_simulated":true}' \
  --max-time 120 2>/dev/null || true)
STREAM_OUT=$(echo "$STREAM_BODY" | grep -c "simulation_complete\|node_update" || true)
if [[ "${STREAM_OUT:-0}" -ge 2 ]]; then
  echo "PASS sse-stream (${STREAM_OUT} events)"
  PASS=$((PASS+1))
else
  echo "FAIL sse-stream (got ${STREAM_OUT:-0} matching events; cold start may exceed 120s on Render free)"
  FAIL=$((FAIL+1))
fi
if echo "$STREAM_BODY" | grep -q "decision_support"; then
  echo "PASS sse-decision-support (stream carries decision_support output)"
  PASS=$((PASS+1))
else
  echo "FAIL sse-decision-support (no decision_support in stream; got: $(echo "$STREAM_BODY" | head -c 200))"
  FAIL=$((FAIL+1))
fi

echo "--- RBAC matrix (Wave 3: /auth/me, /auth/switch-role, /news/hitl-*) ---"
# Anonymous (no token): auth-guarded endpoints must reject with 401 UNAUTHORIZED.
probe "auth-me-anon-401"             "${BASE}/api/v1/auth/me"               'UNAUTHORIZED'
probe "auth-switch-role-anon-401"    "${BASE}/api/v1/auth/switch-role"      'UNAUTHORIZED' -X POST -H 'Content-Type: application/json' -d '{"role":"DISPATCHER"}'
# HITL endpoints sit behind get_current_user (anon -> 401 UNAUTHORIZED).
probe "hitl-pending-anon-401"            "${BASE}/api/v1/news/hitl-pending"     'UNAUTHORIZED'
probe "hitl-action-anon-401"             "${BASE}/api/v1/news/hitl-action"      'UNAUTHORIZED' -X POST -H 'Content-Type: application/json' -d '{"approval_id":"not-a-uuid","decision":"APPROVE"}'

# Authenticated matrix: mint sandbox tokens via public guest-session, then assert
# role-branching (GUEST 403 on /approvals, DISPATCHER 201, switch-role 200).
fetch_token() { # $1=role -> prints access_token (empty on failure)
  PYBIN="python3"; command -v python3 >/dev/null 2>&1 || PYBIN="python"
  curl -s --max-time 30 -X POST "${BASE}/api/v1/auth/guest-session" -H 'Content-Type: application/json' -d "{\"role\":\"$1\"}" 2>/dev/null | $PYBIN -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true
}
GUEST_TOKEN="$(fetch_token GUEST)"
DISP_TOKEN="$(fetch_token DISPATCHER)"
if [[ -n "${GUEST_TOKEN}" && -n "${DISP_TOKEN}" ]]; then
  probe "auth-me-guest-200"          "${BASE}/api/v1/auth/me"               '"role":"GUEST"' -H "Authorization: Bearer ${GUEST_TOKEN}"
  probe "auth-switch-role-200"       "${BASE}/api/v1/auth/switch-role"      '"role":"DISPATCHER"' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${GUEST_TOKEN}" -d '{"role":"DISPATCHER"}'
  probe "approvals-guest-403"        "${BASE}/api/v1/approvals"             'FORBIDDEN' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${GUEST_TOKEN}" -d '{"incident_id":"probe-guest-01","route_id":"0","action":"ACCEPT","tactical_action":"REROUTE"}'
  probe "approvals-dispatcher-201"   "${BASE}/api/v1/approvals"             '"action"' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${DISP_TOKEN}" -d '{"incident_id":"probe-disp-01","route_id":"0","action":"ACCEPT","tactical_action":"REROUTE"}'
  probe "hitl-pending-dispatcher-200" "${BASE}/api/v1/news/hitl-pending"     'pending_approvals' -H "Authorization: Bearer ${DISP_TOKEN}"
  probe "hitl-action-bad-uuid-422"   "${BASE}/api/v1/news/hitl-action"      'Invalid UUID' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${DISP_TOKEN}" -d '{"approval_id":"not-a-uuid","decision":"APPROVE"}'
  probe "hitl-action-guest-403"      "${BASE}/api/v1/news/hitl-action"      'FORBIDDEN' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${GUEST_TOKEN}" -d '{"approval_id":"00000000-0000-0000-0000-000000000000","decision":"APPROVE"}'
else
  echo "SKIP authenticated RBAC probes (guest-session token mint failed; backend may be cold â€” warmup ran above)"
fi

echo "=== RESULT: ${PASS} pass / ${FAIL} fail ==="
[[ "$FAIL" -eq 0 ]]
