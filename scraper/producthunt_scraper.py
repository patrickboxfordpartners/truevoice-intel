"""
ProductHunt Scraper using GraphQL API
Requires: PRODUCTHUNT_API_KEY (developer token from producthunt.com/v2/oauth/applications)
Run: python3 producthunt_scraper.py
"""
import json
import os
import time
import logging
from datetime import datetime

import requests
from dotenv import load_dotenv
from competitors import COMPETITORS, DATA_DIR

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("producthunt_scraper")

os.makedirs(DATA_DIR, exist_ok=True)

PH_API = "https://api.producthunt.com/v2/api/graphql"


def get_headers():
    token = os.environ["PRODUCTHUNT_API_KEY"]
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


SEARCH_QUERY = """
query SearchPost($slug: String!) {
  post(slug: $slug) {
    id
    name
    tagline
    description
    votesCount
    commentsCount
    createdAt
    url
    comments(first: 50) {
      edges {
        node {
          id
          body
          createdAt
          isSticky
          votes
          user {
            name
            headline
          }
          replies(first: 10) {
            edges {
              node {
                body
                votes
                user { name }
              }
            }
          }
        }
      }
    }
  }
}
"""


def fetch_product(slug: str) -> dict | None:
    try:
        resp = requests.post(
            PH_API,
            headers=get_headers(),
            json={"query": SEARCH_QUERY, "variables": {"slug": slug}},
            timeout=15,
        )
        if resp.status_code == 429:
            logger.warning("Rate limited, sleeping 60s")
            time.sleep(60)
            return None
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("post")
    except Exception as e:
        logger.error("ProductHunt API error for %s: %s", slug, e)
        return None


def parse_product(competitor: dict, product: dict) -> list:
    comments = []
    for edge in product.get("comments", {}).get("edges", []):
        node = edge.get("node", {})
        comment = {
            "source": "producthunt",
            "competitor": competitor["name"],
            "product_name": product.get("name", ""),
            "product_tagline": product.get("tagline", ""),
            "comment_id": node.get("id"),
            "body": node.get("body", ""),
            "votes": node.get("votes", 0),
            "is_sticky": node.get("isSticky", False),
            "date": node.get("createdAt", ""),
            "author": node.get("user", {}).get("name", ""),
            "author_headline": node.get("user", {}).get("headline", ""),
            "replies": [
                {
                    "body": r["node"]["body"],
                    "votes": r["node"].get("votes", 0),
                    "author": r["node"].get("user", {}).get("name", ""),
                }
                for r in node.get("replies", {}).get("edges", [])
            ],
            "scraped_at": datetime.utcnow().isoformat(),
        }
        if comment["body"]:
            comments.append(comment)
    return comments


def main():
    for competitor in COMPETITORS:
        logger.info("Scraping ProductHunt for %s...", competitor["name"])
        slug = competitor["producthunt_slug"]
        product = fetch_product(slug)

        if not product:
            logger.warning("No ProductHunt listing found for %s (slug: %s)", competitor["name"], slug)
            comments = []
        else:
            comments = parse_product(competitor, product)
            logger.info("Found %d comments for %s", len(comments), competitor["name"])

        out_path = os.path.join(DATA_DIR, f"producthunt_{competitor['slug']}.json")
        with open(out_path, "w") as f:
            json.dump(comments, f, indent=2)
        logger.info("Saved to %s", out_path)
        time.sleep(2)


if __name__ == "__main__":
    main()
