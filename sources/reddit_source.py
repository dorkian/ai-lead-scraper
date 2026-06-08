import os
import re
import json
from urllib.parse import urlparse

import praw
from dotenv import load_dotenv

from agents.email_extractor import ai_extract_company_domain

load_dotenv()

TARGET_SUBS = ["entrepreneur", "smallbusiness", "startups", "marketing"]


def extract_domain_from_bio(user) -> str | None:
    try:
        bio = getattr(user, "subreddit", {})
        if isinstance(bio, dict):
            description = bio.get("public_description", "") or ""
        else:
            description = getattr(bio, "public_description", "") or ""
        urls = re.findall(r"https?://[^\s\"'>]+", description)
        for url in urls:
            parsed = urlparse(url)
            host = parsed.netloc.removeprefix("www.")
            if host and "reddit" not in host:
                return host
    except Exception:
        pass
    return None


def fetch_leads(config: dict, max_results: int = 30) -> list[dict]:
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set")

    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent="leadbot/1.0",
    )

    pain_keywords = config["target"].get("pain_points", [])
    seen_authors: set[str] = set()
    leads = []

    for keyword in pain_keywords:
        for sub in TARGET_SUBS:
            if len(leads) >= max_results:
                break
            try:
                for post in reddit.subreddit(sub).search(keyword, limit=10):
                    author = post.author
                    if not author or author.name in seen_authors:
                        continue
                    seen_authors.add(author.name)

                    user = reddit.redditor(author.name)
                    domain = extract_domain_from_bio(user)

                    if not domain:
                        domain = ai_extract_company_domain(
                            author.name,
                            post.title + " " + post.selftext[:500],
                        )

                    leads.append(
                        {
                            "source": "reddit",
                            "name": author.name,
                            "company": None,
                            "domain": domain,
                            "raw_data": {
                                "post_title": post.title,
                                "post_url": post.url,
                                "subreddit": sub,
                                "keyword": keyword,
                            },
                        }
                    )
            except Exception:
                continue

    return leads
