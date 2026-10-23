-- ==============================================================================
-- 015: Seed the knowledge-graph relationship edges
-- ==============================================================================
-- 000_init.sql seeds 8 kg_entities but zero kg_relationships, so the GraphRAG
-- causal BFS (agents/tools/graphrag.py) always returned an empty chain even
-- after switching from the legacy entities/entity_relations tables to kg_*.
-- These edges encode the North Sumatra corridor dependency chain used by
-- Agent 6's executive briefing.
-- ==============================================================================

-- Idempotency: one edge per (from, to, relation) triple.
CREATE UNIQUE INDEX IF NOT EXISTS kg_relationships_unique_edge
  ON kg_relationships (from_entity, to_entity, relation);

INSERT INTO kg_relationships (from_entity, to_entity, relation, weight)
SELECT f.id, t.id, v.relation, v.weight
FROM (VALUES
  -- Belawan disruption propagates through the local corridor and the highway
  ('Belawan Port',          'Medan-Belawan Corridor', 'ships_via',     0.95),
  ('Medan-Belawan Corridor','Trans-Sumatra Highway',  'connects_to',   0.90),
  ('Trans-Sumatra Highway', 'Dumai Port',             'connects_to',   0.80),
  ('Dumai Port',            'Trans-Sumatra Highway',  'connects_to',   0.80),
  -- Geography + downstream food commodities (causal impact surface)
  ('Belawan Port',          'North Sumatra',          'located_in',    1.00),
  ('North Sumatra',         'Rice',                   'produces',      0.85),
  ('North Sumatra',         'Chili',                  'produces',      0.85),
  ('North Sumatra',         'Cooking Oil',            'produces',      0.75),
  ('Belawan Port',          'Rice',                   'supplies',      0.85),
  ('Belawan Port',          'Chili',                  'supplies',      0.80),
  ('Belawan Port',          'Cooking Oil',            'supplies',      0.75)
) AS v(from_name, to_name, relation, weight)
JOIN kg_entities f ON f.name = v.from_name
JOIN kg_entities t ON t.name = v.to_name
ON CONFLICT (from_entity, to_entity, relation) DO NOTHING;
