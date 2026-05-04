"""
G2 Reviews Scraper — powered by Apify (magicfingers/g2-reviews-scraper)
Requires: APIFY_API_TOKEN
Run: python3 g2_scraper.py

NOTE: G2 heavily rate-limits and blocks scrapers with Cloudflare. The Apify actor
magicfingers/g2-reviews-scraper uses HTTP mode and may return 0 results due to 403
blocks. If 0 results are returned, the scraper writes an empty file (non-fatal).
The pipeline continues with Reddit + Capterra data for analysis.
"""
import json
import os
import logging
from datetime import datetime

from apify_client import ApifyClient
from competitors import COMPETITORS, DATA_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("g2_scraper")

os.makedirs(DATA_DIR, exist_ok=True)

MAX_REVIEWS_PER_COMPETITOR = 100


def normalize(item: dict, competitor: dict) -> dict:
    """Normalize magicfingers/g2-reviews-scraper output."""
    def safe_float(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return {
        "source": "g2",
        "competitor": competitor["name"],
        "rating": safe_float(
            item.get("starRating")
            or item.get("rating")
            or item.get("overallRating")
            or item.get("score")
        ),
        "title": item.get("reviewTitle") or item.get("title") or "",
        "text": (
            item.get("reviewText")
            or item.get("body")
            or item.get("review")
            or item.get("text")
            or ""
        ),
        "pros": item.get("pros") or item.get("likesAbout") or "",
        "cons": item.get("cons") or item.get("dislikesAbout") or "",
        "reviewer_role": (
            item.get("reviewerJobTitle")
            or item.get("jobTitle")
            or item.get("reviewerTitle")
            or item.get("userOccupation")
            or ""
        ),
        "reviewer_company_size": item.get("companySize") or item.get("companySizeSegment") or "",
        "date": item.get("reviewDate") or item.get("date") or item.get("submittedAt") or "",
        "url": item.get("url") or item.get("reviewUrl") or "",
        "scraped_at": datetime.utcnow().isoformat(),
    }


def scrape_g2(competitor: dict) -> list:
    api_key = os.environ.get("APIFY_API_TOKEN")
    if not api_key:
        logger.error("APIFY_API_TOKEN not set — skipping G2 for %s", competitor["name"])
        return []

    client = ApifyClient(api_key)
    slug = competitor["g2_slug"]
    url = f"https://www.g2.com/products/{slug}/reviews"

    logger.info("Running Apify G2 actor for %s (url: %s)", competitor["name"], url)
    try:
        run = client.actor("magicfingers/g2-reviews-scraper").call(
            run_input={
                "startUrls": [{"url": url}],
                "maxReviews": MAX_REVIEWS_PER_COMPETITOR,
                "proxyConfiguration": {"useApifyProxy": True},
            },
            timeout_secs=300,
        )
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        if len(items) == 0:
            logger.warning(
                "G2 returned 0 items for %s (likely Cloudflare 403 block). "
                "Pipeline continues with Reddit + Capterra data.",
                competitor["name"],
            )
        else:
            logger.info("Apify returned %d G2 reviews for %s", len(items), competitor["name"])
        return [normalize(it, competitor) for it in items]
    except Exception as e:
        logger.error("Apify G2 actor failed for %s: %s", competitor["name"], e)
        return []


def main():
    for competitor in COMPETITORS:
        logger.info("=== G2: %s ===", competitor["name"])
        reviews = scrape_g2(competitor)
        out_path = os.path.join(DATA_DIR, f"g2_{competitor['slug']}.json")
        with open(out_path, "w") as f:
            json.dump(reviews, f, indent=2)
        logger.info("Saved %d G2 reviews → %s", len(reviews), out_path)


if __name__ == "__main__":
    main()
