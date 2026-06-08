# AI Lead Scraper

## Purpose
Extract business leads from free public APIs (Google Maps, etc.) and export structured data.

## Phase & Priorities
- Building
- Priority: stable scraping + CSV export
- Next: add more API sources, deduplication logic

## Rules & Constraints
- Stay within free API quotas — never pay for API calls without approval
- All output must be CSV-exportable
- Rate-limit calls to prevent bans
- Handle API errors gracefully

## Vault Docs
Full strategy and decisions: `C:\claude-projects\vault\01-Projects\AI-Lead-Scraper\Overview.md`

## Commands
```bash
python main.py --source google-maps --limit 100
python main.py --export csv --output leads.csv
```

## Key Files
- `main.py` — entry point
- `scrapers/` — API-specific scrapers
- `export/` — CSV/format handlers
