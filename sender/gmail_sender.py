import base64
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

load_dotenv()


def _build_html_body(body: str, signature: dict) -> str:
    html_body = body.replace("\n\n", "</p><p>").replace("\n", "<br>")
    html_body = f"<p>{html_body}</p>"

    name = signature.get("name", "")
    title = signature.get("title", "")
    company = signature.get("company", "")
    website = signature.get("website", "")
    phone = signature.get("phone", "")
    logo_url = signature.get("logo_url", "")

    sig_lines = []
    if logo_url:
        sig_lines.append(f'<img src="{logo_url}" height="36" style="margin-bottom:8px;display:block">')
    if name:
        sig_lines.append(f"<strong>{name}</strong>")
    title_company = " · ".join(p for p in [title, company] if p)
    if title_company:
        sig_lines.append(title_company)
    website_phone = " ".join(p for p in [website, phone] if p)
    if website_phone:
        sig_lines.append(website_phone)

    sig_html = "<br>".join(sig_lines)

    return (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">'
        f"{html_body}"
        '<div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:14px;font-size:13px;color:#374151">'
        f"{sig_html}"
        "</div>"
        "</div>"
    )


def send_email(to: str, subject: str, body: str, config: dict, signature: dict = None):
    from sender.gmail_reader import _get_service, is_authenticated

    if not is_authenticated():
        raise RuntimeError("Gmail not connected — go to Settings → Integrations → Connect Gmail")

    service = _get_service()

    sender_name = config.get("outreach", {}).get("sender_name", "")
    sender_email = config.get("outreach", {}).get("sender_email", "")
    from_addr = f"{sender_name} <{sender_email}>" if sender_name and sender_email else sender_email or "me"

    footer = "\n\n---\nTo unsubscribe reply STOP"

    if signature and signature.get("logo_url"):
        msg = MIMEMultipart("alternative")
        msg["To"] = to
        msg["Subject"] = subject
        if from_addr and from_addr != "me":
            msg["From"] = from_addr
        msg.attach(MIMEText(body + footer, "plain"))
        msg.attach(MIMEText(_build_html_body(body, signature), "html"))
    else:
        plain_body = body
        if signature:
            name = signature.get("name", "")
            title = signature.get("title", "")
            company = signature.get("company", "")
            website = signature.get("website", "")
            phone = signature.get("phone", "")
            title_company = " | ".join(p for p in [title, company] if p)
            website_phone = " | ".join(p for p in [website, phone] if p)
            sig_lines = ["", "", "--"]
            if name:
                sig_lines.append(name)
            if title_company:
                sig_lines.append(title_company)
            if website_phone:
                sig_lines.append(website_phone)
            plain_body = body + "\n".join(sig_lines)
        msg = MIMEText(plain_body + footer)
        msg["To"] = to
        msg["Subject"] = subject
        if from_addr and from_addr != "me":
            msg["From"] = from_addr

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
