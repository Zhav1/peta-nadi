# Phase 83: Zero-Token Pre-LLM Filtering & DeepSeek Distillation Pipeline

**Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine  
**Phase:** 83  
**Status:** READY TO PLAN 📋  
**Scope:** News Ingestion & Scraping Pre-Processing, Keyword Gating, Token Optimization, DeepSeek Distillation  

---

## 1. Problem Statement
The current pipeline scrapes web pages when descriptions are short (<450 chars) and passes raw narrative text up to 1,600 characters directly to the DeepSeek driver model. This introduces:
1. Massive token consumption (several thousand tokens per batch).
2. False-positive disaster classifications triggered by navigation menus, sidebars, advertisements, and non-disaster commentary.
3. Latency bottlenecks and occasional empty reasoning crashes from chain-of-thought `<think>` generation.

## 2. Deliverables & Work Packages

### WP1: Deterministic DOM / Boilerplate & Ad Stripper
- Location: `backend/app/services/news_aggregator.py` (`extract_lead_text_from_html`, `enrich_article_description_if_needed`).
- Strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<aside>`, and ad banners using optimized regex (0 external dependencies).
- Prioritizes `og:description` and primary `<p>` tags within `.entry-content` or `<article>`.
- Drops common noise phrases: `"baca juga"`, `"advertisement"`, `"infotorial"`, `"kolom pakar"`, `"opini"`.

### WP2: Two-Factor Sumatra Disaster & Location Regex Gate
- Location: `backend/app/nlp/news_extractor.py`.
- Enforces co-occurrence of Disaster Keywords AND Sumatra Location Anchors:
  - Disaster regex: `\b(banjir|longsor|tanah amblas|jalan putus|jembatan putus|gempa|erupsi|gelombang tinggi|truk terguling|kemacetan parah|pelabuhan tutup)\b`
  - Location regex: `\b(sumatera|sumut|sumbar|aceh|riau|jambi|sumsel|bengkulu|lampung|medan|belawan|tebing tinggi|asahan|deli serdang|langkat|sitinjau|padang|bukittinggi|pekanbaru|dumai|palembang|bakauheni)\b`
- Candidates missing either predicate are marked `DROPPED_IRRELEVANT` immediately (0 tokens spent).

### WP3: Text Clamping & Distillation Engine
- Location: `backend/app/nlp/news_extractor.py`.
- Clamps article payload to Title ($\le 120$ chars) + Lead text ($\le 400$ chars).
- Reduces input token load per candidate article from 1,600 chars down to $<400$ chars ($>80\%$ savings).

### WP4: Compact Single-Shot DeepSeek JSON Schema & `<think>` Stripper
- Location: `agents/llm_gateway.py` & `backend/app/nlp/news_extractor.py`.
- Strict single-turn JSON schema:
  ```json
  {
    "is_disaster": true,
    "type": "flood",
    "location": "Tebing Tinggi",
    "confidence": 0.95
  }
  ```
- Strips any `<think>...</think>` internal reasoning tags from the model output before parsing.

## 3. Verification Criteria
- `backend/tests/test_pre_llm_filter.py`:
  - Assert non-disaster and non-Sumatra articles drop at 0 token cost.
  - Assert valid disaster articles are clamped $\le 400$ chars.
  - Assert JSON output matches schema without `<think>` tokens.
