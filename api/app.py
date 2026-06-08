import asyncio
import json
import os
import threading
from pathlib import Path
from queue import Queue, Empty

from dotenv import load_dotenv
load_dotenv()
from typing import AsyncGenerator

import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from storage.db import (
    init_db,
    migrate_config_to_campaign,
    get_all_campaigns,
    get_campaign,
    create_campaign,
    update_campaign,
    delete_campaign,
    get_all_leads,
    get_lead_by_id,
    get_emails_sent,
    get_stats,
    save_lead,
    update_lead,
    mark_replied,
    _empty_campaign_config,
    get_connection,
)

UI_DIR = Path(__file__).parent.parent / "ui"
CONFIG_PATH = "config.yaml"

app = FastAPI(title="LeadEngine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_pipeline_queue: Queue = Queue()
_pipeline_running = False


@app.on_event("startup")
def startup():
    init_db()
    migrate_config_to_campaign(CONFIG_PATH)


# ── Campaigns ─────────────────────────────────────────────────────────────────


class CampaignBody(BaseModel):
    name: str
    config: dict


@app.get("/api/campaigns")
def list_campaigns():
    return get_all_campaigns()


@app.post("/api/campaigns")
def new_campaign(body: CampaignBody):
    config = body.config if body.config else _empty_campaign_config()
    campaign_id = create_campaign(body.name, config)
    return get_campaign(campaign_id)


@app.put("/api/campaigns/{campaign_id}")
def save_campaign(campaign_id: str, body: CampaignBody):
    if not get_campaign(campaign_id):
        raise HTTPException(404, "Campaign not found")
    update_campaign(campaign_id, body.name, body.config)
    return get_campaign(campaign_id)


@app.delete("/api/campaigns/{campaign_id}")
def remove_campaign(campaign_id: str):
    campaigns = get_all_campaigns()
    if len(campaigns) <= 1:
        raise HTTPException(400, "Cannot delete the last campaign")
    if not any(c["id"] == campaign_id for c in campaigns):
        raise HTTPException(404, "Campaign not found")
    delete_campaign(campaign_id)
    return {"ok": True}


# ── ICP Suggestion ────────────────────────────────────────────────────────────


class SuggestICPRequest(BaseModel):
    product_name: str
    description: str
    value_prop: str


@app.post("/api/suggest-icp")
def suggest_icp(body: SuggestICPRequest):
    from agents.icp_suggester import suggest_icp as _suggest
    try:
        result = _suggest(body.product_name, body.description, body.value_prop)
        return result
    except Exception as e:
        raise HTTPException(500, f"ICP suggestion failed: {e}")


# ── Config (legacy — kept for backward compat) ────────────────────────────────


@app.get("/api/config")
def get_config():
    try:
        with open(CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


@app.post("/api/config")
def save_config(body: dict):
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(body, f, allow_unicode=True)
    return {"ok": True}


# ── Leads ─────────────────────────────────────────────────────────────────────


@app.get("/api/leads")
def list_leads(status: str = None, source: str = None, campaign_id: str = None):
    return get_all_leads(status=status, source=source, campaign_id=campaign_id)


@app.get("/api/leads/{lead_id}")
def get_lead(lead_id: int):
    lead = get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead


class LeadCreate(BaseModel):
    company: str
    domain: str
    email: str = None
    name: str = None
    source: str = "manual"
    campaign_id: str = None


@app.post("/api/leads")
def create_lead(body: LeadCreate):
    campaigns = get_all_campaigns()
    campaign_id = body.campaign_id or (campaigns[0]["id"] if campaigns else None)
    lead_id = save_lead(
        {
            "source": body.source,
            "name": body.name,
            "company": body.company,
            "domain": body.domain,
            "email": body.email,
            "status": "new",
            "raw_data": {},
        },
        campaign_id=campaign_id,
    )
    return get_lead_by_id(lead_id)


class LeadPatch(BaseModel):
    status: str = None
    iq_score: int = None
    email: str = None


@app.patch("/api/leads/{lead_id}")
def patch_lead(lead_id: int, body: LeadPatch):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    update_lead(lead_id, **fields)
    return get_lead_by_id(lead_id)


# ── Google Sheets ─────────────────────────────────────────────────────────────


@app.get("/api/sheets/status")
def sheets_status():
    from storage.sheets_adapter import is_configured, get_sheet_url
    return {"configured": is_configured(), "url": get_sheet_url()}


@app.get("/api/sheets/debug")
def sheets_debug():
    import os
    from storage.sheets_adapter import TOKEN_PATH, _client
    info = {
        "token_exists": TOKEN_PATH.exists(),
        "sheet_id": os.getenv("GOOGLE_SHEET_ID", "NOT SET"),
        "total_leads": len(get_all_leads()),
    }
    try:
        client = _client()
        sheet_id = os.getenv("GOOGLE_SHEET_ID")
        spreadsheet = client.open_by_key(sheet_id)
        info["spreadsheet_title"] = spreadsheet.title
        worksheets = [ws.title for ws in spreadsheet.worksheets()]
        info["worksheets"] = worksheets
        info["sheets_ok"] = True
    except Exception as e:
        info["sheets_error"] = str(e)
        info["sheets_ok"] = False
    return info


class SheetsExportRequest(BaseModel):
    lead_ids: list[int] = []
    generate_email: bool = True
    campaign_id: str = None


@app.post("/api/sheets/export")
def sheets_export(req: SheetsExportRequest):
    from storage.sheets_adapter import export_leads
    from agents.email_writer import write_cold_email

    campaigns = get_all_campaigns()
    if not campaigns:
        raise HTTPException(400, "No campaign configured")

    config = next(
        (c["config"] for c in campaigns if c["id"] == req.campaign_id),
        campaigns[0]["config"],
    )

    if req.lead_ids:
        leads = [get_lead_by_id(lid) for lid in req.lead_ids]
        leads = [l for l in leads if l]
    else:
        leads = get_all_leads()

    if not leads:
        return {"exported": 0, "url": "", "message": "No leads in database"}

    import json as _json
    enriched = []
    for lead in leads:
        if isinstance(lead.get("raw_data"), str):
            lead["raw_data"] = _json.loads(lead["raw_data"])
        if req.generate_email and lead.get("email"):
            try:
                subject, body = write_cold_email(lead, config)
                lead["subject"] = subject
                lead["body"] = body
            except Exception:
                lead["subject"] = ""
                lead["body"] = ""
        enriched.append(lead)

    try:
        count = export_leads(enriched)
        from storage.sheets_adapter import get_sheet_url
        return {"exported": count, "url": get_sheet_url()}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Emails ────────────────────────────────────────────────────────────────────


@app.get("/api/emails")
def list_emails():
    return get_emails_sent()


class EmailPatch(BaseModel):
    replied: bool = None
    reply_snippet: str = None


@app.patch("/api/emails/{email_id}")
def patch_email(email_id: int, body: EmailPatch):
    if body.replied:
        mark_replied(email_id, snippet=body.reply_snippet or "Marked manually")
    return {"ok": True}


@app.get("/api/gmail/status")
def gmail_status():
    try:
        from sender.gmail_reader import is_authenticated
        return {"authenticated": is_authenticated()}
    except Exception as e:
        return {"authenticated": False, "error": str(e)}


@app.get("/api/gmail/auth")
def gmail_auth(request: Request):
    from sender.gmail_reader import get_auth_url
    redirect_uri = str(request.base_url).rstrip("/") + "/api/gmail/callback"
    try:
        url = get_auth_url(redirect_uri)
        return {"auth_url": url}
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.get("/api/gmail/callback")
def gmail_callback(code: str, request: Request):
    from sender.gmail_reader import exchange_code
    from fastapi.responses import HTMLResponse
    redirect_uri = str(request.base_url).rstrip("/") + "/api/gmail/callback"
    try:
        exchange_code(code, redirect_uri)
        return HTMLResponse("<script>window.close();window.opener&&window.opener.postMessage('gmail_auth_ok','*')</script><p>Gmail connected! You can close this tab.</p>")
    except Exception as e:
        raise HTTPException(400, f"Auth failed: {e}")


@app.post("/api/emails/sync")
def sync_replies():
    from sender.gmail_reader import check_replies, is_authenticated
    if not is_authenticated():
        raise HTTPException(400, "Gmail not authenticated. Connect Gmail first.")

    emails = get_emails_sent()
    pending = [e for e in emails if not e.get("replied") and e.get("lead_email")]
    if not pending:
        return {"synced": 0, "new_replies": 0}

    lead_emails = [e["lead_email"] for e in pending]
    replies = check_replies(lead_emails)

    new_replies = 0
    for e in pending:
        reply = replies.get(e["lead_email"])
        if reply:
            mark_replied(e["id"], snippet=reply["snippet"], reply_at=reply["date"])
            new_replies += 1

    return {"synced": len(pending), "new_replies": new_replies}


# ── Manual send ───────────────────────────────────────────────────────────────


@app.post("/api/leads/{lead_id}/send")
def send_lead_email(lead_id: int):
    lead = get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")

    if not lead.get("email"):
        raise HTTPException(400, "Lead has no email address")

    campaigns = get_all_campaigns()
    if not campaigns:
        raise HTTPException(400, "No campaign configured")
    config = campaigns[0]["config"]

    sender_email = config.get("outreach", {}).get("sender_email", "")
    if not sender_email:
        raise HTTPException(400, "Sender email not set — go to Configure and fill in Outreach settings")

    from sender.gmail_reader import is_authenticated
    if not is_authenticated():
        raise HTTPException(400, "Gmail not connected — go to Settings → Integrations → Connect Gmail")

    try:
        import json as _json
        if isinstance(lead.get("raw_data"), str):
            lead["raw_data"] = _json.loads(lead["raw_data"])

        from agents.email_writer import write_cold_email
        from sender.gmail_sender import send_email
        from storage.db import save_email_sent

        subject, body = write_cold_email(lead, config)
        send_email(lead["email"], subject, body, config)
        save_email_sent(lead_id, subject, body)
        return {"ok": True, "subject": subject}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Outreach wizard ────────────────────────────────────────────────────────────


@app.get("/api/leads/{lead_id}/history")
def lead_history(lead_id: int):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM emails_sent WHERE lead_id = ? ORDER BY sent_at DESC",
            (lead_id,),
        ).fetchall()
    return [dict(r) for r in rows]


class OutreachPreviewRequest(BaseModel):
    campaign_id: str = None
    lead_id: int


@app.post("/api/outreach/preview")
def outreach_preview(body: OutreachPreviewRequest):
    lead = get_lead_by_id(body.lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")

    campaigns = get_all_campaigns()
    if not campaigns:
        raise HTTPException(400, "No campaign configured")
    config = next(
        (c["config"] for c in campaigns if c["id"] == body.campaign_id),
        campaigns[0]["config"],
    )

    import json as _json
    if isinstance(lead.get("raw_data"), str):
        lead["raw_data"] = _json.loads(lead["raw_data"])

    try:
        from agents.email_writer import write_cold_email
        subject, email_body = write_cold_email(lead, config)
        return {"subject": subject, "body": email_body}
    except Exception as e:
        raise HTTPException(500, str(e))


class OutreachSendRequest(BaseModel):
    campaign_id: str = None
    lead_ids: list[int]
    subject: str
    body: str


@app.post("/api/outreach/send")
def outreach_send(body: OutreachSendRequest):
    campaigns = get_all_campaigns()
    if not campaigns:
        raise HTTPException(400, "No campaign configured")
    config = next(
        (c["config"] for c in campaigns if c["id"] == body.campaign_id),
        campaigns[0]["config"],
    )

    from sender.gmail_sender import send_email
    from storage.db import save_email_sent

    # Load global signature from config.yaml
    try:
        with open(CONFIG_PATH) as f:
            global_config = yaml.safe_load(f) or {}
    except Exception:
        global_config = {}
    signature = global_config.get("signature") or config.get("signature") or {}

    results = []
    sent_count = 0
    failed_count = 0

    for lead_id in body.lead_ids:
        lead = get_lead_by_id(lead_id)
        if not lead or not lead.get("email"):
            results.append({"lead_id": lead_id, "email": None, "status": "failed", "error": "Lead not found or has no email"})
            failed_count += 1
            continue

        lead_email = lead["email"]
        lead_name = lead.get("name") or ""
        lead_company = lead.get("company") or ""

        personalized_subject = body.subject.replace("{name}", lead_name).replace("{company}", lead_company)
        personalized_body = body.body.replace("{name}", lead_name).replace("{company}", lead_company)

        try:
            send_email(lead_email, personalized_subject, personalized_body, config, signature=signature or None)
            save_email_sent(lead_id, personalized_subject, personalized_body)
            results.append({"lead_id": lead_id, "email": lead_email, "status": "sent", "error": None})
            sent_count += 1
        except Exception as e:
            results.append({"lead_id": lead_id, "email": lead_email, "status": "failed", "error": str(e)})
            failed_count += 1

    return {"sent": sent_count, "failed": failed_count, "results": results}


# ── Stats ─────────────────────────────────────────────────────────────────────


@app.get("/api/stats")
def stats(campaign_id: str = None):
    return get_stats(campaign_id=campaign_id)


# ── Pipeline run ──────────────────────────────────────────────────────────────


class RunRequest(BaseModel):
    source: str = "gmaps"
    limit: int = 20
    dry_run: bool = True
    campaign_id: str = None


def _run_pipeline_thread(source: str, limit: int, dry_run: bool, campaign_id: str | None, queue: Queue):
    global _pipeline_running
    _pipeline_running = True

    try:
        if campaign_id:
            campaign = get_campaign(campaign_id)
            if not campaign:
                queue.put({"step": "error", "message": f"Campaign '{campaign_id}' not found"})
                return
            config = campaign["config"]
        else:
            campaigns = get_all_campaigns()
            if campaigns:
                config = campaigns[0]["config"]
                campaign_id = campaigns[0]["id"]
            else:
                with open(CONFIG_PATH) as f:
                    config = yaml.safe_load(f) or {}

        from sources.gmaps_source import fetch_leads as gmaps_fetch
        from sources.reddit_source import fetch_leads as reddit_fetch
        from agents.email_extractor import extract_email_waterfall
        from agents.email_verifier import verify_email
        from agents.lead_qualifier import qualify_lead
        from agents.email_writer import write_cold_email
        from sender.gmail_sender import send_email
        from storage.db import check_duplicate, save_lead, save_email_sent, save_run

        if source == "gmaps":
            leads = gmaps_fetch(config, max_results=limit)
        elif source == "reddit":
            leads = reddit_fetch(config, max_results=limit)
        else:
            half = limit // 2
            leads = gmaps_fetch(config, max_results=half) + reddit_fetch(config, max_results=half)

        queue.put({"step": "fetch", "source": source, "count": len(leads), "message": f"Found {len(leads)} companies"})

        leads_qualified = 0
        emails_sent_count = 0

        for lead in leads:
            domain = lead.get("domain")
            if not domain or check_duplicate(domain):
                continue

            email, method = extract_email_waterfall(domain, lead.get("name"))
            queue.put({"step": "email_find", "domain": domain, "found": email is not None, "method": method})

            if not email:
                continue

            verified = verify_email(email)
            queue.put({"step": "verify", "email": email, "verified": verified})

            if not verified:
                continue

            lead["email"] = email
            lead["email_verified"] = verified

            score, reason = qualify_lead(lead, config)
            lead["iq_score"] = score
            queue.put({"step": "qualify", "company": lead.get("company") or domain, "score": score, "reason": reason})

            lead_id = save_lead(lead, campaign_id=campaign_id)
            lead["id"] = lead_id

            if score < 7:
                continue

            leads_qualified += 1
            subject, body = write_cold_email(lead, config)

            if not dry_run:
                send_email(email, subject, body, config)
                save_email_sent(lead_id, subject, body)
                emails_sent_count += 1
                queue.put({"step": "send", "email": email, "status": "sent"})
            else:
                queue.put({"step": "send", "email": email, "status": "dry_run", "subject": subject})

        save_run(source, len(leads), leads_qualified, emails_sent_count, campaign_id=campaign_id)
        queue.put({"step": "done", "leads_found": len(leads), "leads_qualified": leads_qualified, "emails_sent": emails_sent_count})

    except Exception as e:
        queue.put({"step": "error", "message": str(e)})
    finally:
        _pipeline_running = False
        queue.put(None)


@app.post("/api/run")
def start_run(req: RunRequest):
    global _pipeline_running
    if _pipeline_running:
        raise HTTPException(409, "Pipeline already running")

    t = threading.Thread(
        target=_run_pipeline_thread,
        args=(req.source, req.limit, req.dry_run, req.campaign_id, _pipeline_queue),
        daemon=True,
    )
    t.start()
    return {"ok": True, "message": "Pipeline started"}


@app.get("/api/run/status")
async def run_status():
    async def event_stream() -> AsyncGenerator[dict, None]:
        while True:
            try:
                event = _pipeline_queue.get(timeout=1)
                if event is None:
                    break
                yield {"data": json.dumps(event)}
            except Empty:
                yield {"data": json.dumps({"step": "heartbeat"})}
                if not _pipeline_running:
                    break

    return EventSourceResponse(event_stream())


# ── UI static files ───────────────────────────────────────────────────────────

@app.get("/")
def serve_root():
    return FileResponse(UI_DIR / "LeadEngine.html")

app.mount("/", StaticFiles(directory=str(UI_DIR)), name="ui")
