# Redis Setup — PetaNadi

## Recommended: Upstash Redis (Cloud, Zero Local Setup)

Upstash is the fastest path for a solo hackathon build. Free tier gives you 10,000 commands/day, which is more than enough for development.

### Setup Steps

1. Go to https://console.upstash.com
2. Click **"Create Database"**
3. Name: `lrip-petanadi`, Region: **Singapore** (closest to Indonesia)
4. Type: **Regional** (not Global — cheaper, sufficient)
5. After creation, click **"Details"** tab
6. Copy:
   - **Endpoint** (e.g., `your-db.upstash.io`)
   - **Port** (typically `6379`)
   - **Password**
7. Your `REDIS_URL` format: `rediss://:PASSWORD@ENDPOINT:PORT`

### Add to .env

```
REDIS_URL=rediss://:your-password@your-db.upstash.io:6379
REDIS_PASSWORD=your-password
```

### Verify Connection

```bash
cd backend
.venv\Scripts\activate
python -c "
import redis, os
from dotenv import load_dotenv
load_dotenv()
r = redis.from_url(os.getenv('REDIS_URL'))
print('PING:', r.ping())
r.xadd('test-stream', {'event': 'ping', 'source': 'setup-test'})
print('XADD: OK')
"
```

Expected output:
```
PING: True
XADD: OK
```

---

## Alternative: Local Redis via Memurai (Windows-native)

If you need fully offline operation for the hackathon demo, install Memurai:

```powershell
winget install Memurai.Memurai
```

Then set:
```
REDIS_URL=redis://localhost:6379
```

Memurai runs as a Windows service and is API-compatible with Redis.

---

## Redis Streams Design

The platform uses two Redis data structures:

| Structure | Key Pattern | Purpose |
|-----------|------------|---------|
| Stream | `lrip:events:{source}` | Incoming raw events from each API adapter |
| KV | `lrip:state:crisis:{id}` | Short-Term Memory (STM) — active crisis state |
| KV | `lrip:state:source:{name}` | Last-known-good cache per data source |

Example stream keys:
- `lrip:events:bmkg` — BMKG weather events
- `lrip:events:tomtom` — TomTom congestion events
- `lrip:events:nasa_firms` — NASA wildfire polygons
- `lrip:events:pihps` — PIHPS commodity price updates
