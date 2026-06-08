import os
import re
from urllib.parse import urlparse

import googlemaps
from dotenv import load_dotenv

load_dotenv()


def extract_domain(url: str) -> str | None:
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc or parsed.path
    return host.removeprefix("www.") or None


def fetch_leads(config: dict, max_results: int = 50) -> list[dict]:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY not set")

    gmaps = googlemaps.Client(key=api_key)
    query = f"{config['target']['industry']} in {config['target']['location']}"
    results = gmaps.places(query=query)

    leads = []
    for place in results.get("results", [])[:max_results]:
        detail = gmaps.place(
            place["place_id"],
            fields=["name", "website", "formatted_phone_number"],
        )
        result = detail.get("result", {})
        domain = extract_domain(result.get("website", ""))
        leads.append(
            {
                "source": "gmaps",
                "name": None,
                "company": result.get("name"),
                "domain": domain,
                "raw_data": result,
            }
        )

    return leads
