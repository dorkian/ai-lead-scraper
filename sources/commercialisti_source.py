import os
import time

import googlemaps
from dotenv import load_dotenv

load_dotenv()

# Top Italian cities to query — expand as needed
ITALIAN_CITIES = [
    "Milano", "Roma", "Torino", "Bologna", "Firenze",
    "Napoli", "Verona", "Padova", "Brescia", "Bergamo",
    "Genova", "Palermo", "Bari", "Catania", "Venezia",
    "Modena", "Parma", "Reggio Emilia", "Prato", "Perugia",
]

DETAIL_FIELDS = [
    "name",
    "formatted_address",
    "formatted_phone_number",
    "website",
    "place_id",
    "url",
]

# Seconds to wait between Google Maps pagination requests (required by API)
_PAGE_WAIT = 2


def fetch_city(gmaps: googlemaps.Client, city: str, max_per_city: int) -> list[dict]:
    query = f"commercialista {city}"
    raw = gmaps.places(query=query)
    places = raw.get("results", [])

    # Paginate up to 3 pages (60 results max per city)
    while raw.get("next_page_token") and len(places) < max_per_city:
        time.sleep(_PAGE_WAIT)
        raw = gmaps.places(query=query, page_token=raw["next_page_token"])
        places.extend(raw.get("results", []))

    leads = []
    seen_ids = set()
    for place in places[:max_per_city]:
        pid = place.get("place_id")
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)

        detail = gmaps.place(pid, fields=DETAIL_FIELDS).get("result", {})
        leads.append({
            "source": "gmaps_it",
            "place_id": pid,
            "studio": detail.get("name", ""),
            "indirizzo": detail.get("formatted_address", ""),
            "telefono": detail.get("formatted_phone_number", ""),
            "sito": detail.get("website", ""),
            "maps_url": detail.get("url", ""),
            "città": city,
            # Standard fields expected by db.save_lead
            "company": detail.get("name", ""),
            "domain": _extract_domain(detail.get("website", "")),
            "name": None,
            "raw_data": detail,
        })
        time.sleep(0.1)  # polite pause between detail calls

    return leads


def fetch_leads(cities: list[str] = None, max_per_city: int = 60) -> list[dict]:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY not set in .env")

    gmaps = googlemaps.Client(key=api_key)
    target_cities = cities or ITALIAN_CITIES
    all_leads = []

    for city in target_cities:
        print(f"  Scraping {city}...", end=" ", flush=True)
        try:
            city_leads = fetch_city(gmaps, city, max_per_city)
            print(f"{len(city_leads)} results")
            all_leads.extend(city_leads)
        except Exception as e:
            print(f"ERROR: {e}")

    return all_leads


def _extract_domain(url: str) -> str | None:
    if not url:
        return None
    from urllib.parse import urlparse
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc or parsed.path
    return host.removeprefix("www.") or None
