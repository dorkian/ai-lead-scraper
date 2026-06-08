import asyncio
import json
import re

import httpx
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic()

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
JUNK_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".css", ".svg", ".webp"}


def _is_real_email(email: str) -> bool:
    return not any(email.lower().endswith(ext) for ext in JUNK_EXTENSIONS)


async def _scrape_website_email(domain: str) -> str | None:
    paths = ["", "/contact", "/about", "/team", "/contact-us"]
    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client_http:
        for path in paths:
            try:
                r = await client_http.get(f"https://{domain}{path}")
                emails = EMAIL_RE.findall(r.text)
                real = [e for e in emails if _is_real_email(e)]
                if real:
                    return real[0]
            except Exception:
                continue
    return None


def _ai_extract_email(html: str, domain: str) -> str | None:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Extract the primary business contact email from this HTML for domain {domain}. "
                    f"Return ONLY the email address or the word NOT_FOUND.\n\nHTML:\n{html[:4000]}"
                ),
            }
        ],
    )
    result = msg.content[0].text.strip()
    return None if result == "NOT_FOUND" else result


def _ai_guess_email(name: str, domain: str) -> list[str]:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Given person name '{name}' and domain '{domain}', list the 3 most likely "
                    f"business email addresses as a JSON array. "
                    f'Example: ["john@acme.com","j.doe@acme.com"]. '
                    f"Return only the JSON array."
                ),
            }
        ],
    )
    try:
        return json.loads(msg.content[0].text.strip())
    except Exception:
        return []


def ai_extract_company_domain(username: str, post_text: str) -> str | None:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Reddit username: {username}\nPost content: {post_text[:800]}\n\n"
                    "If this person likely owns a business, what is their company domain? "
                    "Return ONLY the domain (e.g. acme.com) or NOT_FOUND."
                ),
            }
        ],
    )
    result = msg.content[0].text.strip()
    return None if result == "NOT_FOUND" else result


async def _fetch_html(domain: str) -> str | None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as c:
        try:
            r = await c.get(f"https://{domain}")
            return r.text
        except Exception:
            return None


def extract_email_waterfall(domain: str, name: str = None) -> tuple[str | None, str]:
    if not domain:
        return None, "no_domain"

    email = asyncio.run(_scrape_website_email(domain))
    if email:
        return email, "website_scrape"

    html = asyncio.run(_fetch_html(domain))
    if html:
        email = _ai_extract_email(html, domain)
        if email:
            return email, "ai_extract"

    if name:
        candidates = _ai_guess_email(name, domain)
        if candidates:
            return candidates[0], "ai_guess"

    return None, "not_found"
