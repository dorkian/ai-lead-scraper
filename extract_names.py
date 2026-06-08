"""
extract_names.py

Reads commercialisti.csv (original scrape with website URLs),
extracts the accountant's personal name from the website domain,
joins to Lead Rescue Lite DB via phone number to get lead_id,
and generates direct LinkedIn People search URLs.

Output CSV has columns:
  lead_id, name, citta, quality, linkedin_search, linkedin_url

Quality levels:
  HIGH   = full first + last name extracted (best LinkedIn search results)
  MEDIUM = surname only (search still works, just more manual filtering)
  SKIP   = couldn't extract a usable name (leave blank, handle separately)

Usage:
  python extract_names.py
  python extract_names.py --csv commercialisti.csv --db C:/projects/lead-rescue-lite/backend/dev.db --out linkedin_names.csv
"""

import argparse
import csv
import re
import sqlite3
import urllib.parse
from pathlib import Path
from urllib.parse import urlparse

# ── Common Italian first names for domain splitting ───────────────────────────

ITALIAN_FIRST_NAMES = {
    "ada", "adele", "adriana", "adriano", "agnese", "alba", "alberto",
    "aldo", "alessandra", "alessandrea", "alessandro", "alessia", "alice",
    "alida", "allegra", "amalia", "ambrogio", "ambrogini", "andrea", "angela",
    "angelo", "anna", "annamaria", "antonio", "arianna", "aurora",
    "barbara", "beatrice", "benedetta", "beniamino", "bianca", "bruna", "bruno",
    "camilla", "carla", "carlo", "carmela", "carmine", "caterina", "cecilia",
    "cesare", "chiara", "christian", "cinzia", "claudio", "cristiana",
    "cristiano", "cristina",
    "daniele", "daniela", "dario", "davide", "diana", "diego", "domenica",
    "domenico", "donato",
    "edoardo", "egidio", "elena", "eleonora", "elisa", "elisabetta", "emilia",
    "emilio", "emma", "enrica", "enrico", "enzo",
    "fabio", "fabiola", "fabrizio", "federica", "federico", "felice",
    "filippo", "flavia", "flavio", "fiorella", "fiorentina", "franco",
    "francesca", "francesco", "fulvia", "fulvio",
    "gabriele", "gabriella", "gaetano", "giacomo", "gianfranco", "gianluca",
    "gianmarco", "gianni", "giancarlo", "gianpaolo", "gianpiero", "gianvito",
    "giorgia", "giorgio", "giovanna", "giovanni", "giuditta", "giulia",
    "giuliana", "giuliano", "giulio", "giuseppe", "gloria", "grazia",
    "graziella",
    "ileana", "ilenia", "irene", "ivano",
    "lara", "laura", "letizia", "lisa", "lorella", "lorena", "lorenza",
    "lorenzo", "luca", "lucia", "luciana", "luciano", "luigi",
    "manuela", "marco", "margherita", "maria", "mariano", "mariagrazia",
    "marianna", "mario", "martina", "massimiliano", "massimo", "matteo",
    "mattia", "mauro", "maurizio", "michela", "michele", "mirella",
    "monica", "moreno",
    "nicola", "nicoletta",
    "oscar",
    "paola", "paolo", "patrizia", "pier", "piera", "piero", "piero",
    "raffaele", "raffaella", "renato", "riccardo", "rita", "roberto", "rosa",
    "rosaria", "rosario", "rossella",
    "sabrina", "salvatore", "samantha", "sara", "sergio", "silvia",
    "silvana", "silvano", "simona", "simone", "sofia", "stefania", "stefano",
    "susanna",
    "teresa", "tiziana", "tiziano", "tommaso",
    "valentina", "valeria", "valerio", "vincenzo",
}

# ── Noise words to strip from domain names ────────────────────────────────────

DOMAIN_NOISE = {
    "studio", "studi", "commercialista", "commercialisti", "contabile",
    "tributario", "tributaria", "legale", "consulenze", "consulenza",
    "consulente", "commerciale", "professionista", "professionisti",
    "revisore", "contabili", "lavoro", "associati", "associato", "eassociati",
    "dottore", "dottori", "dott", "www", "notaio", "avvocato", "avvocati",
    "fiscale", "fiscali", "contabilita", "fiscalita", "servizi", "impresa",
}

# ── Domain name → person name ─────────────────────────────────────────────────

def _clean_domain(url: str) -> str:
    """Strip URL to just the relevant part of the domain name."""
    try:
        host = urlparse(url).netloc or urlparse("http://" + url).netloc
    except Exception:
        return ""

    # Remove www. prefix
    host = re.sub(r"^www\.", "", host, flags=re.IGNORECASE)

    # Take only the domain part (before first dot)
    name_part = host.split(".")[0].lower()

    # Remove noise word prefixes/suffixes
    for noise in sorted(DOMAIN_NOISE, key=len, reverse=True):
        if name_part.startswith(noise) and len(name_part) > len(noise):
            name_part = name_part[len(noise):]
            break
        if name_part.endswith(noise) and len(name_part) > len(noise):
            name_part = name_part[: -len(noise)]
            break

    return name_part.strip()


def extract_from_domain(url: str) -> tuple[str, str]:
    """
    Returns (name, quality) extracted from a website domain.
    quality: 'HIGH' if full first+last name, 'MEDIUM' if surname only, '' if nothing.
    """
    if not url:
        return "", ""

    core = _clean_domain(url)
    if not core or len(core) < 3:
        return "", ""

    # Try to split into first + last name using known Italian first names
    for i in range(3, len(core) - 2):
        first = core[:i]
        last  = core[i:]
        if first in ITALIAN_FIRST_NAMES and len(last) >= 3 and last.isalpha():
            return f"{first.capitalize()} {last.capitalize()}", "HIGH"

    # Try reversed order: last + first
    for i in range(3, len(core) - 2):
        last  = core[:i]
        first = core[i:]
        if first in ITALIAN_FIRST_NAMES and len(last) >= 3 and last.isalpha():
            return f"{first.capitalize()} {last.capitalize()}", "HIGH"

    # No full name found — return the core as a surname if it looks like a name
    if (
        core.isalpha()
        and len(core) >= 4
        and core not in DOMAIN_NOISE
        and not core.startswith("studio")
    ):
        return core.capitalize(), "MEDIUM"

    return "", ""


# ── Studio name → person name (fallback) ─────────────────────────────────────

_NOT_NAME = {
    "studio", "legale", "commerciale", "tributario", "dottore", "dottori",
    "commercialista", "commercialisti", "associati", "revisore", "consulenti",
    "consulente", "contabile", "contabili", "avvocati", "avvocato",
    "professionista", "professionisti", "del", "dei", "di", "e", "le",
    "la", "il", "gli", "studi", "fiscale", "aziendale",
}


def extract_from_studio_name(studio: str) -> tuple[str, str]:
    """
    Returns (name, quality) extracted from a studio/business name.
    quality: 'HIGH' if full first+last name, 'MEDIUM' if surname only, '' if nothing.
    """
    raw = studio.strip()

    # Pattern 1: ALL_CAPS SURNAME FIRSTNAME – ...
    # e.g. "GRAZIANI FILIBERTO - Dottore Commercialista"
    m = re.match(r"^([A-Z]{2,}(?:\s+[A-Z]{2,})+)\s*[-–]", raw)
    if m:
        parts = m.group(1).strip().split()
        if len(parts) == 2:
            return f"{parts[1].capitalize()} {parts[0].capitalize()}", "HIGH"
        return " ".join(p.capitalize() for p in parts), "HIGH"

    # Pattern 2: Dott./Dott.ssa FIRSTNAME LASTNAME
    m = re.search(
        r"\bDott?\.?\s*(?:ssa\.?\s+)?([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+)+)", raw
    )
    if m:
        candidate = m.group(1).strip()
        first_word = candidate.split()[0].lower()
        if first_word not in _NOT_NAME:
            return candidate, "HIGH"

    # Pattern 3: SURNAME Dr. FIRSTNAME  (e.g. "Mangiapane Dr. Filippo")
    m = re.search(r"(\w+)\s+Dr\.?\s+([A-Z][a-z]+)", raw)
    if m and m.group(1).lower() not in _NOT_NAME:
        return f"{m.group(2)} {m.group(1).capitalize()}", "HIGH"

    # Pattern 4: Commercialista FIRSTNAME SURNAME
    m = re.search(r"\bCommercialista\s+([A-Z][a-zÀ-ÿ]+\s+[A-Z][a-zÀ-ÿ]+)", raw)
    if m:
        parts = m.group(1).strip().split()
        # Try to detect order: if first part is a known first name, keep; else flip
        if parts[0].lower() in ITALIAN_FIRST_NAMES:
            return m.group(1).strip(), "HIGH"
        if len(parts) == 2:
            return f"{parts[1]} {parts[0]}", "HIGH"
        return m.group(1).strip(), "HIGH"

    # Pattern 5: FIRSTNAME SURNAME Dottore/Revisore
    m = re.search(
        r"([A-Z][a-zÀ-ÿ]+\s+[A-Z][a-zÀ-ÿ]+)\s+(?:Dottore|Dott|Revisore)", raw
    )
    if m:
        return m.group(1).strip(), "HIGH"

    # Pattern 6: Studio SURNAME (surname only — MEDIUM quality)
    m = re.match(
        r"^Studio\s+(?:Legale\s+|Commerciale\s+|Tributario\s+)?([A-Z][a-zÀ-ÿ]+)", raw
    )
    if m and m.group(1).lower() not in _NOT_NAME:
        return m.group(1), "MEDIUM"

    # Pattern 7: SURNAME & Associati  (surname only)
    m = re.match(r"^([A-Z][a-zÀ-ÿ]+)\s+(?:&|e)\s+Associati", raw)
    if m and m.group(1).lower() not in _NOT_NAME:
        return m.group(1), "MEDIUM"

    # Pattern 8: First usable capitalized word
    words = raw.split()
    for w in words:
        clean = re.sub(r"[^a-zA-ZÀ-ÿ]", "", w)
        if (
            len(clean) >= 4
            and clean[0].isupper()
            and clean.lower() not in _NOT_NAME
            and not clean.isupper()          # skip ALL_CAPS abbreviations
        ):
            return clean, "MEDIUM"

    return "", "SKIP"


# ── LinkedIn People search URL ────────────────────────────────────────────────

def linkedin_url(name: str, citta: str) -> str:
    q = urllib.parse.quote(f"{name} commercialista {citta}")
    return f"https://www.linkedin.com/search/results/people/?keywords={q}"


# ── Join commercialisti.csv to LRL DB via phone ───────────────────────────────

def load_lrl_phone_map(db_path: Path) -> dict[str, str]:
    """Returns {normalized_phone: lead_id} from LRL database."""
    if not db_path.exists():
        return {}
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT lead_id, phone FROM leads WHERE phone IS NOT NULL"
    ).fetchall()
    conn.close()
    return {_norm_phone(r[1]): r[0] for r in rows if r[1]}


def _norm_phone(phone: str) -> str:
    """Normalize phone number to digits only."""
    return re.sub(r"\D", "", phone or "")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default="C:/projects/ai-lead-scraper/commercialisti.csv")
    p.add_argument("--db",  default="C:/projects/lead-rescue-lite/backend/dev.db")
    p.add_argument("--out", default="C:/projects/ai-lead-scraper/linkedin_names.csv")
    p.add_argument("--skip-medium", action="store_true",
                   help="Only include HIGH quality rows in output")
    args = p.parse_args()

    csv_path = Path(args.csv)
    db_path  = Path(args.db)
    out_path = Path(args.out)

    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}")
        return

    # Load LRL phone → lead_id map
    phone_map = load_lrl_phone_map(db_path)
    print(f"Loaded {len(phone_map)} phone entries from LRL")

    rows_in = list(csv.DictReader(csv_path.open(encoding="utf-8")))
    print(f"Processing {len(rows_in)} records from {csv_path.name}...")

    out_rows = []
    stats = {"HIGH": 0, "MEDIUM": 0, "SKIP": 0, "no_lead_id": 0}

    for row in rows_in:
        studio   = row.get("studio", "").strip()
        citta    = row.get("città", "").strip()
        website  = row.get("sito", "").strip()
        phone    = row.get("telefono", "").strip()

        # --- Find lead_id via phone number ---
        lead_id = phone_map.get(_norm_phone(phone), "")
        if not lead_id:
            stats["no_lead_id"] += 1
            continue  # not in LRL, skip

        # --- Extract name: website domain first, then studio name ---
        name, quality = extract_from_domain(website)
        if quality != "HIGH":
            name_fallback, quality_fallback = extract_from_studio_name(studio)
            # Use fallback if it's better quality
            if quality_fallback == "HIGH":
                name, quality = name_fallback, quality_fallback
            elif not name and quality_fallback == "MEDIUM":
                name, quality = name_fallback, quality_fallback

        if not name:
            quality = "SKIP"

        if args.skip_medium and quality != "HIGH":
            continue

        stats[quality] = stats.get(quality, 0) + 1

        out_rows.append({
            "lead_id":        lead_id,
            "name":           name,
            "citta":          citta,
            "quality":        quality,
            "website":        website,
            "linkedin_search": linkedin_url(name, citta) if name else "",
            "linkedin_url":   "",   # fill this in manually
        })

    # Sort: HIGH first, then MEDIUM, then SKIP
    order = {"HIGH": 0, "MEDIUM": 1, "SKIP": 2}
    out_rows.sort(key=lambda r: order.get(r["quality"], 3))

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "lead_id", "name", "citta", "quality",
            "website", "linkedin_search", "linkedin_url",
        ])
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"\nResults:")
    print(f"  HIGH  (full name): {stats['HIGH']}")
    print(f"  MEDIUM (surname):  {stats['MEDIUM']}")
    print(f"  SKIP:              {stats['SKIP']}")
    print(f"  Not in LRL:        {stats['no_lead_id']}")
    print(f"\nOutput: {out_path}")
    print()
    print("Next steps:")
    print("  1. Open:", out_path)
    print("  2. Start from the top (HIGH quality rows first)")
    print("  3. For each row: click 'linkedin_search' -> LinkedIn People opens")
    print("  4. Find the matching profile -> paste URL in 'linkedin_url' column")
    print("  5. Import back:")
    print("     python C:/projects/ai-lead-scraper/enrich_linkedin.py --mode import --csv", out_path)


if __name__ == "__main__":
    main()
