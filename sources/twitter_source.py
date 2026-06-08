import os
import re
from urllib.parse import urlparse

import tweepy
from dotenv import load_dotenv

from agents.email_extractor import ai_extract_company_domain

load_dotenv()


def _extract_domain_from_text(text: str) -> str | None:
    urls = re.findall(r"https?://[^\s\"'>]+", text)
    for url in urls:
        parsed = urlparse(url)
        host = parsed.netloc.removeprefix("www.")
        if host and "twitter" not in host and "t.co" not in host and "x.com" not in host:
            return host
    return None


def _get_client() -> tweepy.Client:
    bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
    if not bearer_token:
        raise RuntimeError("TWITTER_BEARER_TOKEN not set")
    return tweepy.Client(bearer_token=bearer_token, wait_on_rate_limit=True)


def fetch_leads(config: dict, max_results: int = 30) -> list[dict]:
    client = _get_client()

    pain_keywords = config["target"].get("pain_points", [])
    target_role = config["target"].get("role", "")
    target_industry = config["target"].get("industry", "")

    seen_authors: set[str] = set()
    leads = []

    for keyword in pain_keywords:
        if len(leads) >= max_results:
            break

        query_parts = [keyword, "-is:retweet", "lang:en"]
        if target_role:
            query_parts.append(f'("{target_role}" OR founder OR CEO OR owner)')
        query = " ".join(query_parts)

        try:
            response = client.search_recent_tweets(
                query=query,
                max_results=min(100, max_results * 3),
                tweet_fields=["author_id", "text"],
                expansions=["author_id"],
                user_fields=["name", "username", "description", "url", "entities"],
            )
        except tweepy.TweepyException:
            continue

        if not response.data:
            continue

        users_by_id = {}
        if response.includes and "users" in response.includes:
            for user in response.includes["users"]:
                users_by_id[user.id] = user

        for tweet in response.data:
            if len(leads) >= max_results:
                break

            user = users_by_id.get(tweet.author_id)
            if not user or user.username in seen_authors:
                continue
            seen_authors.add(user.username)

            domain = None

            # try expanded url in profile
            try:
                expanded_urls = (
                    user.entities.get("url", {}).get("urls", [])
                    if user.entities else []
                )
                for u in expanded_urls:
                    host = urlparse(u.get("expanded_url", "")).netloc.removeprefix("www.")
                    if host and "twitter" not in host and "x.com" not in host and "t.co" not in host:
                        domain = host
                        break
            except Exception:
                pass

            # try bio text
            if not domain and user.description:
                domain = _extract_domain_from_text(user.description)

            # AI fallback
            if not domain:
                context = f"{user.description or ''} {tweet.text[:500]}"
                domain = ai_extract_company_domain(user.username, context)

            leads.append(
                {
                    "source": "twitter",
                    "name": user.name,
                    "company": None,
                    "domain": domain,
                    "raw_data": {
                        "username": user.username,
                        "bio": user.description,
                        "tweet": tweet.text,
                        "keyword": keyword,
                        "tweet_url": f"https://x.com/{user.username}",
                    },
                }
            )

    return leads
