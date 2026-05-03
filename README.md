# TrueVoice Intel — Competitive Intelligence Platform

Automated competitive intelligence for the AI video interview market. Scrapes reviews from G2, Capterra, and Reddit, analyzes sentiment with Claude, and tracks competitor health scores over time.

## Architecture

```
├── scraper/          Python scraper (Apify + Claude Haiku)
├── api-server/       Express 5 REST API (file-based storage)
└── monitor/          React dashboard (Vite + TanStack Query)
```

## Features

- **Multi-source scraping**: G2, Capterra, Reddit
- **AI sentiment analysis**: Claude Haiku per-item, Claude Sonnet for theme clustering
- **Health score tracking**: Sentiment (50%) + intensity (10%) + trend (±15%) + volume (25%)
- **Email alerts**: Postmark integration for scraper completion + threshold alerts
- **Slack alerts**: Webhook integration for health score drops
- **CSV export**: Download filtered review lists
- **Cron scheduling**: Automated scraper runs
- **Real-time logs**: Live scraper output in UI

## Quick Start

### 1. Install dependencies

```bash
# API server
cd api-server && bun install && cd ..

# Monitor
cd monitor && bun install && cd ..

# Scraper
cd scraper && uv sync && cd ..
```

### 2. Configure environment

Create `.env` in `api-server/`:

```bash
POSTMARK_API_TOKEN=your-postmark-token
APIFY_API_TOKEN=your-apify-token
ANTHROPIC_API_KEY=your-claude-key
```

### 3. Run

```bash
# Start API server (port 3000)
cd api-server && bun run dev

# Start monitor (port 5173)
cd monitor && bun run dev
```

Open http://localhost:5173 and click **Run Scraper**.

## API Endpoints

### Core

- `GET /api/intel/competitors` — List all competitors with stats
- `GET /api/intel/:slug/analysis` — Sentiment analysis per competitor
- `GET /api/intel/:slug/reviews?limit=50&offset=0&source=g2&search=...&minRating=3&maxRating=5` — Paginated reviews
- `GET /api/intel/:slug/reviews/export` — CSV download (same filters as above)
- `GET /api/intel/:slug/history` — Sentiment snapshots over time
- `GET /api/intel/:slug/themes` — AI-clustered themes
- `GET /api/intel/:slug/gap` — Gap analysis (unique complaints)
- `GET /api/intel/:slug/wishes` — Feature requests grouped by urgency

### Scraper

- `POST /api/intel/run` — Trigger scraper (returns immediately, polls status)
- `GET /api/intel/run/status` — Live logs, exit code, timestamps

### Notifications

- `GET /api/intel/notifications` — Email + Slack config
- `POST /api/intel/notifications` — Update config
  ```json
  {
    "email": "you@company.com",
    "fromEmail": "hello@truevoicehq.com",
    "slackWebhook": "https://hooks.slack.com/services/...",
    "notifyOnSuccess": true,
    "notifyOnFailure": true
  }
  ```

### Scheduling

- `GET /api/intel/schedule` — Cron config
- `POST /api/intel/schedule` — Update schedule
  ```json
  {
    "enabled": true,
    "schedule": "0 9 * * *"
  }
  ```

### Thresholds

- `GET /api/intel/thresholds` — Health score alert thresholds per competitor
- `PUT /api/intel/thresholds` — Update thresholds
  ```json
  {
    "hirevue": 40,
    "sparkhire": 50
  }
  ```

## Data Storage

All data stored as JSON in `api-server/data/`:

```
data/
├── g2_hirevue.json                  # Raw G2 reviews
├── capterra_hirevue.json            # Raw Capterra reviews
├── reddit_hirevue.json              # Raw Reddit mentions
├── analysis_hirevue.json            # Claude sentiment analysis per review
├── themes_hirevue.json              # Claude-clustered themes
├── gap_hirevue.json                 # Gap analysis (unique complaints)
├── wishes_hirevue.json              # Feature requests
├── _sentiment_history.json          # Historical snapshots for all competitors
├── _prev_counts.json                # Review counts from last run (for delta detection)
├── _notifications.json              # Email + Slack config
├── _schedule.json                   # Cron config
├── _thresholds.json                 # Health score alert thresholds
└── _notes.json                      # Internal notes per competitor
```

## Health Score Algorithm

```typescript
const sentScore = (positiveCount / totalReviews) * 50;
const intensityBonus = (avgIntensity / 10) * 10;
const trendBonus = trend === "up" ? 15 : trend === "down" ? -10 : 0;
const volumeBonus = Math.min(totalReviews, 500) / 500 * 25;

healthScore = sentScore + intensityBonus + trendBonus + volumeBonus; // 0-100
```

## Deployment

### Railway (recommended)

1. Push to GitHub
2. Import to Railway, set env vars
3. Deploy `api-server` and `monitor` as separate services
4. Point monitor's `VITE_API_URL` to api-server Railway URL

### Vercel

```bash
cd monitor && vercel
cd api-server && vercel
```

Set `VITE_API_URL` in monitor's Vercel project settings to api-server URL.

## Competitors Tracked

- HireVue
- SparkHire
- BrightHire
- Interviewing.io
- Metaview

Add more by updating `COMPETITORS` array in `api-server/src/routes/intel.ts`.

## Scraper Details

Python pipeline orchestrated by `scraper/run.sh`:

1. **Apify actors** — Fetch raw reviews from G2, Capterra, Reddit
2. **Claude Haiku** — Per-item sentiment analysis (batch of 100)
3. **Claude Sonnet** — Theme clustering across all reviews
4. **Save** — Write JSON files to `api-server/data/`

Runtime: ~5-10 min for 5 competitors.

## License

MIT
