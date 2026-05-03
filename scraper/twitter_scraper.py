"""
Twitter/X Scraper using API v2
Requires: TWITTER_BEARER_TOKEN in env
Run: python3 twitter_scraper.py
"""
import json
import os
import time
import logging
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv
from competitors import COMPETITORS, DATA_DIR

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("twitter_scraper")

os.makedirs(DATA_DIR, exist_ok=True)

TWITTER_API_BASE = "https://api.twitter.com/2"


def get_headers():
    token = os.environ["TWITTER_BEARER_TOKEN"]
    return {"Authorization": f"Bearer {token}"}


def search_tweets(query: str, max_results: int = 100) -> list:
    tweets = []
    url = f"{TWITTER_API_BASE}/tweets/search/recent"
    start_time = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")

    params = {
        "query": f"{query} lang:en -is:retweet",
        "max_results": min(max_results, 100),
        "tweet.fields": "created_at,public_metrics,author_id",
        "expansions": "author_id",
        "user.fields": "public_metrics",
        "start_time": start_time,
    }

    next_token = None
    fetched = 0

    while fetched < max_results:
        if next_token:
            params["next_token"] = next_token

        try:
            resp = requests.get(url, headers=get_headers(), params=params, timeout=15)
            if resp.status_code == 429:
                reset = int(resp.headers.get("x-rate-limit-reset", time.time() + 60))
                sleep_for = max(reset - time.time(), 1)
                logger.warning("Rate limited, sleeping %.0fs", sleep_for)
                time.sleep(sleep_for)
                continue
            resp.raise_for_status()
            data = resp.json()

            users_by_id = {}
            for user in data.get("includes", {}).get("users", []):
                users_by_id[user["id"]] = user

            for tweet in data.get("data", []):
                author = users_by_id.get(tweet.get("author_id"), {})
                metrics = tweet.get("public_metrics", {})
                tweets.append({
                    "source": "twitter",
                    "id": tweet["id"],
                    "text": tweet["text"],
                    "date": tweet.get("created_at", ""),
                    "likes": metrics.get("like_count", 0),
                    "replies": metrics.get("reply_count", 0),
                    "retweets": metrics.get("retweet_count", 0),
                    "follower_count": author.get("public_metrics", {}).get("followers_count", 0),
                    "query": query,
                    "scraped_at": datetime.utcnow().isoformat(),
                })
                fetched += 1

            next_token = data.get("meta", {}).get("next_token")
            if not next_token or not data.get("data"):
                break

            time.sleep(1)

        except Exception as e:
            logger.error("Twitter API error for '%s': %s", query, e)
            break

    return tweets


def scrape_competitor(competitor: dict) -> list:
    all_tweets = []
    seen_ids = set()

    for query in competitor["twitter_terms"]:
        tweets = search_tweets(query)
        for tweet in tweets:
            if tweet["id"] not in seen_ids:
                tweet["competitor"] = competitor["name"]
                all_tweets.append(tweet)
                seen_ids.add(tweet["id"])
        logger.info("Query '%s': %d unique tweets", query, len(all_tweets))
        time.sleep(2)

    return all_tweets


def main():
    for competitor in COMPETITORS:
        logger.info("Scraping Twitter for %s...", competitor["name"])
        tweets = scrape_competitor(competitor)
        out_path = os.path.join(DATA_DIR, f"twitter_{competitor['slug']}.json")
        with open(out_path, "w") as f:
            json.dump(tweets, f, indent=2)
        logger.info("Saved %d tweets to %s", len(tweets), out_path)


if __name__ == "__main__":
    main()
