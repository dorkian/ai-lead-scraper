import json
import sqlite3
import uuid
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "leads.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                config TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id TEXT,
                source TEXT NOT NULL,
                name TEXT,
                company TEXT,
                domain TEXT,
                email TEXT,
                email_verified BOOLEAN DEFAULT 0,
                iq_score INTEGER,
                status TEXT DEFAULT 'new',
                raw_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS emails_sent (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER REFERENCES leads(id),
                subject TEXT,
                body TEXT,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                opened BOOLEAN DEFAULT 0,
                replied BOOLEAN DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id TEXT,
                source TEXT,
                leads_found INTEGER DEFAULT 0,
                leads_qualified INTEGER DEFAULT 0,
                emails_sent INTEGER DEFAULT 0,
                run_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        for migration in [
            "ALTER TABLE leads ADD COLUMN campaign_id TEXT",
            "ALTER TABLE runs ADD COLUMN campaign_id TEXT",
            "ALTER TABLE emails_sent ADD COLUMN reply_at DATETIME",
            "ALTER TABLE emails_sent ADD COLUMN reply_snippet TEXT",
        ]:
            try:
                conn.execute(migration)
            except Exception:
                pass


# ── Campaigns ─────────────────────────────────────────────────────────────────

def _empty_campaign_config() -> dict:
    return {
        "product": {
            "name": "", "description": "", "value_prop": "",
            "website": "", "pricing": "",
        },
        "target": {
            "role": "", "industry": "", "location": "",
            "company_size": "", "revenue": "$1M – $25M ARR",
            "pain_points": [],
        },
        "outreach": {
            "sender_name": "", "sender_email": "",
            "daily_limit": 30, "timezone": "Europe/Rome",
        },
    }


def get_all_campaigns() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, config, created_at FROM campaigns ORDER BY created_at ASC"
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["config"] = json.loads(d["config"])
            result.append(d)
        return result


def get_campaign(campaign_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, config, created_at FROM campaigns WHERE id = ?",
            (campaign_id,),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["config"] = json.loads(d["config"])
        return d


def create_campaign(name: str, config: dict) -> str:
    campaign_id = "camp_" + uuid.uuid4().hex[:8]
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO campaigns (id, name, config) VALUES (?, ?, ?)",
            (campaign_id, name, json.dumps(config)),
        )
    return campaign_id


def update_campaign(campaign_id: str, name: str, config: dict):
    with get_connection() as conn:
        conn.execute(
            "UPDATE campaigns SET name = ?, config = ? WHERE id = ?",
            (name, json.dumps(config), campaign_id),
        )


def delete_campaign(campaign_id: str):
    with get_connection() as conn:
        conn.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))


def migrate_config_to_campaign(config_path: str):
    if get_all_campaigns():
        return
    try:
        import yaml
        with open(config_path) as f:
            cfg = yaml.safe_load(f) or {}
        name = cfg.get("product", {}).get("name") or "Default Campaign"
        if not cfg.get("product"):
            cfg = _empty_campaign_config()
        else:
            cfg.setdefault("target", {})
            cfg.setdefault("outreach", {})
            cfg["product"].setdefault("value_prop", cfg["product"].pop("value_prop", ""))
    except Exception:
        cfg = _empty_campaign_config()
        name = "Default Campaign"
    create_campaign(name, cfg)


# ── Leads ──────────────────────────────────────────────────────────────────────

def check_duplicate(domain: str) -> bool:
    if not domain:
        return False
    with get_connection() as conn:
        row = conn.execute("SELECT id FROM leads WHERE domain = ?", (domain,)).fetchone()
        return row is not None


def save_lead(lead: dict, campaign_id: str = None) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO leads
               (campaign_id, source, name, company, domain, email, email_verified, iq_score, status, raw_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                campaign_id,
                lead.get("source"),
                lead.get("name"),
                lead.get("company"),
                lead.get("domain"),
                lead.get("email"),
                lead.get("email_verified", False),
                lead.get("iq_score"),
                lead.get("status", "new"),
                json.dumps(lead.get("raw_data", {})),
            ),
        )
        return cursor.lastrowid


def update_lead(lead_id: int, **fields):
    if not fields:
        return
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [lead_id]
    with get_connection() as conn:
        conn.execute(f"UPDATE leads SET {set_clause} WHERE id = ?", values)


def mark_replied(email_id: int, snippet: str = "", reply_at: str = ""):
    with get_connection() as conn:
        conn.execute(
            "UPDATE emails_sent SET replied = 1, reply_snippet = ?, reply_at = COALESCE(?, CURRENT_TIMESTAMP) WHERE id = ?",
            (snippet, reply_at or None, email_id),
        )
        row = conn.execute("SELECT lead_id FROM emails_sent WHERE id = ?", (email_id,)).fetchone()
        if row:
            conn.execute("UPDATE leads SET status = 'replied' WHERE id = ?", (row["lead_id"],))


def save_email_sent(lead_id: int, subject: str, body: str):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO emails_sent (lead_id, subject, body) VALUES (?, ?, ?)",
            (lead_id, subject, body),
        )
        conn.execute("UPDATE leads SET status = 'emailed' WHERE id = ?", (lead_id,))


def save_run(source: str, leads_found: int, leads_qualified: int, emails_sent: int, campaign_id: str = None):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO runs (campaign_id, source, leads_found, leads_qualified, emails_sent) VALUES (?, ?, ?, ?, ?)",
            (campaign_id, source, leads_found, leads_qualified, emails_sent),
        )


def get_all_leads(status: str = None, source: str = None, campaign_id: str = None) -> list[dict]:
    query = "SELECT * FROM leads"
    params = []
    conditions = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if source:
        conditions.append("source = ?")
        params.append(source)
    if campaign_id:
        conditions.append("campaign_id = ?")
        params.append(campaign_id)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at DESC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_lead_by_id(lead_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        return dict(row) if row else None


def get_emails_sent() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT e.*, l.company, l.email AS lead_email "
            "FROM emails_sent e JOIN leads l ON e.lead_id = l.id "
            "ORDER BY e.sent_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_stats(campaign_id: str = None) -> dict:
    if campaign_id:
        base_where = "WHERE campaign_id = ?"
        base_params = (campaign_id,)
        qual_where = "WHERE campaign_id = ? AND iq_score >= 7"
        qual_params = (campaign_id,)
    else:
        base_where = ""
        base_params = ()
        qual_where = "WHERE iq_score >= 7"
        qual_params = ()

    with get_connection() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM leads {base_where}", base_params
        ).fetchone()[0]
        qualified = conn.execute(
            f"SELECT COUNT(*) FROM leads {qual_where}", qual_params
        ).fetchone()[0]
        sent = conn.execute("SELECT COUNT(*) FROM emails_sent").fetchone()[0]
        replied = conn.execute(
            "SELECT COUNT(*) FROM emails_sent WHERE replied = 1"
        ).fetchone()[0]
        this_week = conn.execute(
            "SELECT COUNT(*) FROM emails_sent WHERE sent_at >= datetime('now', '-7 days')"
        ).fetchone()[0]
        by_source = conn.execute(
            f"SELECT source, COUNT(*) as cnt FROM leads {base_where} GROUP BY source",
            base_params,
        ).fetchall()
        return {
            "total_leads": total,
            "qualified_leads": qualified,
            "emails_sent": sent,
            "reply_rate": round(replied / sent, 2) if sent else 0.0,
            "leads_by_source": {r["source"]: r["cnt"] for r in by_source},
            "emails_this_week": this_week,
        }


def reset_db():
    with get_connection() as conn:
        conn.executescript("DELETE FROM emails_sent; DELETE FROM leads; DELETE FROM runs;")
