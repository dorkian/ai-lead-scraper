import argparse
import yaml

from storage.db import init_db, save_lead, save_email_sent, check_duplicate, save_run, update_lead, reset_db
from sources.gmaps_source import fetch_leads as gmaps_fetch
from sources.reddit_source import fetch_leads as reddit_fetch
from sources.twitter_source import fetch_leads as twitter_fetch
from sources.hn_source import fetch_leads as hn_fetch
from sources.github_source import fetch_leads as github_fetch
from agents.email_extractor import extract_email_waterfall
from agents.email_verifier import verify_email
from agents.lead_qualifier import qualify_lead
from agents.email_writer import write_cold_email
from sender.gmail_sender import send_email


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def run_pipeline(source: str, limit: int, dry_run: bool, config: dict):
    init_db()

    fetchers = {
        "gmaps": gmaps_fetch,
        "reddit": reddit_fetch,
        "twitter": twitter_fetch,
        "hn": hn_fetch,
        "github": github_fetch,
    }

    if source in fetchers:
        leads = fetchers[source](config, max_results=limit)
    elif source == "all":
        per = limit // len(fetchers)
        leads = []
        for fn in fetchers.values():
            leads += fn(config, max_results=per)
    else:
        raise ValueError(f"Unknown source: {source}")

    leads_found = len(leads)
    leads_qualified = 0
    emails_sent_count = 0

    for lead in leads:
        domain = lead.get("domain")
        if not domain:
            print(f"  skip (no domain): {lead.get('company') or lead.get('name')}")
            continue

        if check_duplicate(domain):
            print(f"  skip (duplicate): {domain}")
            continue

        email, method = extract_email_waterfall(domain, lead.get("name"))
        if not email:
            print(f"  ✗ {domain} — email not found, skipping")
            continue

        print(f"  ✓ {domain} — email found: {email} ({method})")

        verified = verify_email(email)
        if not verified:
            print(f"  ✗ {email} — SMTP verification failed, skipping")
            continue

        print(f"  ✓ {email} — verified")

        lead["email"] = email
        lead["email_verified"] = verified

        score, reason = qualify_lead(lead, config)
        lead["iq_score"] = score
        print(f"  ✓ {lead.get('company') or domain} — score: {score}/10")

        lead_id = save_lead(lead)
        lead["id"] = lead_id

        if score < 7:
            print(f"  skip (score {score} < 7): {domain}")
            continue

        leads_qualified += 1
        subject, body = write_cold_email(lead, config)

        if not dry_run:
            send_email(email, subject, body, config)
            save_email_sent(lead_id, subject, body)
            emails_sent_count += 1
            print(f"  ✅ Sent to {email} ({lead.get('company') or domain}) score={score}")
        else:
            print(f"  [DRY RUN] Would send to {email} — {subject}")

    save_run(source, leads_found, leads_qualified, emails_sent_count)
    print(f"\nRun complete: {leads_found} found, {leads_qualified} qualified, {emails_sent_count} sent")


def main():
    parser = argparse.ArgumentParser(description="LeadEngine CLI")
    parser.add_argument("--source", choices=["gmaps", "reddit", "twitter", "hn", "github", "all"], default="gmaps")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true", help="Clear all leads and start fresh")
    parser.add_argument("--config", default="config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.reset:
        init_db()
        reset_db()
        print("Database reset.")
        return

    print(f"Starting pipeline: source={args.source}, limit={args.limit}, dry_run={args.dry_run}")
    run_pipeline(args.source, args.limit, args.dry_run, config)


if __name__ == "__main__":
    main()
