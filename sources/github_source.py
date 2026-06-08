import os
import re
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

from agents.email_extractor import ai_extract_company_domain

load_dotenv()

GH_API = "https://api.github.com"


def _headers() -> dict:
    token = os.getenv("GITHUB_TOKEN")
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _extract_domain(text: str) -> str | None:
    if not text:
        return None
    urls = re.findall(r"https?://[^\s\"'<>)]+", text)
    for url in urls:
        host = urlparse(url).netloc.removeprefix("www.")
        if host and "github" not in host:
            return host
    # plain domain like "acme.com"
    match = re.search(r"\b([a-z0-9-]+\.[a-z]{2,})\b", text)
    if match:
        candidate = match.group(1)
        if "github" not in candidate:
            return candidate
    return None


def _search_users(keyword: str, role: str, page: int = 1) -> list[dict]:
    query_parts = [keyword]
    if role:
        query_parts.append(role)
    query = " ".join(query_parts) + " in:bio"
    try:
        r = httpx.get(
            f"{GH_API}/search/users",
            params={"q": query, "per_page": 30, "page": page},
            headers=_headers(),
            timeout=10,
        )
        r.raise_for_status()
        return r.json().get("items", [])
    except Exception:
        return []


def _get_user_detail(username: str) -> dict:
    try:
        r = httpx.get(f"{GH_API}/users/{username}", headers=_headers(), timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def fetch_leads(config: dict, max_results: int = 30) -> list[dict]:
    pain_keywords = config["target"].get("pain_points", [])
    target_role = config["target"].get("role", "")

    seen_users: set[str] = set()
    leads = []

    for keyword in pain_keywords:
        if len(leads) >= max_results:
            break

        items = _search_users(keyword, target_role)

        for item in items:
            if len(leads) >= max_results:
                break

            login = item.get("login")
            if not login or login in seen_users:
                continue
            seen_users.add(login)

            user = _get_user_detail(login)
            if not user:
                continue

            blog = user.get("blog") or ""
            bio = user.get("bio") or ""
            email = user.get("email") or ""
            company = (user.get("company") or "").lstrip("@")

            domain = _extract_domain(blog) or _extract_domain(bio)
            if not domain and email and "@" in email:
                domain = email.split("@")[1]
            if not domain:
                context = f"{bio} {blog} {company}"
                domain = ai_extract_company_domain(login, context[:600])

            leads.append(
                {
                    "source": "github",
                    "name": user.get("name") or login,
                    "company": company or None,
                    "domain": domain,
                    "raw_data": {
                        "username": login,
                        "bio": bio,
                        "blog": blog,
                        "location": user.get("location"),
                        "public_repos": user.get("public_repos"),
                        "profile_url": f"https://github.com/{login}",
                        "keyword": keyword,
                    },
                }
            )

    return leads
