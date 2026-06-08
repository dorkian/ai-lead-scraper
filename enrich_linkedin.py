"""
LinkedIn profile URL enrichment for Lead Rescue Lite.

Two modes:
  --mode google   Auto-searches Google for each studio's LinkedIn profile.
                  Conservative rate limit (5s between requests).
                  Writes linkedin_url back to LRL dev.db.

  --mode urls     Generates a CSV of search URLs — no automation,
                  zero ban risk. You open the links manually and paste
                  the profile URLs back.

Usage:
  python enrich_linkedin.py --mode google --limit 50
  python enrich_linkedin.py --mode urls --out linkedin_searches.csv
  python enrich_linkedin.py --mode google --db C:/projects/lead-rescue-lite/backend/dev.db
"""

import argparse
import csv
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

DEFAULT_DB = Path("C:/projects/lead-rescue-lite/backend/dev.db")
DELAY_SECONDS = 5   # Google rate limit — do not lower below 3


# ── helpers ────────────────────────────────────────────────────────────────────

def get_leads_without_linkedin(conn: sqlite3.Connection, limit: int) -> list[dict]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT lead_id, business_name, citta
        FROM leads
        WHERE linkedin_url IS NULL
          AND business_name IS NOT NULL
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def save_linkedin_url(conn: sqlite3.Connection, lead_id: str, url: str):
    conn.execute(
        "UPDATE leads SET linkedin_url = ? WHERE lead_id = ?",
        (url, lead_id),
    )
    conn.commit()


def google_search_url(studio: str, citta: str) -> str:
    q = f'site:linkedin.com/in "{studio}" commercialista "{citta}"'
    return f"https://www.google.com/search?q={urllib.parse.quote(q)}"


def linkedin_search_url(studio: str, citta: str) -> str:
    q = f"{studio} commercialista {citta}"
    return f"https://www.linkedin.com/search/results/people/?keywords={urllib.parse.quote(q)}"


# ── mode: urls ─────────────────────────────────────────────────────────────────

def mode_urls(db_path: Path, out_path: Path, limit: int):
    """Generate a CSV of search links — manual workflow, zero risk."""
    if not db_path.exists():
        print(f"DB not found: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    leads = get_leads_without_linkedin(conn, limit)
    conn.close()

    if not leads:
        print("No leads without LinkedIn URL found.")
        return

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "lead_id", "business_name", "citta",
            "google_url", "linkedin_search_url", "linkedin_url"
        ])
        writer.writeheader()
        for lead in leads:
            studio = lead["business_name"] or ""
            citta  = lead["citta"] or ""
            writer.writerow({
                "lead_id":             lead["lead_id"],
                "business_name":       studio,
                "citta":               citta,
                "google_url":          google_search_url(studio, citta),
                "linkedin_search_url": linkedin_search_url(studio, citta),
                "linkedin_url":        "",  # fill this in manually
            })

    print(f"Generated {len(leads)} search links -> {out_path}")
    print()
    print("Next steps:")
    print("  1. Open the CSV")
    print("  2. Click 'google_url' for each row to find the LinkedIn profile")
    print("  3. Paste the profile URL into the 'linkedin_url' column")
    print("  4. Run: python enrich_linkedin.py --mode import --csv", out_path)


# ── mode: import (paste results back) ─────────────────────────────────────────

def mode_import(db_path: Path, csv_path: Path):
    """Read completed CSV (with linkedin_url filled in) and write to DB."""
    if not db_path.exists():
        print(f"DB not found: {db_path}")
        sys.exit(1)
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    saved = skipped = 0

    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            url = row.get("linkedin_url", "").strip()
            lead_id = row.get("lead_id", "").strip()
            if url and lead_id:
                save_linkedin_url(conn, lead_id, url)
                saved += 1
            else:
                skipped += 1

    conn.close()
    print(f"Imported: {saved} URLs saved, {skipped} rows skipped (empty url)")


# ── mode: google (automated) ──────────────────────────────────────────────────

def mode_google(db_path: Path, limit: int):
    """Auto-search Google for each studio. Slow but hands-off."""
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("Missing dependencies. Run: pip install requests beautifulsoup4")
        sys.exit(1)

    if not db_path.exists():
        print(f"DB not found: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    leads = get_leads_without_linkedin(conn, limit)

    if not leads:
        print("No leads without LinkedIn URL found.")
        conn.close()
        return

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }

    saved = failed = 0
    print(f"Enriching {len(leads)} leads (1 every {DELAY_SECONDS}s)...")

    for i, lead in enumerate(leads, 1):
        studio = lead["business_name"] or ""
        citta  = lead["citta"] or ""
        url    = google_search_url(studio, citta)

        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 429:
                print(f"  [{i}] Rate limited by Google. Stop here and wait a few minutes.")
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            linkedin_url = None

            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "linkedin.com/in/" in href:
                    # Clean Google redirect URLs
                    if href.startswith("/url?"):
                        parsed = urllib.parse.urlparse(href)
                        qs = urllib.parse.parse_qs(parsed.query)
                        href = qs.get("q", [href])[0]
                    if "linkedin.com/in/" in href:
                        linkedin_url = href.split("?")[0]  # strip tracking params
                        break

            if linkedin_url:
                save_linkedin_url(conn, lead["lead_id"], linkedin_url)
                print(f"  [{i}/{len(leads)}] {studio[:40]} → {linkedin_url}")
                saved += 1
            else:
                print(f"  [{i}/{len(leads)}] {studio[:40]} → not found")
                failed += 1

        except Exception as e:
            print(f"  [{i}] Error for {studio}: {e}")
            failed += 1

        if i < len(leads):
            time.sleep(DELAY_SECONDS)

    conn.close()
    print(f"\nDone: {saved} found, {failed} not found")
    print("Tip: run --mode urls for the remaining leads and fill manually.")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Enrich leads with LinkedIn profile URLs")
    p.add_argument("--mode",  choices=["google", "urls", "import"], default="urls")
    p.add_argument("--db",    type=Path, default=DEFAULT_DB)
    p.add_argument("--limit", type=int,  default=50,
                   help="Max leads to process (google/urls modes)")
    p.add_argument("--out",   type=Path, default=Path("linkedin_searches.csv"),
                   help="Output CSV path (urls mode)")
    p.add_argument("--csv",   type=Path, default=Path("linkedin_searches.csv"),
                   help="Input CSV path (import mode)")
    args = p.parse_args()

    if args.mode == "urls":
        mode_urls(args.db, args.out, args.limit)
    elif args.mode == "import":
        mode_import(args.db, args.csv)
    elif args.mode == "google":
        mode_google(args.db, args.limit)


if __name__ == "__main__":
    main()
