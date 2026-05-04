"""
AI Analysis Pipeline using Claude
Runs sentiment classification, theme clustering, gap analysis, and feature prioritization.
Run: python3 analyze.py
"""
import json
import os
import csv
import time
import logging
from collections import defaultdict, Counter
from datetime import datetime

import anthropic
from dotenv import load_dotenv
from competitors import COMPETITORS, DATA_DIR

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("analyze")

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

SOURCES = ["g2", "capterra", "reddit", "twitter", "producthunt"]

TRUEVOICE_FEATURES = """
- LiveKit real-time video with sub-100ms latency
- Deepgram transcription with speaker diarization
- XAI Grok behavioral and sentiment analysis
- Structured interview scoring rubrics
- Candidate-facing feedback transparency
- ATS integrations (Greenhouse, Lever, Workday)
- Real-time coaching prompts for interviewers
- Bias detection and flagging
"""


def load_all_data(competitor: dict) -> list:
    items = []
    slug = competitor["slug"]
    for source in SOURCES:
        path = os.path.join(DATA_DIR, f"{source}_{slug}.json")
        if os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            items.extend(data)
    return items


def get_text(item: dict) -> str:
    parts = []
    for field in ["text", "title", "body", "pros", "cons", "comment_id"]:
        if field == "comment_id":
            continue
        val = item.get(field, "")
        if val:
            parts.append(val)
    for comment in item.get("comments", []):
        if isinstance(comment, dict) and comment.get("text"):
            parts.append(comment["text"])
    return " ".join(parts)[:2000]


def classify_sentiment(text: str, competitor: str) -> dict:
    prompt = f"""Classify this review/post about {competitor} and extract key points.

Text: {text}

Output a JSON object ONLY (no explanation) with these exact keys:
{{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "intensity": <integer 1-10>,
  "themes": <array of strings from: feature_request, bug, pricing, support, ux, ai_bias, candidate_experience, accuracy, integration, transparency, fairness, speed, trust>,
  "pain_point": "<one sentence summary of the main complaint, or empty string>",
  "wish": "<one sentence of what they wish existed, or empty string>"
}}"""

    try:
        resp = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        raw = raw.strip("```json").strip("```").strip()
        return json.loads(raw)
    except Exception as e:
        logger.error("Sentiment classification failed: %s", e)
        return {"sentiment": "neutral", "intensity": 5, "themes": [], "pain_point": "", "wish": ""}


def cluster_themes(analyses: list, competitor: str) -> dict:
    pain_points = [a.get("pain_point", "") for a in analyses if a.get("pain_point")]
    theme_counts = Counter()
    for a in analyses:
        for t in a.get("themes", []):
            theme_counts[t] += 1

    pain_sample = "\n".join(f"- {p}" for p in pain_points[:100])
    prompt = f"""Group these pain points from {competitor} reviews into 5-8 major themes.

Pain points:
{pain_sample}

Output JSON ONLY:
{{
  "clusters": [
    {{
      "theme": "<short theme name>",
      "description": "<one sentence describing what users complain about>",
      "count": <estimated count>,
      "example_quotes": ["<quote1>", "<quote2>"]
    }}
  ]
}}"""

    try:
        resp = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip().strip("```json").strip("```").strip()
        result = json.loads(raw)
        result["theme_frequency"] = dict(theme_counts.most_common(10))
        return result
    except Exception as e:
        logger.error("Theme clustering failed: %s", e)
        return {"clusters": [], "theme_frequency": dict(theme_counts.most_common(10))}


def gap_analysis(competitor: str, pain_points: list) -> str:
    sample = "\n".join(f"- {p}" for p in pain_points[:50])
    prompt = f"""You are a product strategist for TrueVoice HQ, an AI video interview platform.

TrueVoice's current differentiators:
{TRUEVOICE_FEATURES}

Users of competitor {competitor} are complaining about:
{sample}

Analyze the competitive opportunity. Output markdown with these sections:

## Feature Gaps
What users want that nobody offers yet.

## Positioning Opportunities
Angles {competitor} is missing that TrueVoice can own.

## Messaging Hooks
3-5 specific marketing messages TrueVoice should use against {competitor}.

## Immediate Wins
2-3 quick product/positioning moves TrueVoice can make right now."""

    try:
        resp = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text
    except Exception as e:
        logger.error("Gap analysis failed: %s", e)
        return f"# Gap Analysis for {competitor}\n\nAnalysis failed: {e}"


def build_feature_priority(all_analyses: dict) -> list:
    feature_data = defaultdict(lambda: {"frequency": 0, "intensity_sum": 0, "competitors": set()})

    for competitor, analyses in all_analyses.items():
        for a in analyses:
            for theme in a.get("themes", []):
                feature_data[theme]["frequency"] += 1
                feature_data[theme]["intensity_sum"] += a.get("intensity", 5)
                feature_data[theme]["competitors"].add(competitor)

    rows = []
    for feature, data in feature_data.items():
        freq = data["frequency"]
        avg_intensity = round(data["intensity_sum"] / freq, 1) if freq > 0 else 0
        competitors_offering = len(data["competitors"])
        opportunity = round((freq * avg_intensity) / max(competitors_offering, 1), 1)
        rows.append({
            "feature": feature,
            "frequency": freq,
            "avg_intensity": avg_intensity,
            "competitors_mentioning": competitors_offering,
            "competitor_names": ", ".join(sorted(data["competitors"])),
            "opportunity_score": opportunity,
        })

    rows.sort(key=lambda r: r["opportunity_score"], reverse=True)
    return rows


def main():
    all_analyses = {}
    gap_analyses = {}

    for competitor in COMPETITORS:
        name = competitor["name"]
        slug = competitor["slug"]
        logger.info("=== Analyzing %s ===", name)

        items = load_all_data(competitor)
        if not items:
            logger.warning("No data found for %s — run scrapers first", name)
            continue

        logger.info("Classifying sentiment for %d items...", len(items))
        analyses = []
        for i, item in enumerate(items):
            text = get_text(item)
            if not text.strip():
                continue
            result = classify_sentiment(text, name)
            result["source"] = item.get("source", "unknown")
            result["original_text"] = text[:500]
            analyses.append(result)
            if (i + 1) % 10 == 0:
                logger.info("  Classified %d/%d", i + 1, len(items))
            time.sleep(0.3)

        out_path = os.path.join(DATA_DIR, f"analysis_{slug}.json")
        with open(out_path, "w") as f:
            json.dump(analyses, f, indent=2)
        logger.info("Saved analysis to %s", out_path)

        # ── sentiment history snapshot ────────────────────────────────────
        history_path = os.path.join(DATA_DIR, "_sentiment_history.json")
        history: dict = {}
        if os.path.exists(history_path):
            try:
                with open(history_path) as hf:
                    history = json.load(hf)
            except Exception:
                history = {}

        counts = {"positive": 0, "negative": 0, "neutral": 0, "mixed": 0}
        intensity_sum = 0
        for a in analyses:
            s = a.get("sentiment", "neutral")
            if s in counts:
                counts[s] += 1
            intensity_sum += a.get("intensity", 5)
        total = len(analyses) or 1
        snapshot = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "positive": counts["positive"],
            "negative": counts["negative"],
            "neutral": counts["neutral"],
            "mixed": counts["mixed"],
            "avgIntensity": round(intensity_sum / total, 1),
        }
        slug_history = history.get(slug, [])
        slug_history.append(snapshot)
        history[slug] = slug_history[-10:]  # keep last 10 runs
        with open(history_path, "w") as hf:
            json.dump(history, hf, indent=2)
        logger.info("Appended sentiment snapshot for %s (total history: %d)", slug, len(history[slug]))

        all_analyses[name] = analyses

        logger.info("Clustering themes for %s...", name)
        themes = cluster_themes(analyses, name)
        themes_path = os.path.join(DATA_DIR, f"themes_{slug}.json")
        with open(themes_path, "w") as f:
            json.dump(themes, f, indent=2)

        logger.info("Running gap analysis for %s...", name)
        pain_points = [a.get("pain_point", "") for a in analyses if a.get("pain_point")]
        gap_md = gap_analysis(name, pain_points)
        gap_analyses[name] = gap_md
        gap_path = os.path.join(DATA_DIR, f"gap_{slug}.md")
        with open(gap_path, "w") as f:
            f.write(f"# Competitive Gap Analysis: {name}\n\n")
            f.write(f"*Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*\n\n")
            f.write(gap_md)
        logger.info("Saved gap analysis to %s", gap_path)

    if all_analyses:
        logger.info("Building feature priority ranking...")
        priority_rows = build_feature_priority(all_analyses)
        csv_path = os.path.join(DATA_DIR, "feature_priority.csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["feature", "frequency", "avg_intensity", "competitors_mentioning", "competitor_names", "opportunity_score"])
            writer.writeheader()
            writer.writerows(priority_rows)
        json_path = os.path.join(DATA_DIR, "feature_priority.json")
        with open(json_path, "w") as f:
            json.dump(priority_rows, f, indent=2)
        logger.info("Saved feature priority to %s", csv_path)

    logger.info("Analysis complete.")


if __name__ == "__main__":
    main()
