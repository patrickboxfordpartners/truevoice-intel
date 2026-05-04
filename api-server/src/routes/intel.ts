import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import cron from "node-cron";

const router = Router();

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "../scraper/data");

const SCRAPER_DIR = process.env.SCRAPER_DIR
  ? path.resolve(process.env.SCRAPER_DIR)
  : path.resolve(__dirname, "../scraper");

const SCHEDULE_FILE   = path.join(DATA_DIR, "_schedule.json");
const NOTIFY_FILE     = path.join(DATA_DIR, "_notifications.json");
const HISTORY_FILE    = path.join(DATA_DIR, "_sentiment_history.json");
const PREV_COUNTS_FILE = path.join(DATA_DIR, "_prev_counts.json");
const NOTES_FILE       = path.join(DATA_DIR, "_notes.json");
const THRESHOLDS_FILE  = path.join(DATA_DIR, "_thresholds.json");

type NotesStore = Record<string, { text: string; updatedAt: string }>;
type ThresholdsStore = Record<string, number>; // slug → alert-at score (0 = disabled)

function loadThresholds(): ThresholdsStore {
  try {
    if (fs.existsSync(THRESHOLDS_FILE)) return JSON.parse(fs.readFileSync(THRESHOLDS_FILE, "utf-8")) as ThresholdsStore;
  } catch { /* ignore */ }
  return {};
}
function saveThresholds(t: ThresholdsStore) {
  ensureDataDir();
  fs.writeFileSync(THRESHOLDS_FILE, JSON.stringify(t, null, 2));
}

const COMPETITORS = [
  { name: "HireVue", slug: "hirevue" },
  { name: "SparkHire", slug: "sparkhire" },
  { name: "BrightHire", slug: "brighthire" },
  { name: "Interviewing.io", slug: "interviewing-io" },
  { name: "Metaview", slug: "metaview" },
];

const SOURCES = ["g2", "capterra", "reddit", "twitter", "producthunt"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

// ─── notification config ──────────────────────────────────────────────────────

interface NotifyConfig {
  email: string;
  fromEmail: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  slackWebhook?: string;
}

const DEFAULT_NOTIFY: NotifyConfig = {
  email: "",
  fromEmail: "hello@truevoicehq.com",
  notifyOnSuccess: true,
  notifyOnFailure: true,
  slackWebhook: "",
};

function loadNotifyConfig(): NotifyConfig {
  try {
    if (fs.existsSync(NOTIFY_FILE)) {
      return { ...DEFAULT_NOTIFY, ...JSON.parse(fs.readFileSync(NOTIFY_FILE, "utf-8")) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_NOTIFY };
}

function saveNotifyConfig(cfg: NotifyConfig) {
  ensureDataDir();
  fs.writeFileSync(NOTIFY_FILE, JSON.stringify(cfg, null, 2));
}

interface WishDigestGroup {
  label: string;
  total: number;
  breadth: number;
  byCompetitor: Record<string, number>;
  quotes: string[];
}

const WISH_THEME_LABELS: Record<string, string> = {
  feature_request: "Feature Request", bug: "Bug / Reliability", pricing: "Pricing",
  support: "Support", ux: "UX / Usability", ai_bias: "AI Bias",
  candidate_experience: "Candidate Experience", accuracy: "Accuracy",
  integration: "Integrations", transparency: "Transparency",
  fairness: "Fairness", speed: "Speed", trust: "Trust", general: "General",
};

const WISH_SLUG_NAMES: Record<string, string> = {
  hirevue: "HireVue", sparkhire: "SparkHire", brighthire: "BrightHire",
  "interviewing-io": "Interviewing.io", metaview: "Metaview",
};

function buildWishDigest(): WishDigestGroup[] {
  const themeMap = new Map<string, { total: number; byCompetitor: Record<string, number>; quotes: string[] }>();
  for (const comp of COMPETITORS) {
    const analyses = readJson<Array<Record<string, unknown>>>(
      path.join(DATA_DIR, `analysis_${comp.slug}.json`)
    ) ?? [];
    for (const a of analyses) {
      if (!a.wish || !String(a.wish).trim()) continue;
      const themes = (a.themes as string[] | undefined) ?? [];
      const key = themes[0] ?? "general";
      if (!themeMap.has(key)) themeMap.set(key, { total: 0, byCompetitor: {}, quotes: [] });
      const bucket = themeMap.get(key)!;
      bucket.total++;
      bucket.byCompetitor[comp.slug] = (bucket.byCompetitor[comp.slug] ?? 0) + 1;
      const q = String(a.wish).trim();
      if (q && bucket.quotes.length < 3 && !bucket.quotes.includes(q)) bucket.quotes.push(q);
    }
  }
  return Array.from(themeMap.entries())
    .map(([theme, { total, byCompetitor, quotes }]) => ({
      label: WISH_THEME_LABELS[theme] ?? theme, total, breadth: Object.keys(byCompetitor).length, byCompetitor, quotes,
    }))
    .sort((a, b) => b.breadth - a.breadth || b.total - a.total)
    .slice(0, 6);
}

async function sendScraperEmail(opts: {
  email: string;
  fromEmail: string;
  success: boolean;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  triggeredBy: string | null;
  lines: string[];
  wishGroups?: WishDigestGroup[];
}) {
  const apiToken = process.env.POSTMARK_API_TOKEN;
  if (!apiToken) return { error: "POSTMARK_API_TOKEN not set" };

  const { email, success, exitCode, startedAt, finishedAt, triggeredBy, lines, wishGroups } = opts;
  const duration =
    startedAt && finishedAt
      ? `${Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)}s`
      : "unknown";
  const logExcerpt = lines
    .slice(-20)
    .join("\n")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const statusColor = success ? "#34d399" : "#f87171";
  const statusBg = success ? "#064e3b" : "#450a0a";
  const statusBorder = success ? "#065f46" : "#7f1d1d";
  const statusLabel = success ? "✅ Completed" : `❌ Failed (exit ${exitCode})`;

  // ── wishlist digest section (only on success with data) ───────────────────
  const wishSection = (success && wishGroups && wishGroups.length > 0) ? `
  <div style="margin-top:24px;border-top:1px solid #2d2d2d;padding-top:20px">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Universal Feature Wishlist</div>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:14px">Top features users wish existed across all 5 competitors — ranked by breadth</div>
    ${wishGroups.map((g, i) => {
      const competitorPills = Object.entries(g.byCompetitor)
        .sort(([, a], [, b]) => b - a)
        .map(([slug, count]) => `<span style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:20px;padding:1px 8px;font-size:10px;font-family:monospace;color:#94a3b8;margin:1px 2px">${WISH_SLUG_NAMES[slug] ?? slug} ·${count}</span>`)
        .join("");
      const quote = g.quotes[0] ? `<div style="margin-top:6px;padding:8px 10px;background:#0f172a;border-left:2px solid #334155;border-radius:0 4px 4px 0;font-size:11px;color:#64748b;line-height:1.6">${g.quotes[0].length > 140 ? g.quotes[0].slice(0, 137) + "…" : g.quotes[0]}</div>` : "";
      return `
    <div style="background:#111;border:1px solid #1e293b;border-radius:8px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">
        <span style="background:#2e1065;color:#a78bfa;border:1px solid #4c1d95;border-radius:4px;padding:1px 7px;font-size:9px;font-family:monospace;font-weight:700">#${i + 1}</span>
        <span style="font-size:13px;font-weight:600;color:#e2e8f0">${g.label}</span>
        <span style="font-size:10px;font-family:monospace;color:#a78bfa;margin-left:auto">${g.breadth}/5 competitors · ${g.total} mentions</span>
      </div>
      <div style="margin-bottom:4px">${competitorPills}</div>
      ${quote}
    </div>`;
    }).join("")}
  </div>` : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e2e8f0;margin:0;padding:24px}
.card{background:#1a1a1a;border:1px solid #2d2d2d;border-radius:10px;padding:28px;max-width:600px;margin:0 auto}
.header{font-size:20px;font-weight:700;margin-bottom:2px}
.sub{font-size:13px;color:#94a3b8;margin-bottom:20px}
.badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:20px;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.cell{background:#111;border:1px solid #222;border-radius:6px;padding:10px 14px}
.label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:4px}
.value{font-family:monospace;font-size:13px;color:#e2e8f0}
.log-title{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.log{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:6px;padding:14px;font-family:monospace;font-size:11px;line-height:1.7;color:#94a3b8;white-space:pre-wrap;word-break:break-all}
.footer{margin-top:20px;font-size:11px;color:#475569;border-top:1px solid #222;padding-top:14px}
</style></head>
<body>
<div class="card">
  <div class="header">TrueVoice Intel</div>
  <div class="sub">Competitive intelligence pipeline · scraper run notification</div>
  <div class="badge">${statusLabel}</div>
  <div class="grid">
    <div class="cell"><div class="label">Triggered by</div><div class="value">${triggeredBy ?? "unknown"}</div></div>
    <div class="cell"><div class="label">Duration</div><div class="value">${duration}</div></div>
    <div class="cell"><div class="label">Started</div><div class="value">${startedAt ? new Date(startedAt).toLocaleString() : "—"}</div></div>
    <div class="cell"><div class="label">Finished</div><div class="value">${finishedAt ? new Date(finishedAt).toLocaleString() : "—"}</div></div>
  </div>
  ${wishSection}
  <div style="margin-top:20px">
  <div class="log-title">Log — last 20 lines</div>
  <div class="log">${logExcerpt}</div>
  </div>
  <div class="footer">Sent by TrueVoice HQ Intel Dashboard · <a href="#" style="color:#3b82f6;text-decoration:none">Open dashboard</a></div>
</div>
</body>
</html>`;

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": apiToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: `TrueVoice Intel <${opts.fromEmail || "hello@truevoicehq.com"}>`,
        To: email,
        Subject: `TrueVoice Intel: Scraper ${success ? "completed ✅" : "failed ❌"}`,
        HtmlBody: html,
        MessageStream: "outbound",
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { error: data };
    return { ok: true, id: data.MessageID };
  } catch (err) {
    return { error: String(err) };
  }
}

async function sendThresholdAlertEmail(opts: {
  email: string; fromEmail: string; name: string; score: number; threshold: number;
}): Promise<{ ok: true; id: unknown } | { error: unknown }> {
  const apiToken = process.env.POSTMARK_API_TOKEN;
  if (!apiToken) return { error: "POSTMARK_API_TOKEN not set" };
  const { email, fromEmail, name, score, threshold } = opts;
  const scoreColor = score >= 70 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
  const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:24px;border-radius:8px;max-width:480px">
    <h2 style="margin:0 0 12px;font-size:18px">⚠️ Health Score Alert — ${name}</h2>
    <p style="margin:0 0 8px;color:#cbd5e1">The health score for <strong style="color:#f1f5f9">${name}</strong> has dropped to
      <span style="color:${scoreColor};font-weight:bold;font-size:20px"> ${score}/100</span>,
      at or below your configured alert threshold of <strong>${threshold}</strong>.</p>
    <p style="margin:16px 0 0;color:#475569;font-size:11px">TrueVoice Intel · Health Score Alerts · Sent automatically after scraper run</p>
  </div>`;
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": apiToken },
      body: JSON.stringify({ From: fromEmail, To: email, Subject: `⚠️ Health Alert: ${name} dropped to ${score}/100`, HtmlBody: html, MessageStream: "outbound" }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { error: data };
    return { ok: true, id: data.MessageID };
  } catch (err) {
    return { error: String(err) };
  }
}

async function sendSlackAlert(opts: {
  webhookUrl: string; name: string; score: number; threshold: number;
}): Promise<{ ok: true } | { error: unknown }> {
  const { webhookUrl, name, score, threshold } = opts;
  const emoji = score >= 70 ? ":large_green_circle:" : score >= 40 ? ":large_yellow_circle:" : ":red_circle:";
  const payload = {
    text: `${emoji} *Health Score Alert: ${name}*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `⚠️ Health Score Alert: ${name}`, emoji: true }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Current Score:*\n${score}/100` },
          { type: "mrkdwn", text: `*Threshold:*\n${threshold}` }
        ]
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "TrueVoice Intel · Sent automatically after scraper run" }
        ]
      }
    ]
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: text };
    }
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── scraper job state ────────────────────────────────────────────────────────

interface JobState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  lines: string[];
  pid: number | null;
  triggeredBy: "manual" | "schedule" | null;
}

const job: JobState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  lines: [],
  pid: null,
  triggeredBy: null,
};

const MAX_LOG_LINES = 500;

function appendLine(line: string) {
  job.lines.push(line);
  if (job.lines.length > MAX_LOG_LINES) job.lines.shift();
}

function snapshotReviewCounts() {
  ensureDataDir();
  const counts: Record<string, Record<string, number>> = {};
  for (const comp of COMPETITORS) {
    counts[comp.slug] = {};
    for (const source of SOURCES) {
      const data = readJson<unknown[]>(path.join(DATA_DIR, `${source}_${comp.slug}.json`));
      counts[comp.slug][source] = data?.length ?? 0;
    }
  }
  fs.writeFileSync(PREV_COUNTS_FILE, JSON.stringify(counts, null, 2));
}

function launchScraper(triggeredBy: "manual" | "schedule") {
  if (job.running) return false;

  const scriptPath = path.join(SCRAPER_DIR, "run_scrape.sh");
  if (!fs.existsSync(scriptPath)) return false;

  // snapshot current counts before the run so we can show the delta afterward
  snapshotReviewCounts();

  job.running = true;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.exitCode = null;
  job.triggeredBy = triggeredBy;
  job.lines = [`[${new Date().toLocaleTimeString()}] Starting scraper pipeline (${triggeredBy})…`];

  const child = spawn("bash", [scriptPath], {
    cwd: SCRAPER_DIR,
    env: { ...process.env },
  });

  job.pid = child.pid ?? null;

  child.stdout.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => appendLine(`[stdout] ${line}`));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => appendLine(`[stderr] ${line}`));
  });

  child.on("close", (code) => {
    job.running = false;
    job.finishedAt = new Date().toISOString();
    job.exitCode = code;
    job.pid = null;
    appendLine(`[${new Date().toLocaleTimeString()}] Scraper finished with exit code ${code}`);
    saveSchedule({ ...loadSchedule(), lastTriggered: new Date().toISOString() });

    // send email notification if configured
    const notify = loadNotifyConfig();
    const success = code === 0;
    if (notify.email && ((success && notify.notifyOnSuccess) || (!success && notify.notifyOnFailure))) {
      const wishGroups = success ? buildWishDigest() : undefined;
      sendScraperEmail({
        email: notify.email,
        fromEmail: notify.fromEmail,
        success,
        exitCode: code,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        triggeredBy: job.triggeredBy,
        lines: job.lines,
        wishGroups,
      }).then((result) => {
        if ("error" in result) {
          appendLine(`[notify] Email failed: ${JSON.stringify(result.error)}`);
        } else {
          appendLine(`[notify] Email sent to ${notify.email} (id: ${result.id})`);
        }
      });
    }

    // check per-competitor health score thresholds
    if (success && notify.email) {
      const thresholds = loadThresholds();
      const histForThresh = readJson<Record<string, SentimentSnapshot[]>>(HISTORY_FILE) ?? {};
      for (const comp of COMPETITORS) {
        const threshold = thresholds[comp.slug] ?? 0;
        if (threshold <= 0) continue;
        const analyses = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, `analysis_${comp.slug}.json`)) ?? [];
        if (!analyses.length) continue;
        const sentSummary = getSentimentSummary(analyses);
        const totalReviews = SOURCES.reduce((sum, src) => sum + (readJson<unknown[]>(path.join(DATA_DIR, `${src}_${comp.slug}.json`))?.length ?? 0), 0);
        const snaps = histForThresh[comp.slug] ?? [];
        const score = computeHealthScore(sentSummary, computeTrend(snaps), totalReviews);
        if (score <= threshold) {
          // send email alert
          sendThresholdAlertEmail({ email: notify.email, fromEmail: notify.fromEmail, name: comp.name, score, threshold })
            .then((r) => {
              appendLine(`[threshold] ${comp.name}: score=${score} ≤ threshold=${threshold} → email ${"error" in r ? `FAILED: ${JSON.stringify(r.error)}` : `sent`}`);
            });
          // send slack alert if configured
          if (notify.slackWebhook) {
            sendSlackAlert({ webhookUrl: notify.slackWebhook, name: comp.name, score, threshold })
              .then((r) => {
                appendLine(`[threshold] ${comp.name}: score=${score} ≤ threshold=${threshold} → slack ${"error" in r ? `FAILED: ${JSON.stringify(r.error)}` : `sent`}`);
              });
          }
        }
      }
    }
  });

  child.on("error", (err) => {
    job.running = false;
    job.finishedAt = new Date().toISOString();
    job.exitCode = -1;
    job.pid = null;
    appendLine(`[error] ${err.message}`);
  });

  return true;
}

// ─── schedule persistence ─────────────────────────────────────────────────────

type Frequency = "disabled" | "daily" | "weekly";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ScheduleConfig {
  frequency: Frequency;
  hour: number;
  dayOfWeek: number;
  lastTriggered: string | null;
}

const DEFAULT_SCHEDULE: ScheduleConfig = {
  frequency: "disabled",
  hour: 8,
  dayOfWeek: 1,
  lastTriggered: null,
};

function loadSchedule(): ScheduleConfig {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return { ...DEFAULT_SCHEDULE, ...JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8")) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SCHEDULE };
}

function saveSchedule(cfg: ScheduleConfig) {
  ensureDataDir();
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(cfg, null, 2));
}

function buildCronExpression(cfg: ScheduleConfig): string {
  if (cfg.frequency === "daily") return `0 ${cfg.hour} * * *`;
  if (cfg.frequency === "weekly") return `0 ${cfg.hour} * * ${cfg.dayOfWeek}`;
  return "";
}

function nextRunFromCron(expr: string): string | null {
  if (!expr) return null;
  try {
    const parts = expr.split(" ");
    const hour = parseInt(parts[1]);
    const dow = parts[4] === "*" ? null : parseInt(parts[4]);
    const now = new Date();
    const candidate = new Date(now);
    candidate.setSeconds(0);
    candidate.setMinutes(0);
    candidate.setHours(hour);
    for (let i = 0; i < 8; i++) {
      if (candidate > now && (dow === null || candidate.getDay() === dow)) {
        return candidate.toISOString();
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── cron task ────────────────────────────────────────────────────────────────

let cronTask: cron.ScheduledTask | null = null;

function applyCronSchedule(cfg: ScheduleConfig) {
  if (cronTask) { cronTask.stop(); cronTask = null; }
  if (cfg.frequency === "disabled") return;
  const expr = buildCronExpression(cfg);
  if (!cron.validate(expr)) return;
  cronTask = cron.schedule(expr, () => {
    appendLine(`[schedule] Auto-triggered at ${new Date().toLocaleString()}`);
    launchScraper("schedule");
  });
}

const _initialCfg = loadSchedule();
applyCronSchedule(_initialCfg);

// ─── notification endpoints ───────────────────────────────────────────────────

// GET /api/intel/notifications
router.get("/intel/notifications", (req, res) => {
  const cfg = loadNotifyConfig();
  res.json({ ...cfg, hasPostmarkToken: !!process.env.POSTMARK_API_TOKEN });
});

// POST /api/intel/notifications
router.post("/intel/notifications", (req, res) => {
  const { email, fromEmail, notifyOnSuccess, notifyOnFailure, slackWebhook } = req.body as Partial<NotifyConfig>;
  const existing = loadNotifyConfig();
  const updated: NotifyConfig = {
    ...existing,
    ...(typeof email === "string" && { email }),
    ...(typeof fromEmail === "string" && { fromEmail }),
    ...(typeof notifyOnSuccess === "boolean" && { notifyOnSuccess }),
    ...(typeof notifyOnFailure === "boolean" && { notifyOnFailure }),
    ...(typeof slackWebhook === "string" && { slackWebhook }),
  };
  saveNotifyConfig(updated);
  res.json({ ...updated, hasPostmarkToken: !!process.env.POSTMARK_API_TOKEN });
});

// POST /api/intel/notifications/test
router.post("/intel/notifications/test", async (req, res) => {
  const cfg = loadNotifyConfig();
  if (!cfg.email) {
    res.status(400).json({ error: "No recipient email configured" });
    return;
  }
  const result = await sendScraperEmail({
    email: cfg.email,
    fromEmail: cfg.fromEmail,
    success: true,
    exitCode: 0,
    startedAt: new Date(Date.now() - 45000).toISOString(),
    finishedAt: new Date().toISOString(),
    triggeredBy: "test",
    lines: [
      "[test] This is a test notification from TrueVoice Intel",
      "[test] Your email notifications are configured correctly ✓",
      "[test] You will receive alerts when scheduled or manual scraper runs finish",
    ],
  });
  if ("error" in result) {
    res.status(500).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// ─── schedule endpoints ───────────────────────────────────────────────────────

router.get("/intel/schedule", (req, res) => {
  const cfg = loadSchedule();
  const expr = buildCronExpression(cfg);
  res.json({ ...cfg, nextRun: nextRunFromCron(expr), cronExpression: expr || null, dayName: DAYS[cfg.dayOfWeek] });
});

router.post("/intel/schedule", (req, res) => {
  const { frequency, hour, dayOfWeek } = req.body as Partial<ScheduleConfig>;
  const validFrequencies: Frequency[] = ["disabled", "daily", "weekly"];
  if (frequency !== undefined && !validFrequencies.includes(frequency)) {
    res.status(400).json({ error: "frequency must be disabled | daily | weekly" }); return;
  }
  if (hour !== undefined && (typeof hour !== "number" || hour < 0 || hour > 23)) {
    res.status(400).json({ error: "hour must be 0–23" }); return;
  }
  if (dayOfWeek !== undefined && (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6)) {
    res.status(400).json({ error: "dayOfWeek must be 0–6" }); return;
  }
  const existing = loadSchedule();
  const updated: ScheduleConfig = {
    ...existing,
    ...(frequency !== undefined && { frequency }),
    ...(hour !== undefined && { hour }),
    ...(dayOfWeek !== undefined && { dayOfWeek }),
  };
  saveSchedule(updated);
  applyCronSchedule(updated);
  const expr = buildCronExpression(updated);
  res.json({ ...updated, nextRun: nextRunFromCron(expr), cronExpression: expr || null, dayName: DAYS[updated.dayOfWeek] });
});

router.delete("/intel/schedule", (req, res) => {
  const existing = loadSchedule();
  const updated: ScheduleConfig = { ...existing, frequency: "disabled" };
  saveSchedule(updated);
  applyCronSchedule(updated);
  res.json({ ...updated, nextRun: null, cronExpression: null });
});

// ─── run endpoints ────────────────────────────────────────────────────────────

router.post("/intel/run", (req, res) => {
  if (job.running) {
    res.status(409).json({ error: "Scraper already running", pid: job.pid }); return;
  }
  const scriptPath = path.join(SCRAPER_DIR, "run_scrape.sh");
  if (!fs.existsSync(scriptPath)) {
    res.status(404).json({ error: `Script not found: ${scriptPath}` }); return;
  }
  const started = launchScraper("manual");
  if (!started) { res.status(409).json({ error: "Scraper already running" }); return; }
  res.json({ started: true, startedAt: job.startedAt });
});

router.get("/intel/run/status", (req, res) => {
  const tail = parseInt(req.query.tail as string) || 100;
  res.json({
    running: job.running,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    pid: job.pid,
    triggeredBy: job.triggeredBy,
    lines: job.lines.slice(-tail),
    totalLines: job.lines.length,
  });
});

// ─── data endpoints ───────────────────────────────────────────────────────────

function getSentimentSummary(analyses: Array<Record<string, unknown>>) {
  const summary = { positive: 0, negative: 0, neutral: 0, mixed: 0, avgIntensity: 0 };
  if (!analyses.length) return summary;
  let intensitySum = 0;
  for (const a of analyses) {
    const s = a.sentiment as string;
    if (s in summary) (summary as Record<string, number>)[s]++;
    intensitySum += (a.intensity as number) || 5;
  }
  summary.avgIntensity = Math.round((intensitySum / analyses.length) * 10) / 10;
  return summary;
}

interface SentimentSnapshot {
  timestamp: string;
  positive: number; negative: number; neutral: number; mixed: number;
  avgIntensity: number;
}

function computeTrend(snapshots: SentimentSnapshot[]): {
  direction: "up" | "down" | "flat";
  positiveDelta: number;
  negativeDelta: number;
  intensityDelta: number;
  comparedAt: string;
} | null {
  if (snapshots.length < 2) return null;
  const prev = snapshots[snapshots.length - 2];
  const curr = snapshots[snapshots.length - 1];
  const prevTotal = prev.positive + prev.negative + prev.neutral + prev.mixed || 1;
  const currTotal = curr.positive + curr.negative + curr.neutral + curr.mixed || 1;
  const positiveDelta = Math.round((curr.positive / currTotal - prev.positive / prevTotal) * 1000) / 10;
  const negativeDelta = Math.round((curr.negative / currTotal - prev.negative / prevTotal) * 1000) / 10;
  const intensityDelta = Math.round((curr.avgIntensity - prev.avgIntensity) * 10) / 10;
  // net score: positive improvement minus negative worsening
  const net = positiveDelta - negativeDelta;
  const direction: "up" | "down" | "flat" = net > 3 ? "up" : net < -3 ? "down" : "flat";
  return { direction, positiveDelta, negativeDelta, intensityDelta, comparedAt: prev.timestamp };
}

function computeHealthScore(
  sentimentSummary: { positive: number; negative: number; neutral: number; mixed: number; avgIntensity: number } | undefined,
  trend: { direction: "up" | "down" | "flat" } | null | undefined,
  totalReviews: number,
): number {
  const s = sentimentSummary;
  const t = s ? (s.positive + s.negative + s.neutral + s.mixed) : 0;
  const sentScore = s && t > 0 ? Math.round((s.positive / t) * 50) : 25;
  const intensityBonus = s ? Math.round(Math.min(s.avgIntensity, 10) / 10 * 10) : 5;
  const trendBonus = trend?.direction === "up" ? 15 : trend?.direction === "down" ? -10 : 0;
  const volumeBonus = Math.round(Math.min(totalReviews, 500) / 500 * 25);
  return Math.max(0, Math.min(100, sentScore + intensityBonus + trendBonus + volumeBonus));
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const VELOCITY_DAYS = 30;

function computeVelocity(slug: string): number[] {
  const bins = new Array(VELOCITY_DAYS).fill(0) as number[];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const source of SOURCES) {
    const filePath = path.join(DATA_DIR, `${source}_${slug}.json`);
    const reviews = readJson<Array<Record<string, unknown>>>(filePath);
    if (!reviews) continue;
    for (const review of reviews) {
      const dateStr =
        (review.date as string | undefined) ||
        (review.scraped_at as string | undefined) ||
        "";
      if (!dateStr) continue;
      const ts = new Date(dateStr).getTime();
      if (isNaN(ts)) continue;
      const daysAgo = Math.floor((now - ts) / dayMs);
      if (daysAgo >= 0 && daysAgo < VELOCITY_DAYS) {
        bins[VELOCITY_DAYS - 1 - daysAgo]++;
      }
    }
  }
  return bins;
}

router.get("/intel/competitors", (req, res) => {
  const history = readJson<Record<string, SentimentSnapshot[]>>(HISTORY_FILE) ?? {};
  const prevRaw = readJson<Record<string, Record<string, number> | number>>(PREV_COUNTS_FILE) ?? {};
  const now = Date.now();

  const competitors = COMPETITORS.map((comp) => {
    const prevEntry = prevRaw[comp.slug];
    const prevBySource: Record<string, number> =
      prevEntry !== null && typeof prevEntry === "object"
        ? (prevEntry as Record<string, number>)
        : {};

    const sources = SOURCES.map((source) => {
      const filePath = path.join(DATA_DIR, `${source}_${comp.slug}.json`);
      const data = readJson<unknown[]>(filePath);
      const mtime = fs.existsSync(filePath) ? fs.statSync(filePath).mtime.toISOString() : undefined;
      return { source, count: data?.length ?? 0, hasAnalysis: false, scrapedAt: mtime };
    });

    const analysisPath = path.join(DATA_DIR, `analysis_${comp.slug}.json`);
    const analyses = readJson<Array<Record<string, unknown>>>(analysisPath) ?? [];
    const hasAnalysis = analyses.length > 0;
    const hasGap = fs.existsSync(path.join(DATA_DIR, `gap_${comp.slug}.md`));
    const totalReviews = sources.reduce((s, src) => s + src.count, 0);

    const newBySource: Record<string, number> = {};
    for (const src of sources) {
      const delta = src.count - (prevBySource[src.source] ?? 0);
      if (delta > 0) newBySource[src.source] = delta;
    }
    const newReviews = Object.values(newBySource).reduce((s, v) => s + v, 0);

    const latestMtime = sources.map((s) => s.scrapedAt).filter(Boolean).sort().at(-1);
    const isStale = latestMtime ? (now - new Date(latestMtime).getTime()) > STALE_MS : false;

    const snapshots = history[comp.slug] ?? [];
    const trend = computeTrend(snapshots);
    return {
      name: comp.name, slug: comp.slug, totalReviews, sources, hasAnalysis, hasGap,
      sentimentSummary: hasAnalysis ? getSentimentSummary(analyses) : undefined,
      trend, newReviews, newBySource, isStale, velocity: computeVelocity(comp.slug),
      healthScore: computeHealthScore(hasAnalysis ? getSentimentSummary(analyses) : undefined, computeTrend(snapshots), totalReviews),
      hasNote: !!((readJson<NotesStore>(NOTES_FILE) ?? {})[comp.slug]?.text?.trim()),
    };
  });
  const lastUpdated = competitors.flatMap((c) => c.sources.map((s) => s.scrapedAt)).filter(Boolean).sort().at(-1);
  res.json({ competitors, lastUpdated });
});

router.get("/intel/:slug/history", (req, res) => {
  const { slug } = req.params;
  const history = readJson<Record<string, SentimentSnapshot[]>>(HISTORY_FILE) ?? {};
  const snapshots = history[slug] ?? [];
  res.json({ slug, snapshots });
});

router.get("/intel/:slug/notes", (req, res) => {
  const { slug } = req.params;
  const notes = readJson<NotesStore>(NOTES_FILE) ?? {};
  res.json(notes[slug] ?? { text: "", updatedAt: null });
});

router.put("/intel/:slug/notes", (req, res) => {
  const { slug } = req.params;
  const { text } = req.body as { text?: string };
  const notes = readJson<NotesStore>(NOTES_FILE) ?? {};
  notes[slug] = { text: String(text ?? "").slice(0, 4000), updatedAt: new Date().toISOString() };
  ensureDataDir();
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  res.json({ ok: true, updatedAt: notes[slug].updatedAt });
});

// ─── threshold endpoints ──────────────────────────────────────────────────────

router.get("/intel/thresholds", (_req, res) => {
  res.json(loadThresholds());
});

router.put("/intel/thresholds", (req, res) => {
  const updates = req.body as Partial<ThresholdsStore>;
  const updated = { ...loadThresholds() };
  for (const [slug, val] of Object.entries(updates)) {
    if (typeof val === "number") updated[slug] = Math.max(0, Math.min(100, Math.round(val)));
  }
  saveThresholds(updated);
  res.json(updated);
});

// ─── digest endpoint ──────────────────────────────────────────────────────────

router.get("/intel/digest", (_req, res) => {
  const history = readJson<Record<string, SentimentSnapshot[]>>(HISTORY_FILE) ?? {};
  const prevRaw = readJson<Record<string, Record<string, number> | number>>(PREV_COUNTS_FILE) ?? {};

  const items = COMPETITORS.map((comp) => {
    const sources = SOURCES.map((source) => {
      const fp = path.join(DATA_DIR, `${source}_${comp.slug}.json`);
      return { source, count: readJson<unknown[]>(fp)?.length ?? 0 };
    });
    const totalReviews = sources.reduce((s, src) => s + src.count, 0);

    const prevEntry = prevRaw[comp.slug];
    const prevBySource: Record<string, number> =
      prevEntry && typeof prevEntry === "object" ? (prevEntry as Record<string, number>) : {};
    const newBySource: Record<string, number> = {};
    for (const src of sources) {
      const delta = src.count - (prevBySource[src.source] ?? 0);
      if (delta > 0) newBySource[src.source] = delta;
    }
    const newReviews = Object.values(newBySource).reduce((s, v) => s + v, 0);

    const analyses = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, `analysis_${comp.slug}.json`)) ?? [];
    const sentSummary = getSentimentSummary(analyses);
    const snapshots = history[comp.slug] ?? [];
    const trend = computeTrend(snapshots);
    const healthScore = computeHealthScore(analyses.length > 0 ? sentSummary : undefined, trend, totalReviews);

    let healthDelta: number | null = null;
    if (snapshots.length >= 2 && analyses.length > 0) {
      const prev = snapshots[snapshots.length - 2];
      const prevSent = { positive: prev.positive, negative: prev.negative, neutral: prev.neutral, mixed: prev.mixed ?? 0, avgIntensity: prev.avgIntensity };
      const prevTotal = prev.positive + prev.negative + prev.neutral + (prev.mixed ?? 0);
      const prevHealth = computeHealthScore(prevTotal > 0 ? prevSent : undefined, null, Math.max(1, totalReviews - newReviews));
      healthDelta = healthScore - prevHealth;
    }

    // Most recent reviews — take top N by date (N = new count, capped at 5)
    const recentReviews: Array<Record<string, unknown>> = [];
    if (newReviews > 0) {
      const all: Array<Record<string, unknown>> = [];
      for (const source of SOURCES) {
        const data = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, `${source}_${comp.slug}.json`)) ?? [];
        all.push(...data.map((r) => ({ ...r, _source: source })));
      }
      all.sort((a, b) => {
        const da = new Date(String(a.date ?? a.reviewDate ?? a.createdAt ?? a.review_date ?? "")).getTime() || 0;
        const db = new Date(String(b.date ?? b.reviewDate ?? b.createdAt ?? b.review_date ?? "")).getTime() || 0;
        return db - da;
      });
      recentReviews.push(...all.slice(0, Math.min(newReviews, 5)));
    }

    return { slug: comp.slug, name: comp.name, newReviews, newBySource, healthScore, healthDelta, trend, recentReviews };
  });

  res.json({ items });
});

router.get("/intel/compare/wishes", (_req, res) => {
  const THEME_LABELS: Record<string, string> = {
    feature_request: "Feature Request", bug: "Bug / Reliability", pricing: "Pricing",
    support: "Support", ux: "UX / Usability", ai_bias: "AI Bias",
    candidate_experience: "Candidate Experience", accuracy: "Accuracy",
    integration: "Integrations", transparency: "Transparency",
    fairness: "Fairness", speed: "Speed", trust: "Trust", general: "General",
  };

  // { theme → { total, byCompetitor: { slug → count }, quotes: string[] } }
  const themeMap = new Map<string, {
    total: number;
    byCompetitor: Record<string, number>;
    quotes: string[];
  }>();

  for (const comp of COMPETITORS) {
    const analyses = readJson<Array<Record<string, unknown>>>(
      path.join(DATA_DIR, `analysis_${comp.slug}.json`)
    ) ?? [];
    for (const a of analyses) {
      if (!a.wish || !String(a.wish).trim()) continue;
      const themes = (a.themes as string[] | undefined) ?? [];
      const key = themes[0] ?? "general";
      if (!themeMap.has(key)) themeMap.set(key, { total: 0, byCompetitor: {}, quotes: [] });
      const bucket = themeMap.get(key)!;
      bucket.total++;
      bucket.byCompetitor[comp.slug] = (bucket.byCompetitor[comp.slug] ?? 0) + 1;
      const q = String(a.wish).trim();
      if (q && bucket.quotes.length < 4 && !bucket.quotes.includes(q)) bucket.quotes.push(q);
    }
  }

  const groups = Array.from(themeMap.entries())
    .map(([theme, { total, byCompetitor, quotes }]) => ({
      theme,
      label: THEME_LABELS[theme] ?? theme,
      total,
      breadth: Object.keys(byCompetitor).length,
      byCompetitor,
      quotes,
    }))
    // rank: breadth first (universality), then total volume
    .sort((a, b) => b.breadth - a.breadth || b.total - a.total);

  res.json({ groups });
});

router.get("/intel/:slug/wishes", (req, res) => {
  const { slug } = req.params;
  const analyses = readJson<Array<Record<string, unknown>>>(
    path.join(DATA_DIR, `analysis_${slug}.json`)
  ) ?? [];

  // collect items that have a wish
  const withWish = analyses.filter((a) => a.wish && String(a.wish).trim());
  const total = analyses.length;

  // group by primary theme (first theme tag, or "general")
  const groupMap = new Map<string, { count: number; quotes: string[] }>();
  for (const a of withWish) {
    const themes = (a.themes as string[] | undefined) ?? [];
    const key = themes[0] ?? "general";
    if (!groupMap.has(key)) groupMap.set(key, { count: 0, quotes: [] });
    const bucket = groupMap.get(key)!;
    bucket.count++;
    const q = String(a.wish).trim();
    if (q && bucket.quotes.length < 5 && !bucket.quotes.includes(q)) bucket.quotes.push(q);
  }

  const THEME_LABELS: Record<string, string> = {
    feature_request: "Feature Request", bug: "Bug / Reliability", pricing: "Pricing",
    support: "Support", ux: "UX / Usability", ai_bias: "AI Bias",
    candidate_experience: "Candidate Experience", accuracy: "Accuracy",
    integration: "Integrations", transparency: "Transparency",
    fairness: "Fairness", speed: "Speed", trust: "Trust", general: "General",
  };

  const groups = Array.from(groupMap.entries())
    .map(([theme, { count, quotes }]) => ({
      theme, label: THEME_LABELS[theme] ?? theme, count, quotes,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({ slug, groups, total, withWish: withWish.length });
});

router.get("/intel/:slug/reviews", (req, res) => {
  const { slug } = req.params;
  const sourceFilter = req.query.source as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const search = (req.query.search as string | undefined)?.toLowerCase() ?? "";
  const minRating = parseFloat(req.query.minRating as string) || 0;
  const maxRating = parseFloat(req.query.maxRating as string) || 5;
  const srcList = sourceFilter ? [sourceFilter] : SOURCES;
  let reviews: Array<Record<string, unknown>> = [];
  const sourceCounts: Record<string, number> = {};
  for (const source of srcList) {
    const data = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, `${source}_${slug}.json`)) ?? [];
    sourceCounts[source] = data.length;
    reviews = reviews.concat(data);
  }
  // apply search filter
  if (search) {
    reviews = reviews.filter((r) => {
      const text = [r.title, r.text, r.pros, r.cons, r.reviewer_role, r.body].join(" ").toLowerCase();
      return text.includes(search);
    });
  }
  // apply rating filter
  if (minRating > 0 || maxRating < 5) {
    reviews = reviews.filter((r) => {
      const rating = parseFloat(String(r.rating ?? r.overall_rating ?? 0));
      return !isNaN(rating) && rating >= minRating && rating <= maxRating;
    });
  }
  const total = reviews.length;
  res.json({ reviews: reviews.slice(offset, offset + limit), total, offset, limit, sources: sourceCounts });
});

router.get("/intel/:slug/reviews/export", (req, res) => {
  const { slug } = req.params;
  const sourceFilter = req.query.source as string | undefined;
  const search = (req.query.search as string | undefined)?.toLowerCase() ?? "";
  const minRating = parseFloat(req.query.minRating as string) || 0;
  const maxRating = parseFloat(req.query.maxRating as string) || 5;
  const srcList = sourceFilter ? [sourceFilter] : SOURCES;
  let reviews: Array<Record<string, unknown>> = [];
  for (const source of srcList) {
    const data = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, `${source}_${slug}.json`)) ?? [];
    reviews = reviews.concat(data);
  }
  // apply search filter
  if (search) {
    reviews = reviews.filter((r) => {
      const text = [r.title, r.text, r.pros, r.cons, r.reviewer_role, r.body].join(" ").toLowerCase();
      return text.includes(search);
    });
  }
  // apply rating filter
  if (minRating > 0 || maxRating < 5) {
    reviews = reviews.filter((r) => {
      const rating = parseFloat(String(r.rating ?? r.overall_rating ?? 0));
      return !isNaN(rating) && rating >= minRating && rating <= maxRating;
    });
  }

  // convert to CSV
  const headers = ["source", "title", "text", "rating", "date", "reviewer_role", "company_size", "pros", "cons", "sentiment", "themes"];
  const escapeCSV = (val: unknown) => {
    const str = String(val ?? "").replace(/"/g, '""');
    return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
  };
  const rows = reviews.map((r) => [
    escapeCSV(r.source),
    escapeCSV(r.title),
    escapeCSV(r.text ?? r.body),
    escapeCSV(r.rating ?? r.overall_rating),
    escapeCSV(r.date ?? r.posted_date),
    escapeCSV(r.reviewer_role),
    escapeCSV(r.company_size),
    escapeCSV(r.pros),
    escapeCSV(r.cons),
    escapeCSV(r.sentiment),
    escapeCSV((r.themes as string[])?.join("; ") ?? ""),
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}_reviews_${new Date().toISOString().split("T")[0]}.csv"`);
  res.send(csv);
});

router.get("/intel/:slug/analysis", (req, res) => {
  const { slug } = req.params;
  const analyses = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, `analysis_${slug}.json`)) ?? [];
  const themeCount: Record<string, number> = {};
  for (const a of analyses) {
    for (const t of (a.themes as string[]) ?? []) themeCount[t] = (themeCount[t] ?? 0) + 1;
  }
  const topThemes = Object.entries(themeCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  res.json({ analyses, total: analyses.length, sentiment: getSentimentSummary(analyses), topThemes });
});

router.get("/intel/:slug/themes", (req, res) => {
  const { slug } = req.params;
  res.json(readJson(path.join(DATA_DIR, `themes_${slug}.json`)) ?? { clusters: [] });
});

router.get("/intel/:slug/gap", (req, res) => {
  const { slug } = req.params;
  const comp = COMPETITORS.find((c) => c.slug === slug);
  const gapPath = path.join(DATA_DIR, `gap_${slug}.md`);
  const markdown = fs.existsSync(gapPath) ? fs.readFileSync(gapPath, "utf-8") : "";
  res.json({ markdown, competitor: comp?.name ?? slug });
});

router.get("/intel/features", (req, res) => {
  const rows = readJson<Array<Record<string, unknown>>>(path.join(DATA_DIR, "feature_priority.json")) ?? [];
  res.json({ rows, total: rows.length });
});

export default router;
