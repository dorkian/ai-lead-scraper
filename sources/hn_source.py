import re
from urllib.parse import urlparse

import httpx

from agents.email_extractor import ai_extract_company_domain

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_USER_URL = "https://hacker-news.firebaseio.com/v0/user/{}.json"

HIRING_THREAD_TAGS = ["ask_hn"]


def _extract_domain_from_text(text: str) -> str | None:
    urls = re.findall(r"https?://[^\s\"'<>)]+", text)
    for url in urls:
        host = urlparse(url).netloc.removeprefix("www.")
        if host and "ycombinator" not in host and "github" not in host:
            return host
    return None


def _fetch_user_about(username: str) -> str:
    try:
        r = httpx.get(HN_USER_URL.format(username), timeout=5)
        r.raise_for_status()
        return r.json().get("about", "") or ""
    except Exception:
        return ""


def fetch_leads(config: dict, max_results: int = 30) -> list[dict]:
    pain_keywords = config["target"].get("pain_points", [])
    target_role = config["target"].get("role", "")

    seen_authors: set[str] = set()
    leads = []

    for keyword in pain_keywords:
        if len(leads) >= max_results:
            break

        query = keyword
        if target_role:
            query = f"{keyword} {target_role}"

        params = {
            "query": query,
            "tags": "story",
            "hitsPerPage": 50,
        }

        try:
            r = httpx.get(HN_SEARCH_URL, params=params, timeout=10)
            r.raise_for_status()
            hits = r.json().get("hits", [])
        except Exception:
            continue

        for hit in hits:
            if len(leads) >= max_results:
                break

            author = hit.get("author")
            if not author or author in seen_authors:
                continue
            seen_authors.add(author)

            about = _fetch_user_about(author)
            post_text = (hit.get("title") or "") + " " + (hit.get("story_text") or "")

            domain = _extract_domain_from_text(about) or _extract_domain_from_text(post_text)
            if not domain:
                domain = ai_extract_company_domain(author, (about + " " + post_text)[:600])

            leads.append(
                {
                    "source": "hackernews",
                    "name": author,
                    "company": None,
                    "domain": domain,
                    "raw_data": {
                        "post_title": hit.get("title"),
                        "post_url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                        "keyword": keyword,
                        "about": about,
                    },
                }
            )

    return leads
