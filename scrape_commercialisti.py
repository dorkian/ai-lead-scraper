"""
Standalone scraper for Italian commercialisti.
Scrapes Google Maps → deduplicates → saves to DB → exports CSV.

Usage:
    python scrape_commercialisti.py
    python scrape_commercialisti.py --cities Milano Roma Torino
    python scrape_commercialisti.py --max-per-city 40 --out leads_it.csv
"""
import argparse
import csv
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from storage.db import init_db, get_connection
from sources.commercialisti_source import fetch_leads, ITALIAN_CITIES

CSV_FIELDS = [
    "id", "studio", "città", "indirizzo", "telefono", "sito", "maps_url", "scraped_at"
]


def _place_id_exists(place_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM leads WHERE json_extract(raw_data, '$.place_id') = ?",
            (place_id,),
        ).fetchone()
        return row is not None


def _save_it_lead(lead: dict) -> int | None:
    """Save lead if not already in DB. Returns new row id or None if duplicate."""
    place_id = lead.get("place_id")
    if place_id and _place_id_exists(place_id):
        return None
    with get_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO leads
               (source, name, company, domain, raw_data, status)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                lead["source"],
                lead.get("name"),
                lead.get("company"),
                lead.get("domain"),
                json.dumps({
                    "place_id": lead.get("place_id"),
                    "studio": lead.get("studio"),
                    "indirizzo": lead.get("indirizzo"),
                    "telefono": lead.get("telefono"),
                    "sito": lead.get("sito"),
                    "maps_url": lead.get("maps_url"),
                    "città": lead.get("città"),
                }),
                "new",
            ),
        )
        return cursor.lastrowid


def export_csv(out_path: str):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, raw_data, created_at FROM leads WHERE source = 'gmaps_it' ORDER BY created_at DESC"
        ).fetchall()

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            data = json.loads(row["raw_data"])
            writer.writerow({
                "id": row["id"],
                "studio": data.get("studio", ""),
                "città": data.get("città", ""),
                "indirizzo": data.get("indirizzo", ""),
                "telefono": data.get("telefono", ""),
                "sito": data.get("sito", ""),
                "maps_url": data.get("maps_url", ""),
                "scraped_at": row["created_at"],
            })

    print(f"\nExported {len(rows)} leads to {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Scrape Italian commercialisti from Google Maps")
    parser.add_argument(
        "--cities", nargs="+", default=None,
        metavar="CITY",
        help=f"Cities to scrape (default: all {len(ITALIAN_CITIES)} cities)",
    )
    parser.add_argument("--max-per-city", type=int, default=60, help="Max results per city (default: 60)")
    parser.add_argument("--out", default="commercialisti.csv", help="Output CSV filename")
    parser.add_argument("--export-only", action="store_true", help="Skip scraping, just re-export CSV from DB")
    args = parser.parse_args()

    init_db()

    if not args.export_only:
        cities = args.cities or ITALIAN_CITIES
        print(f"Scraping {len(cities)} cities, up to {args.max_per_city} results each...\n")

        leads = fetch_leads(cities=cities, max_per_city=args.max_per_city)

        saved = 0
        dupes = 0
        for lead in leads:
            row_id = _save_it_lead(lead)
            if row_id:
                saved += 1
            else:
                dupes += 1

        print(f"\nScrape complete: {len(leads)} found, {saved} saved, {dupes} duplicates skipped")

    export_csv(args.out)


if __name__ == "__main__":
    main()
