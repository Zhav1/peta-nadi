# learnings.md — Phase 6 & Context Window Learnings

This document summarizes the technical challenges, constraints, issues, and fixes discovered during Phase 6.

---

## 1. LangGraph Concurrent Node State Overwrite (`InvalidUpdateError`)

### The Issue
During parallel node execution in LangGraph (where `osint_hazard`, `prediction`, `route_optimization`, and `economic_intelligence` run concurrently), each node returned a state dictionary containing:
```python
{"messages": state.get("messages", []) + ["Agent X: Completed."]}
```
Because the `messages` key was defined as a simple `List[str]` in `CrisisState` without a reducer function, LangGraph threw a `langgraph.errors.InvalidUpdateError: At key 'messages': Can receive only one value per step. Use an Annotated key to handle multiple values.`

### Fix Implemented
We annotated the `messages` key in [state.py](file:///d:/College/Pidi.id/agents/state.py#L105) using `Annotated[List[str], merge_messages]` with a custom merge reducer:
```python
def merge_messages(left: list, right: list) -> list:
    if not left:
        return right or []
    if not right:
        return left or []
    merged = list(left)
    for item in right:
        if item not in merged:
            merged.append(item)
    return merged
```
This reducer deduplicates existing elements and handles parallel updates gracefully.

### Key Takeaway / Constraint
- **Constraint:** In LangGraph, if multiple parallel nodes write to the *same* state key, that key **MUST** be annotated with a reducer function (like `operator.add` or a custom merge function). Otherwise, the compiled graph will crash during step execution.

---

## 2. Compiled LangGraph Input Schema Filtering

### The Issue
When passing `synthetic_crisis` parameters to `run_crisis_event()`, the input dictionary contained keys like `"event_type"` and `"source"`. However, during compiled `_compiled.ainvoke()` execution, LangGraph silently stripped these keys because they were not explicitly defined in the `CrisisState` TypedDict. This caused `data_collection_agent` to receive empty values and fallback to `"unknown"` with multiple validation errors, reducing the starting confidence score to `0.40`.

### Fix Implemented
We added `source`, `severity`, and `event_type` as optional fields directly to [CrisisState](file:///d:/College/Pidi.id/agents/state.py#L81) in the schema file:
```python
    # Input event parameters to prevent filtering
    source: Optional[str]
    severity: Optional[str]
    event_type: Optional[str]
```
This ensures they survive input filtering and are correctly parsed by the ingestion node.

### Key Takeaway / Constraint
- **Constraint:** Compiled LangGraph runtimes strictly enforce the state TypedDict schema. Any extra fields in initial inputs are automatically pruned. Always declare all expected input attributes inside the state schema definition.

---

## 3. Replicating Complex Library Mock Methods

### The Issue
Running the entire agent swarm offline required monkeypatching Supabase and Redis clients. We encountered two major API mismatch errors:
1. **Supabase Query Chaining:** The PostGIS hazard query uses `.gte()` and `.lte()` methods. The basic `MockSupabaseQuery` originally lacked these, causing crash errors.
2. **GraphRAG Cache Expiry:** GraphRAG calls `r.delete(dirty_key)` on Redis. The mock async Redis client lacked the `delete` method, failing the cache invalidation step.

### Fix Implemented
- Expanded `MockSupabaseQuery` in [run_demo.py](file:///d:/College/Pidi.id/backend/run_demo.py#L160) to implement filter-aware `eq()`, `gte()`, and `lte()` functions.
- Implemented `delete()` on `MockAsyncRedis` in [run_demo.py](file:///d:/College/Pidi.id/backend/run_demo.py#L135).

---

## 4. Bypassing External LLM and Embedding Calls in Offline Demos

### The Issue
In offline mode, `EconomicIntelligenceAgent` queries pgvector LTM via Supabase, which requires generating a text embedding via Gemini's API. If no network is present or the `GEMINI_API_KEY` is not set, this query returns an empty list, preventing the agent from retrieving historical precedents and dropping confidence scores.

### Fix Implemented
We bypassed the LLM/Embedding step by pre-calculating the SHA-256 hash of the exact query string:
`"port_closure in north_sumatra, belawan, pematangsiantar, tanjung mulia, critical severity"`
We then pre-seeded the mock Redis database with the matching key:
`lrip:ltm:cache:<query_hash>`
This causes the LTM module to hit the Redis cache immediately, avoiding any network calls or Gemini API requirements.

---

## 5. Unicode Encoding in Windows Shells

### The Issue
Printing the unicode checkmark `\u2713` in Windows PowerShell sessions caused `UnicodeEncodeError` crashes on systems with default `cp1252` terminal encoding.

### Fix Implemented
Replaced all special unicode checkmarks and symbol indicators with plain text strings (`VALIDATED` / `NOT VALIDATED`) to guarantee cross-OS terminal compatibility.
