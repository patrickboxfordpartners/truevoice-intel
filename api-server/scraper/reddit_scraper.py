"""
Reddit Scraper — powered by Apify (trudax/reddit-scraper-lite)
Requires: APIFY_API_TOKEN
Run: python3 reddit_scraper.py

Confirmed field names from live test:
  id, parsedId, url, username, userId, title, communityName, parsedCommunityName,
  body, html, link, numberOfComments, flair, authorFlair, upVotes, upVoteRatio,
  isVideo, isAd, over18, thumbnailUrl, imageUrls, createdAt, scrapedAt, dataType
"""
import json
import os
import logging
from datetime import datetime

from apify_client import ApifyClient
from competitors import COMPETITORS, DATA_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("reddit_scraper")

os.makedirs(DATA_DIR, exist_ok=True)

GENERAL_TERMS = [
    "AI video interview",
    "automated video interview",
    "video interview screening",
]

POSTS_PER_TERM = 30


def normalize(item: dict, competitor: dict, search_term: str) -> dict:
    """Normalize trudax/reddit-scraper-lite output."""
    return {
        "source": "reddit",
        "competitor": competitor["name"],
        "subreddit": item.get("parsedCommunityName") or item.get("communityName") or "",
        "search_term": search_term,
        "title": item.get("title") or "",
        "body": (item.get("body") or "")[:2000],
        "upvotes": item.get("upVotes") or 0,
        "upvote_ratio": item.get("upVoteRatio") or 0,
        "num_comments": item.get("numberOfComments") or 0,
        "url": item.get("url") or "",
        "author": item.get("username") or "",
        "flair": item.get("flair") or "",
        "date": item.get("createdAt") or "",
        "scraped_at": datetime.utcnow().isoformat(),
    }


def scrape_reddit(competitor: dict) -> list:
    api_key = os.environ.get("APIFY_API_TOKEN")
    if not api_key:
        logger.error("APIFY_API_TOKEN not set — skipping Reddit for %s", competitor["name"])
        return []

    client = ApifyClient(api_key)
    all_posts: list[dict] = []
    seen_urls: set[str] = set()
    search_terms = competitor["reddit_terms"] + GENERAL_TERMS

    for term in search_terms:
        logger.info("Searching Reddit: '%s' (%s)...", term, competitor["name"])
        try:
            run = client.actor("trudax/reddit-scraper-lite").call(
                run_input={
                    "searches": [term],
                    "type": "posts",
                    "sort": "relevance",
                    "time": "year",
                    "maxItems": POSTS_PER_TERM,
                    "proxy": {"useApifyProxy": True},
                },
                timeout_secs=120,
            )
            items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
            logger.info("  '%s': %d raw items", term, len(items))
            for item in items:
                post = normalize(item, competitor, term)
                url = post["url"]
                if url and url not in seen_urls and (post["title"] or post["body"]):
                    all_posts.append(post)
                    seen_urls.add(url)
        except Exception as e:
            logger.error("Apify Reddit actor failed for '%s': %s", term, e)

    return all_posts


def main():
    for competitor in COMPETITORS:
        logger.info("=== Reddit: %s ===", competitor["name"])
        posts = scrape_reddit(competitor)
        out_path = os.path.join(DATA_DIR, f"reddit_{competitor['slug']}.json")
        with open(out_path, "w") as f:
            json.dump(posts, f, indent=2)
        logger.info("Saved %d Reddit posts → %s", len(posts), out_path)


if __name__ == "__main__":
    main()
