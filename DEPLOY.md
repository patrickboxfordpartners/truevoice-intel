# Deployment Guide

## Railway (Recommended)

### 1. Push to GitHub

```bash
gh repo create truevoice-intel --public --source=. --remote=origin
git push -u origin main
```

### 2. Deploy API Server

1. Go to [Railway](https://railway.app)
2. New Project → Deploy from GitHub → Select `truevoice-intel`
3. Add service → Choose `api-server` directory
4. Add environment variables:
   - `POSTMARK_API_TOKEN`
   - `APIFY_API_TOKEN`
   - `ANTHROPIC_API_KEY`
5. Deploy
6. Copy the public URL (e.g., `https://truevoice-api.railway.app`)

### 3. Deploy Monitor

1. Same Railway project → Add service
2. Choose `monitor` directory
3. Add environment variable:
   - `VITE_API_URL=https://truevoice-api.railway.app`
4. Deploy
5. Access at `https://truevoice-monitor.railway.app`

## Vercel

### API Server

```bash
cd api-server
vercel --prod
```

Set env vars in Vercel dashboard.

### Monitor

```bash
cd monitor
vercel --prod --build-env VITE_API_URL=https://your-api.vercel.app
```

## Local Development

```bash
# Terminal 1: API server
cd api-server
cp .env.example .env  # Add your keys
bun install
bun run dev

# Terminal 2: Monitor
cd monitor
bun install
bun run dev
```

Open http://localhost:5173
