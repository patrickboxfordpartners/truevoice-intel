#!/usr/bin/env bash
# TrueVoice Intel — scraper pipeline
# Runs all scrapers then the Claude analysis pipeline.
# Env vars used (set in Replit Secrets):
#   APIFY_API_TOKEN          — required for G2 + Capterra
#   ANTHROPIC_API_KEY      — required for AI analysis
#   TWITTER_BEARER_TOKEN   — optional (Twitter/X scraper)
#   PRODUCTHUNT_API_KEY    — optional (ProductHunt scraper)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Installing Python dependencies ==="
python3 -m pip install --quiet --break-system-packages -r requirements.txt 2>&1 || \
  pip3 install --quiet --break-system-packages -r requirements.txt 2>&1 || \
  pip install --quiet -r requirements.txt 2>&1
echo "✓ Dependencies ready"

mkdir -p data

PASS=0
FAIL=0

run_step() {
    local label="$1"
    local cmd="$2"
    echo ""
    echo "=== $label ==="
    if eval "$cmd"; then
        echo "✓ $label completed"
        PASS=$((PASS + 1))
    else
        echo "✗ $label failed (exit $?) — continuing pipeline"
        FAIL=$((FAIL + 1))
    fi
}

run_step "G2 Reviews (Apify)" "python3 g2_scraper.py"

run_step "Capterra Reviews (Apify)" "python3 capterra_scraper.py"

run_step "Reddit Posts (public API)" "python3 reddit_scraper.py"

if [ -n "$TWITTER_BEARER_TOKEN" ]; then
    run_step "Twitter/X" "python3 twitter_scraper.py"
else
    echo ""
    echo "=== Twitter/X ==="
    echo "Skipping — TWITTER_BEARER_TOKEN not set"
fi

if [ -n "$PRODUCTHUNT_API_KEY" ]; then
    run_step "ProductHunt" "python3 producthunt_scraper.py"
else
    echo ""
    echo "=== ProductHunt ==="
    echo "Skipping — PRODUCTHUNT_API_KEY not set"
fi

run_step "Claude AI Analysis" "python3 analyze.py"

echo ""
echo "================================================"
echo "Pipeline complete — $PASS steps passed, $FAIL failed"
echo "Data saved to: $SCRIPT_DIR/data/"
echo "================================================"

# Exit non-zero only if the analysis step failed (scrapers can partially fail)
if [ $PASS -eq 0 ]; then
    exit 1
fi
exit 0
