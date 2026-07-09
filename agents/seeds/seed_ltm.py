import os
import sys
import json
import asyncio

# Ensure project directories are in PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backend"))

from app.db.supabase_client import get_client
from agents.memory.ltm import embed_text


async def seed_ltm():
    print("[SEED-LTM] Starting LTM database seeding...")
    
    # 1. Read historical_episodes.json
    seed_file_path = os.path.join(os.path.dirname(__file__), "historical_episodes.json")
    if not os.path.exists(seed_file_path):
        print(f"[SEED-LTM] Error: {seed_file_path} not found.")
        return
        
    with open(seed_file_path, "r", encoding="utf-8") as f:
        episodes = json.load(f)
        
    print(f"[SEED-LTM] Loaded {len(episodes)} episodes from JSON.")
    
    supabase = get_client()
    success_count = 0
    
    # 2. Iterate and embed each episode
    for idx, ep in enumerate(episodes):
        title = ep["title"]
        desc = ep["description"]
        embed_payload = f"{title}. {desc}"
        
        print(f"[SEED-LTM] [{idx+1}/{len(episodes)}] Embedding '{title}'...")
        embedding = await embed_text(embed_payload)
        
        if not embedding:
            print(f"[SEED-LTM] Warning: Failed to generate embedding for '{title}'. Skipping database insert.")
            continue
            
        # 3. Prepare db payload
        db_payload = {
            "title": ep["title"],
            "description": ep["description"],
            "crisis_type": ep["crisis_type"],
            "affected_region": ep["affected_region"],
            "affected_commodities": ep["affected_commodities"],
            "inflation_multiplier": ep["inflation_multiplier"],
            "recovery_days": ep["recovery_days"],
            "sources": ep["sources"],
            "embedding": embedding
        }
        
        # 4. Upsert into Supabase
        try:
            # We check if an episode with the same title already exists
            existing = supabase.table("historical_episodes").select("episode_id").eq("title", title).execute()
            if existing.data:
                # Update
                ep_id = existing.data[0]["episode_id"]
                supabase.table("historical_episodes").update(db_payload).eq("episode_id", ep_id).execute()
                print(f"[SEED-LTM] Updated existing episode ID: {ep_id}")
            else:
                # Insert
                res = supabase.table("historical_episodes").insert(db_payload).execute()
                print(f"[SEED-LTM] Inserted new episode: {res.data[0]['episode_id']}")
            success_count += 1
        except Exception as e:
            print(f"[SEED-LTM] Error saving '{title}' to Supabase: {e}")
            
    print(f"[SEED-LTM] Seeding complete! Successfully seeded {success_count}/{len(episodes)} episodes.")


if __name__ == "__main__":
    # Ensure environment variables are loaded
    from dotenv import load_dotenv
    # Try loading .env from backend folder first
    backend_env = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backend", ".env")
    load_dotenv(backend_env)
    
    asyncio.run(seed_ltm())
