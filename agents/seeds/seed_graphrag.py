import os
import sys
import json
import asyncio

# Ensure project directories are in PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backend"))

from app.db.supabase_client import get_client


async def seed_graphrag():
    print("[SEED-GRAPHRAG] Starting GraphRAG database seeding...")
    supabase = get_client()

    # 1. Load entities
    entities_path = os.path.join(os.path.dirname(__file__), "entities.json")
    with open(entities_path, "r", encoding="utf-8") as f:
        entities = json.load(f)
        
    print(f"[SEED-GRAPHRAG] Loaded {len(entities)} entities from JSON.")
    
    # Insert entities and keep track of name -> UUID mapping
    name_to_uuid = {}
    for idx, ent in enumerate(entities):
        name = ent["name"]
        print(f"[SEED-GRAPHRAG] Inserting entity: {name}...")
        try:
            # Check if exists
            existing = supabase.table("entities").select("entity_id").eq("name", name).execute()
            if existing.data:
                uuid = existing.data[0]["entity_id"]
                supabase.table("entities").update(ent).eq("entity_id", uuid).execute()
                print(f"[SEED-GRAPHRAG] Updated existing: {name} ({uuid})")
            else:
                res = supabase.table("entities").insert(ent).execute()
                uuid = res.data[0]["entity_id"]
                print(f"[SEED-GRAPHRAG] Inserted: {name} ({uuid})")
            name_to_uuid[name] = uuid
        except Exception as e:
            print(f"[SEED-GRAPHRAG] Error inserting entity '{name}': {e}")

    # 2. Load relations
    relations_path = os.path.join(os.path.dirname(__file__), "relations.json")
    with open(relations_path, "r", encoding="utf-8") as f:
        relations = json.load(f)
        
    print(f"[SEED-GRAPHRAG] Loaded {len(relations)} relations from JSON.")
    
    for idx, rel in enumerate(relations):
        from_name = rel["from_entity"]
        to_name = rel["to_entity"]
        
        from_uuid = name_to_uuid.get(from_name)
        to_uuid = name_to_uuid.get(to_name)
        
        if not from_uuid or not to_uuid:
            print(f"[SEED-GRAPHRAG] Error: Cannot resolve relationship {from_name} ({from_uuid}) -> {to_name} ({to_uuid}). Skipping.")
            continue
            
        print(f"[SEED-GRAPHRAG] Inserting relation: {from_name} -> {to_name} ({rel['relation_type']})...")
        
        db_rel = {
            "from_entity": from_uuid,
            "to_entity": to_uuid,
            "relation_type": rel["relation_type"],
            "weight": rel["weight"]
        }
        
        try:
            # Check if exists
            existing = supabase.table("entity_relations").select("relation_id").eq("from_entity", from_uuid).eq("to_entity", to_uuid).eq("relation_type", rel["relation_type"]).execute()
            if existing.data:
                rel_id = existing.data[0]["relation_id"]
                supabase.table("entity_relations").update(db_rel).eq("relation_id", rel_id).execute()
                print(f"[SEED-GRAPHRAG] Updated existing relation: {rel_id}")
            else:
                res = supabase.table("entity_relations").insert(db_rel).execute()
                print(f"[SEED-GRAPHRAG] Inserted relation: {res.data[0]['relation_id']}")
        except Exception as e:
            print(f"[SEED-GRAPHRAG] Error inserting relation {from_name} -> {to_name}: {e}")

    # 3. Seed road graph edges
    print("[SEED-GRAPHRAG] Seeding road graph edges...")
    road_edges = [
        {"from_node": "Belawan Port", "to_node": "Medan Interchange", "distance_km": 26.0, "base_weight": 1.0, "corridor": "belawan_access"},
        {"from_node": "Medan Interchange", "to_node": "Binjai km 18", "distance_km": 22.0, "base_weight": 1.0, "corridor": "trans_sumatra"},
        {"from_node": "Binjai km 18", "to_node": "Stabat Junction", "distance_km": 18.0, "base_weight": 1.0, "corridor": "trans_sumatra"},
        {"from_node": "Stabat Junction", "to_node": "Tanjung Pura", "distance_km": 24.0, "base_weight": 1.0, "corridor": "trans_sumatra"},
        {"from_node": "Tanjung Pura", "to_node": "Pangkalan Brandan", "distance_km": 30.0, "base_weight": 1.0, "corridor": "trans_sumatra"},
        {"from_node": "Medan Interchange", "to_node": "Lubuk Pakam", "distance_km": 33.0, "base_weight": 1.0, "corridor": "trans_sumatra_south"},
        {"from_node": "Lubuk Pakam", "to_node": "Tebing Tinggi", "distance_km": 42.0, "base_weight": 1.0, "corridor": "trans_sumatra_south"},
        {"from_node": "Tebing Tinggi", "to_node": "Pematangsiantar", "distance_km": 48.0, "base_weight": 1.0, "corridor": "trans_sumatra_south"},
        {"from_node": "Pematangsiantar", "to_node": "Parapat", "distance_km": 46.0, "base_weight": 1.0, "corridor": "trans_sumatra_south"},
        {"from_node": "Tebing Tinggi", "to_node": "Kisaran", "distance_km": 98.0, "base_weight": 1.0, "corridor": "trans_sumatra_east"},
        {"from_node": "Kisaran", "to_node": "Rantau Prapat", "distance_km": 145.0, "base_weight": 1.0, "corridor": "trans_sumatra_east"},
        {"from_node": "Rantau Prapat", "to_node": "Kota Pinang", "distance_km": 54.0, "base_weight": 1.0, "corridor": "trans_sumatra_east"},
        {"from_node": "Kota Pinang", "to_node": "Bagan Batu", "distance_km": 72.0, "base_weight": 1.0, "corridor": "trans_sumatra_east"},
        {"from_node": "Bagan Batu", "to_node": "Dumai Port", "distance_km": 160.0, "base_weight": 1.0, "corridor": "trans_sumatra_east"},
        {"from_node": "Kisaran", "to_node": "Tanjung Balai Port", "distance_km": 25.0, "base_weight": 1.0, "corridor": "tanjung_balai_access"}
    ]

    for edge in road_edges:
        from_n = edge["from_node"]
        to_n = edge["to_node"]
        print(f"[SEED-GRAPHRAG] Inserting road edge: {from_n} -> {to_n}...")
        try:
            existing = supabase.table("road_graph_edges").select("edge_id").eq("from_node", from_n).eq("to_node", to_n).execute()
            if existing.data:
                e_id = existing.data[0]["edge_id"]
                supabase.table("road_graph_edges").update(edge).eq("edge_id", e_id).execute()
                print(f"[SEED-GRAPHRAG] Updated existing road edge: {e_id}")
            else:
                res = supabase.table("road_graph_edges").insert(edge).execute()
                print(f"[SEED-GRAPHRAG] Inserted road edge: {res.data[0]['edge_id']}")
        except Exception as e:
            print(f"[SEED-GRAPHRAG] Error inserting road edge {from_n} -> {to_n}: {e}")
            
    print("[SEED-GRAPHRAG] Seeding complete!")


if __name__ == "__main__":
    from dotenv import load_dotenv
    backend_env = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backend", ".env")
    load_dotenv(backend_env)
    
    asyncio.run(seed_graphrag())
