# ai-lead-scraper

A lead scraper built with FastAPI + Google Maps Places API. Pulls name, phone, website, and rating for every business matching a keyword + location query. Costs $0/month to run on Google's free tier.

## Stack
- Python 3.12 + FastAPI
- Google Maps Places API (free tier — 2,500 requests/day)
- async httpx for concurrent requests
- n8n webhook integration for CRM export

## How it works

1. **Search** — call Places API with keyword + location → list of place IDs
2. **Enrich** — fetch details per place: name, phone, website, rating
3. **Filter** — drop entries missing phone or website (low-intent leads)
4. **Export** — write to CSV or POST to CRM via n8n webhook

Pulls 500+ qualified leads per hour. Rate-limited with `asyncio.sleep(0.2)` and a semaphore capping concurrent calls at 5.

## Setup

```bash
pip install -r requirements.txt
export MAPS_KEY=your_google_maps_api_key
python main.py
```

## API

```
GET /leads?keyword=plumber&location=41.9028,12.4964&radius=5000
```

Returns JSON array of leads with `name`, `phone`, `website`, `rating`.

---

Built by [Ash Dorkian](https://linkedin.com/in/ashkandorkian) — Ashkian
