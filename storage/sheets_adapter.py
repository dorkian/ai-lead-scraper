import os
from datetime import datetime
from pathlib import Path

import gspread
from dotenv import load_dotenv

load_dotenv()

TOKEN_PATH = Path(__file__).parent.parent / "gmail_token.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

HEADERS = [
    "id", "company", "contact", "email", "domain",
    "score", "subject", "body", "status", "exported_at",
]


def _client() -> gspread.Client:
    if not TOKEN_PATH.exists():
        raise RuntimeError("Not authenticated — connect Gmail/Google in Settings first")

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())
        else:
            raise RuntimeError("Token expired — reconnect Google in Settings")

    return gspread.authorize(creds)


def _sheet(client: gspread.Client) -> gspread.Worksheet:
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise RuntimeError("GOOGLE_SHEET_ID not set in .env")
    spreadsheet = client.open_by_key(sheet_id)
    try:
        ws = spreadsheet.worksheet("LeadEngine")
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title="LeadEngine", rows=1000, cols=len(HEADERS))
    return ws


def _ensure_headers(ws: gspread.Worksheet):
    if ws.row_values(1) != HEADERS:
        ws.update("A1", [HEADERS])
        ws.format("A1:J1", {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.06, "green": 0.41, "blue": 0.44},
        })


def is_configured() -> bool:
    return TOKEN_PATH.exists() and bool(os.getenv("GOOGLE_SHEET_ID"))


def export_leads(leads: list[dict]) -> int:
    if not leads:
        return 0

    client = _client()
    ws = _sheet(client)
    _ensure_headers(ws)

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    rows = []
    for l in leads:
        rows.append([
            str(l.get("id", "")),
            l.get("company", "") or "",
            l.get("name", "") or "",
            l.get("email", "") or "",
            l.get("domain", "") or "",
            str(l.get("iq_score", "") or ""),
            l.get("subject", "") or "",
            l.get("body", "") or "",
            "ready",
            now,
        ])

    ws.append_rows(rows, value_input_option="RAW")
    return len(rows)


def get_sheet_url() -> str:
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "")
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}" if sheet_id else ""
