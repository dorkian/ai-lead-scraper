import base64
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

TOKEN_PATH = Path(__file__).parent.parent / "gmail_token.json"
CREDS_PATH = Path(__file__).parent.parent / "gmail_credentials.json"
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


_pending_flow = None


def _load_flow():
    from google_auth_oauthlib.flow import InstalledAppFlow
    if not CREDS_PATH.exists():
        raise RuntimeError("gmail_credentials.json not found in project root")
    return InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), scopes=SCOPES)


def _get_service():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())
        else:
            raise RuntimeError("Gmail not authenticated — connect in Settings first")

    return build("gmail", "v1", credentials=creds)


def get_auth_url(redirect_uri: str) -> str:
    global _pending_flow
    flow = _load_flow()
    flow.redirect_uri = redirect_uri
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    _pending_flow = flow
    return auth_url


def exchange_code(code: str, redirect_uri: str):
    global _pending_flow
    if _pending_flow is None:
        raise RuntimeError("No pending auth session — click Connect again to restart")
    _pending_flow.fetch_token(code=code)
    TOKEN_PATH.write_text(_pending_flow.credentials.to_json())
    _pending_flow = None


def is_authenticated() -> bool:
    if not TOKEN_PATH.exists():
        return False
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        if creds.valid:
            return True
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())
            return True
    except Exception:
        pass
    return False


def check_replies(lead_emails: list[str]) -> dict[str, dict]:
    service = _get_service()
    results = {}
    for email in lead_emails:
        try:
            resp = service.users().messages().list(
                userId="me", q=f"from:{email}", maxResults=1
            ).execute()
            messages = resp.get("messages", [])
            if not messages:
                continue
            msg = service.users().messages().get(
                userId="me", id=messages[0]["id"],
                format="metadata",
                metadataHeaders=["Date", "From", "Subject"],
            ).execute()
            headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
            results[email] = {
                "snippet": msg.get("snippet", "")[:300],
                "date": headers.get("Date", ""),
                "subject": headers.get("Subject", ""),
            }
        except Exception:
            continue
    return results


def send_reply(to: str, subject: str, body: str, sender_email: str):
    service = _get_service()
    from email.mime.text import MIMEText
    msg = MIMEText(body)
    msg["To"] = to
    msg["From"] = sender_email
    msg["Subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
