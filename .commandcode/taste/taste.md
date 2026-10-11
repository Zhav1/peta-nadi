# Taste

## Model & Reasoning Configuration

- Avoids Claude Sonnet/Opus models for the planning phase; prefers lighter third-party models instead (currently MiMo V2.6 Pro for planning, DeepSeek V4.1 Flash for implementation). Confidence: 0.75
- Wants reasoning/thinking effort tuned per phase: higher effort (high/max) when planning, lower effort (medium) when implementing. Confidence: 0.7
- Configures these as user-scope Command Code settings (feature-model:planning / feature-model:implementation). Confidence: 0.5
