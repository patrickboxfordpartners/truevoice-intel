"""
Capterra Reviews Scraper — powered by Apify (hello.datawizards/Capterra-Company-Reviews)
Requires: APIFY_API_KEY
Run: python3 capterra_scraper.py

Confirmed field names from live test:
  review_id, review_title, review_date, overall_rating, ease_of_use,
  customer_service, features, value_for_money, likelihood_to_recommend,
  pros, cons, general_comments, incentivized, reviewer_name, role,
  industry, company_size, time_used_product, product_name, product_url, source_site
"""
import json
import os
import logging
from datetime import datetime

from apify_client import ApifyClient
from competitors import COMPETITORS, DATA_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("capterra_scraper")

os.makedirs(DATA_DIR, exist_ok=True)

MAX_REVIEWS_PER_COMPETITOR = 150


def normalize(item: dict, competitor: dict) -> dict:
    """Normalize hello.datawizards/Capterra-Company-Reviews output."""
    def safe_float(v):
        try:
            return float(v) if v not in (None, "", "0.0") else None
        except (TypeError, ValueError):
            return None

    return {
        "source": "capterra",
        "competitor": competitor["name"],
        "rating": safe_float(item.get("overall_rating")),
        "ease_of_use": safe_float(item.get("ease_of_use")),
        "customer_service": safe_float(item.get("customer_service")),
        "features": safe_float(item.get("features")),
        "value_for_money": safe_float(item.get("value_for_money")),
        "likelihood_to_recommend": safe_float(item.get("likelihood_to_recommend")),
        "title": item.get("review_title") or "",
        "text": item.get("general_comments") or "",
        "pros": item.get("pros") or "",
        "cons": item.get("cons") or "",
        "reviewer_name": item.get("reviewer_name") or "",
        "reviewer_role": item.get("role") or "",
        "reviewer_industry": item.get("industry") or "",
        "reviewer_company_size": item.get("company_size") or "",
        "reviewer_usage": item.get("time_used_product") or "",
        "date": item.get("review_date") or "",
        "source_site": item.get("source_site") or "Capterra",
        "url": item.get("product_url") or "",
        "scraped_at": datetime.utcnow().isoformat(),
    }


def scrape_capterra(competitor: dict) -> list:
    api_key = os.environ.get("APIFY_API_KEY")
    if not api_key:
        logger.error("APIFY_API_KEY not set — skipping Capterra for %s", competitor["name"])
        return []

    client = ApifyClient(api_key)
    company_name = competitor["capterra_name"]

    logger.info("Running Apify Capterra actor for %s (companyName: %s)", competitor["name"], company_name)
    try:
        run = client.actor("hello.datawizards/Capterra-Company-Reviews").call(
            run_input={
                "companyName": company_name,
                "maxReviews": MAX_REVIEWS_PER_COMPETITOR,
            },
            timeout_secs=300,
        )
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        logger.info("Apify returned %d items for %s", len(items), competitor["name"])
        return [normalize(it, competitor) for it in items]
    except Exception as e:
        logger.error("Apify Capterra actor failed for %s: %s", competitor["name"], e)
        return []


def main():
    for competitor in COMPETITORS:
        logger.info("=== Capterra: %s ===", competitor["name"])
        reviews = scrape_capterra(competitor)
        out_path = os.path.join(DATA_DIR, f"capterra_{competitor['slug']}.json")
        with open(out_path, "w") as f:
            json.dump(reviews, f, indent=2)
        logger.info("Saved %d Capterra reviews → %s", len(reviews), out_path)


if __name__ == "__main__":
    main()
