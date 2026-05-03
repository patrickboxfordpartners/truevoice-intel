import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  AreaChart, Area, CartesianGrid,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Database, ChevronRight,
  RefreshCw, Play, Terminal, ChevronDown, ChevronUp, Clock, X, Bell,
  Send, ToggleLeft, ToggleRight, Search, Star, MessageSquare, Download,
  LayoutGrid, LayoutList, FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const API = "/api/intel";

const SOURCE_COLORS: Record<string, string> = {
  g2: "#ff492c",
  capterra: "#55c0a2",
  reddit: "#ff4500",
  twitter: "#1d9bf0",
  producthunt: "#da552f",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#34d399",
  negative: "#f87171",
  neutral: "#94a3b8",
  mixed: "#fbbf24",
};

const COMPETITOR_COLORS = ["#3b82f6", "#a78bfa", "#34d399", "#fb923c", "#f472b6"];

// ─── hooks ───────────────────────────────────────────────────────────────────

function useCompetitors() {
  return useQuery({
    queryKey: ["intel", "competitors"],
    queryFn: () => fetch(`${API}/competitors`).then((r) => r.json()),
    refetchInterval: 30000,
  });
}

function useAnalysis(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["intel", slug, "analysis"],
    queryFn: () => fetch(`${API}/${slug}/analysis`).then((r) => r.json()),
    enabled,
  });
}

function useThemes(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["intel", slug, "themes"],
    queryFn: () => fetch(`${API}/${slug}/themes`).then((r) => r.json()),
    enabled,
  });
}

function useGap(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["intel", slug, "gap"],
    queryFn: () => fetch(`${API}/${slug}/gap`).then((r) => r.json()),
    enabled,
  });
}

function useHistory(slug: string) {
  return useQuery({
    queryKey: ["intel", slug, "history"],
    queryFn: () => fetch(`${API}/${slug}/history`).then((r) => r.json()),
    staleTime: 30_000,
  });
}

function useWishes(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["intel", slug, "wishes"],
    queryFn: () => fetch(`${API}/${slug}/wishes`).then((r) => r.json()),
    enabled,
  });
}

function useNotes(slug: string) {
  const qc = useQueryClient();
  const query = useQuery<{ text: string; updatedAt: string | null }>({
    queryKey: ["intel", slug, "notes"],
    queryFn: () => fetch(`${API}/${slug}/notes`).then(r => r.json()),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (text: string) =>
      fetch(`${API}/${slug}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel", slug, "notes"] });
      qc.invalidateQueries({ queryKey: ["intel", "competitors"] });
    },
  });
  return { query, mutation };
}

function useThresholds() {
  const qc = useQueryClient();
  const query = useQuery<Record<string, number>>({
    queryKey: ["intel", "thresholds"],
    queryFn: () => fetch(`${API}/thresholds`).then((r) => r.json()),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (updates: Record<string, number>) =>
      fetch(`${API}/thresholds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel", "thresholds"] }),
  });
  return { query, mutation };
}

type DigestItem = {
  slug: string; name: string;
  newReviews: number; newBySource: Record<string, number>;
  healthScore: number; healthDelta: number | null;
  trend: { direction: "up" | "down" | "flat"; positiveDelta: number; negativeDelta: number } | null;
  recentReviews: Array<Record<string, unknown>>;
};

function useDigest(enabled: boolean) {
  return useQuery<{ items: DigestItem[] }>({
    queryKey: ["intel", "digest"],
    queryFn: () => fetch(`${API}/digest`).then((r) => r.json()),
    enabled,
    staleTime: 30_000,
  });
}

function useCrossWishes() {
  return useQuery({
    queryKey: ["intel", "compare", "wishes"],
    queryFn: () => fetch(`${API}/compare/wishes`).then((r) => r.json()),
    staleTime: 60_000,
  });
}

function useFeatures() {
  return useQuery({
    queryKey: ["intel", "features"],
    queryFn: () => fetch(`${API}/features`).then((r) => r.json()),
  });
}

function useJobStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["intel", "run", "status"],
    queryFn: () => fetch(`${API}/run/status`).then((r) => r.json()),
    refetchInterval: enabled ? 1500 : false,
    enabled,
  });
}

function useSchedule() {
  return useQuery({
    queryKey: ["intel", "schedule"],
    queryFn: () => fetch(`${API}/schedule`).then((r) => r.json()),
    refetchInterval: 60000,
  });
}

function useNotifications() {
  return useQuery({
    queryKey: ["intel", "notifications"],
    queryFn: () => fetch(`${API}/notifications`).then((r) => r.json()),
  });
}

// ─── scraper run panel ───────────────────────────────────────────────────────

function ScraperPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const status = useJobStatus(true);
  const running: boolean = status.data?.running ?? false;
  const lines: string[] = status.data?.lines ?? [];
  const exitCode: number | null = status.data?.exitCode ?? null;
  const startedAt: string | null = status.data?.startedAt ?? null;
  const finishedAt: string | null = status.data?.finishedAt ?? null;

  const run = useMutation({
    mutationFn: () =>
      fetch(`${API}/run`, { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      }),
    onSuccess: () => {
      setOpen(true);
      status.refetch();
    },
  });

  // auto-open log when running starts
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  // auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current && open) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, open]);

  // refresh intel data when scraper finishes successfully
  useEffect(() => {
    if (!running && exitCode === 0) {
      qc.invalidateQueries({ queryKey: ["intel", "competitors"] });
      qc.invalidateQueries({ queryKey: ["intel", "features"] });
    }
  }, [running, exitCode, qc]);

  const hasRun = startedAt !== null;
  const succeeded = !running && exitCode === 0;
  const failed = !running && exitCode !== null && exitCode !== 0;

  return (
    <div className="flex items-center gap-2">
      {/* status badge shown when there's a result */}
      {hasRun && !running && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-md border transition-colors"
          style={
            succeeded
              ? { borderColor: "#34d39944", background: "#34d39910", color: "#34d399" }
              : failed
              ? { borderColor: "#f8717144", background: "#f8717110", color: "#f87171" }
              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
          }
        >
          {succeeded ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
          {succeeded ? "done" : `exit ${exitCode}`}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}

      {/* run / stop button */}
      <button
        onClick={() => {
          if (!running) run.mutate();
        }}
        disabled={running || run.isPending}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={
          running
            ? { background: "#f8717118", color: "#f87171", border: "1px solid #f8717140" }
            : { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
        }
      >
        {running ? (
          <>
            <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            Running…
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" />
            Run Scraper
          </>
        )}
      </button>

      {/* collapsible log drawer — rendered below header via portal trick avoided; use absolute */}
      {open && hasRun && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card shadow-xl"
          style={{ maxHeight: "40vh", display: "flex", flexDirection: "column" }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-3">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-mono font-medium">
                Scraper log
                {running && <span className="ml-2 text-amber-400 animate-pulse">● running</span>}
                {succeeded && <span className="ml-2 text-emerald-400">✓ completed</span>}
                {failed && <span className="ml-2 text-red-400">✗ exit {exitCode}</span>}
              </span>
              {startedAt && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  started {formatDistanceToNow(new Date(startedAt), { addSuffix: true })}
                  {finishedAt && ` · finished ${formatDistanceToNow(new Date(finishedAt), { addSuffix: true })}`}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-xs font-mono px-2 py-1 rounded hover:bg-muted"
            >
              close
            </button>
          </div>
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-5 text-muted-foreground space-y-0.5"
            style={{ background: "hsl(var(--background))" }}
          >
            {lines.length === 0 ? (
              <span className="text-muted-foreground/50">Waiting for output…</span>
            ) : (
              lines.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("[stderr]") || line.includes("error") || line.includes("Error")
                      ? "text-red-400/80"
                      : line.startsWith("[stdout]")
                      ? "text-foreground/80"
                      : "text-muted-foreground"
                  }
                >
                  {line}
                </div>
              ))
            )}
            {running && (
              <div className="flex items-center gap-1.5 text-amber-400/70 mt-1">
                <span className="animate-pulse">▌</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── notification button ──────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="transition-colors">
      {checked
        ? <ToggleRight className="h-5 w-5 text-blue-400" />
        : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
    </button>
  );
}

function NotificationButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testError, setTestError] = useState<string>("");

  const { data: notif } = useNotifications();
  const { query: threshQuery, mutation: threshMutation } = useThresholds();

  const [email, setEmail] = useState("");
  const [fromEmail, setFromEmail] = useState("hello@truevoicehq.com");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [onSuccess, setOnSuccess] = useState(true);
  const [onFailure, setOnFailure] = useState(true);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open && notif) {
      setEmail(notif.email ?? "");
      setFromEmail(notif.fromEmail ?? "hello@truevoicehq.com");
      setSlackWebhook(notif.slackWebhook ?? "");
      setOnSuccess(notif.notifyOnSuccess ?? true);
      setOnFailure(notif.notifyOnFailure ?? true);
      setTestState("idle");
    }
  }, [open, notif]);

  useEffect(() => {
    if (open && threshQuery.data) setThresholds(threshQuery.data);
  }, [open, threshQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      fetch(`${API}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fromEmail, slackWebhook, notifyOnSuccess: onSuccess, notifyOnFailure: onFailure }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel", "notifications"] });
      setOpen(false);
    },
  });

  const sendTest = async () => {
    setTestState("sending");
    setTestError("");
    try {
      const res = await fetch(`${API}/notifications/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTestState("error");
        setTestError(data.error ? JSON.stringify(data.error) : "Unknown error");
      } else {
        setTestState("sent");
        setTimeout(() => setTestState("idle"), 3000);
      }
    } catch (e) {
      setTestState("error");
      setTestError(String(e));
    }
  };

  const isConfigured = notif?.email && notif.email.length > 0;
  const hasKey: boolean = notif?.hasPostmarkToken ?? false;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Configure email notifications"
        className="flex items-center gap-1.5 p-2 rounded-md border transition-colors"
        style={
          isConfigured && hasKey
            ? { borderColor: "#a78bfa44", background: "#a78bfa10", color: "#a78bfa" }
            : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
        }
      >
        <Bell className="h-4 w-4" />
        {isConfigured && hasKey && (
          <span className="text-[10px] font-mono hidden sm:inline">on</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-card shadow-xl">
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Email Notifications</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* API key status */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-mono"
              style={hasKey
                ? { borderColor: "#34d39933", background: "#34d39908", color: "#34d399" }
                : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
              }
            >
              <span className={`h-1.5 w-1.5 rounded-full ${hasKey ? "bg-emerald-400" : "bg-muted-foreground"}`} />
              {hasKey ? "POSTMARK_API_TOKEN configured" : "POSTMARK_API_TOKEN not set — add it to Secrets"}
            </div>

            {/* from address */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                From address
              </label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="hello@yourdomain.com"
                className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground">Must be a verified sender in Postmark</p>
            </div>

            {/* recipient email */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Recipient email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* slack webhook */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Slack Webhook URL (optional)
              </label>
              <input
                type="url"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground">Health score alerts will be posted to this channel</p>
            </div>

            {/* toggles */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Notify when
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/20 border border-border/40">
                  <div>
                    <p className="text-sm font-medium">Scraper succeeds</p>
                    <p className="text-[10px] text-muted-foreground">Exit code 0</p>
                  </div>
                  <Toggle checked={onSuccess} onChange={setOnSuccess} />
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/20 border border-border/40">
                  <div>
                    <p className="text-sm font-medium">Scraper fails</p>
                    <p className="text-[10px] text-muted-foreground">Non-zero exit code</p>
                  </div>
                  <Toggle checked={onFailure} onChange={setOnFailure} />
                </div>
              </div>
            </div>

            {/* health score alert thresholds */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Health Score Alerts
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Alert when score drops to or below threshold (0 = off)
                </p>
              </div>
              <div className="space-y-1">
                {[
                  { slug: "hirevue",         name: "HireVue" },
                  { slug: "sparkhire",       name: "SparkHire" },
                  { slug: "brighthire",      name: "BrightHire" },
                  { slug: "interviewing-io", name: "Interviewing.io" },
                  { slug: "metaview",        name: "Metaview" },
                ].map(({ slug, name }, i) => (
                  <div key={slug} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/20 border border-border/40">
                    <span className="h-2 w-2 rounded-full flex-none" style={{ background: COMPETITOR_COLORS[i] }} />
                    <span className="text-xs flex-1 truncate">{name}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={thresholds[slug] ?? 0}
                      onChange={(e) => setThresholds((prev) => ({ ...prev, [slug]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                      className="w-14 text-xs text-right rounded border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-[10px] text-muted-foreground font-mono w-4">/100</span>
                  </div>
                ))}
              </div>
            </div>

            {/* test send */}
            {notif?.email && hasKey && (
              <div className="space-y-1.5">
                <button
                  onClick={sendTest}
                  disabled={testState === "sending"}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {testState === "sending" ? "Sending…" : testState === "sent" ? "✓ Sent!" : "Send test email"}
                </button>
                {testState === "error" && (
                  <p className="text-[10px] text-red-400 font-mono break-all">{testError}</p>
                )}
              </div>
            )}

            {/* save */}
            <button
              onClick={() => { save.mutate(); threshMutation.mutate(thresholds); }}
              disabled={save.isPending || threshMutation.isPending || !email}
              className="w-full text-sm font-medium px-3 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              {save.isPending || threshMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── schedule button ──────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const ampm = i < 12 ? "AM" : "PM";
  const h = i % 12 === 0 ? 12 : i % 12;
  return { value: i, label: `${h}:00 ${ampm}` };
});

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function ScheduleButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: sched } = useSchedule();

  const [freq, setFreq] = useState<"disabled" | "daily" | "weekly">("disabled");
  const [hour, setHour] = useState(8);
  const [dow, setDow] = useState(1);

  // sync local state when panel opens
  useEffect(() => {
    if (open && sched) {
      setFreq(sched.frequency ?? "disabled");
      setHour(sched.hour ?? 8);
      setDow(sched.dayOfWeek ?? 1);
    }
  }, [open, sched]);

  const save = useMutation({
    mutationFn: () =>
      fetch(`${API}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: freq, hour, dayOfWeek: dow }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel", "schedule"] });
      setOpen(false);
    },
  });

  const disable = useMutation({
    mutationFn: () => fetch(`${API}/schedule`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel", "schedule"] });
      setOpen(false);
    },
  });

  const isActive = sched?.frequency !== "disabled" && sched?.frequency != null;
  const nextRun: string | null = sched?.nextRun ?? null;
  const lastTriggered: string | null = sched?.lastTriggered ?? null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Configure auto-run schedule"
        className="flex items-center gap-1.5 p-2 rounded-md border transition-colors"
        style={
          isActive
            ? { borderColor: "#3b82f644", background: "#3b82f610", color: "#3b82f6" }
            : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
        }
      >
        <Clock className="h-4 w-4" />
        {isActive && (
          <span className="text-[10px] font-mono hidden sm:inline">
            {sched?.frequency} · {HOURS[sched?.hour ?? 8]?.label}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Auto-run Schedule</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* frequency */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Frequency</label>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(["disabled", "daily", "weekly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFreq(f)}
                    className="flex-1 py-1.5 text-xs font-medium capitalize transition-colors"
                    style={
                      freq === f
                        ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                        : { color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* hour */}
            {freq !== "disabled" && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Time</label>
                <select
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 text-foreground"
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* day of week (weekly only) */}
            {freq === "weekly" && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Day</label>
                <select
                  value={dow}
                  onChange={(e) => setDow(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 text-foreground"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* next run / last triggered info */}
            {isActive && nextRun && (
              <div className="rounded-md bg-muted/30 border border-border/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Next run</span>
                  <span className="text-foreground font-mono">
                    {formatDistanceToNow(new Date(nextRun), { addSuffix: true })}
                  </span>
                </div>
                {lastTriggered && (
                  <div className="flex justify-between">
                    <span>Last triggered</span>
                    <span className="font-mono">
                      {formatDistanceToNow(new Date(lastTriggered), { addSuffix: true })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* actions */}
            <div className="flex gap-2 pt-1">
              {isActive && (
                <button
                  onClick={() => disable.mutate()}
                  disabled={disable.isPending}
                  className="flex-none text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50"
                >
                  Disable
                </button>
              )}
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending || freq === "disabled"}
                className="flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              >
                {save.isPending ? "Saving…" : freq === "disabled" ? "Select a frequency" : "Save Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── small helpers ────────────────────────────────────────────────────────────

interface SentimentBadgeProps { sentiment: string }
function SentimentBadge({ sentiment }: SentimentBadgeProps) {
  const colors: Record<string, string> = {
    positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    negative: "bg-red-500/15 text-red-400 border-red-500/30",
    neutral: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    mixed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${colors[sentiment] ?? colors.neutral}`}>
      {sentiment}
    </span>
  );
}

interface SourceBarProps { sources: Array<{ source: string; count: number }> }
function SourceBar({ sources }: SourceBarProps) {
  return (
    <div className="flex gap-1 flex-wrap">
      {sources.filter(s => s.count > 0).map(s => (
        <span
          key={s.source}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: `${SOURCE_COLORS[s.source]}22`, color: SOURCE_COLORS[s.source], border: `1px solid ${SOURCE_COLORS[s.source]}44` }}
        >
          {s.source} {s.count}
        </span>
      ))}
    </div>
  );
}

// ─── trend badge ──────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: TrendData }) {
  const { direction, positiveDelta, negativeDelta, comparedAt } = trend;

  const cfg = {
    up:   { Icon: TrendingUp,   bg: "#05966918", border: "#05966944", color: "#34d399" },
    down: { Icon: TrendingDown, bg: "#dc262618", border: "#dc262644", color: "#f87171" },
    flat: { Icon: Minus,        bg: "#ffffff0a", border: "#ffffff18", color: "#94a3b8" },
  }[direction];

  const label = direction === "up"
    ? `+${positiveDelta.toFixed(1)}% pos`
    : direction === "down"
    ? `+${Math.abs(negativeDelta).toFixed(1)}% neg`
    : "stable";

  const since = (() => {
    try { return formatDistanceToNow(new Date(comparedAt), { addSuffix: true }); }
    catch { return "prev run"; }
  })();

  return (
    <div
      title={`vs. ${since}: ${label}`}
      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-default"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      <cfg.Icon className="h-2.5 w-2.5 flex-none" />
      <span>{label}</span>
    </div>
  );
}

// ─── competitor card ──────────────────────────────────────────────────────────

interface TrendData {
  direction: "up" | "down" | "flat";
  positiveDelta: number;
  negativeDelta: number;
  intensityDelta: number;
  comparedAt: string;
}

interface CompetitorCardProps {
  competitor: {
    name: string; slug: string; totalReviews: number;
    sources: Array<{ source: string; count: number; scrapedAt?: string }>;
    hasAnalysis: boolean; hasGap: boolean;
    sentimentSummary?: { positive: number; negative: number; neutral: number; mixed: number; avgIntensity: number };
    trend?: TrendData | null;
    newReviews?: number;
    newBySource?: Record<string, number>;
    isStale?: boolean;
    velocity?: number[];
    healthScore?: number;
    hasNote?: boolean;
  };
  color: string;
  onClick: () => void;
  selected: boolean;
}

function HealthBadge({ score }: { score: number }) {
  const size = 38, r = 14, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const color = score >= 70 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
  const ringBg = score >= 70 ? "#14532d40" : score >= 40 ? "#78350f40" : "#450a0a40";
  return (
    <div title={`Health score: ${score}/100`} style={{ flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={ringBg} />
        <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke="#1e293b" strokeWidth="3.5" />
        <circle
          cx={cx} cy={cy} r={r - 2}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeDasharray={`${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text
          x={cx} y={cy + 3.5}
          textAnchor="middle"
          fontSize="9"
          fontFamily="monospace"
          fontWeight="700"
          fill={color}
        >
          {score}
        </text>
      </svg>
    </div>
  );
}

function VelocitySparkline({ data, color, slug }: { data: number[]; color: string; slug: string }) {
  const W = 200, H = 34, pad = 2;
  const max = Math.max(...data, 1);
  const n = data.length;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ pxX: number; dayIdx: number } | null>(null);

  if (n < 2) return null;

  const stepX = (W - pad * 2) / (n - 1);
  const pts: [number, number][] = data.map((v, i) => [
    pad + i * stepX,
    H - pad - (v / max) * (H - pad * 2),
  ]);
  const linePath = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${pts[n - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const gradId = `vg-${slug}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = (e.clientX - rect.left) / rect.width;
    const dayIdx = Math.min(n - 1, Math.max(0, Math.round(relX * (n - 1))));
    const pxX = (dayIdx / (n - 1)) * rect.width;
    setTip({ pxX, dayIdx });
  };

  const getDateLabel = (dayIdx: number) => {
    const daysAgo = n - 1 - dayIdx;
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div style={{ position: "relative" }}>
      {tip && (
        <div
          style={{
            position: "absolute",
            bottom: H + 3,
            left: tip.pxX,
            transform: "translateX(-50%)",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 4,
            padding: "2px 7px",
            fontSize: 10,
            fontFamily: "monospace",
            color: "#e2e8f0",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          <span style={{ color, fontWeight: 700 }}>{data[tip.dayIdx]}</span>
          <span style={{ color: "#64748b" }}> · {getDateLabel(tip.dayIdx)}</span>
        </div>
      )}
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {tip && (
          <>
            <line
              x1={pts[tip.dayIdx][0].toFixed(1)}
              y1={pad}
              x2={pts[tip.dayIdx][0].toFixed(1)}
              y2={H - pad}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="2 2"
              strokeOpacity="0.7"
            />
            <circle
              cx={pts[tip.dayIdx][0].toFixed(1)}
              cy={pts[tip.dayIdx][1].toFixed(1)}
              r="2.5"
              fill={color}
              strokeWidth="1.5"
              stroke="#0f172a"
            />
          </>
        )}
      </svg>
    </div>
  );
}

function CompetitorCard({ competitor, color, onClick, selected }: CompetitorCardProps) {
  const s = competitor.sentimentSummary;
  const total = s ? (s.positive + s.negative + s.neutral + s.mixed) : 0;

  const latestScrape = competitor.sources
    .map(src => src.scrapedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer transition-all shadow-none"
      style={selected
        ? { borderColor: color, background: `${color}08` }
        : { borderColor: "hsl(var(--border)/0.5)", background: "hsl(var(--card)/0.5)" }
      }
    >
      <CardHeader className="pb-2" style={{ background: selected ? `${color}0a` : "hsl(var(--muted)/0.2)" }}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {competitor.name}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {competitor.hasAnalysis && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            {(competitor.newReviews ?? 0) > 0 && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "#14532d", color: "#4ade80", border: "1px solid #166534" }}
                title={`${competitor.newReviews} new data points since last scraper run`}
              >
                +{competitor.newReviews} new
              </span>
            )}
            {competitor.hasNote && (
              <span title="Analyst notes exist for this competitor">
                <FileText className="h-3.5 w-3.5" style={{ color: "#60a5fa" }} />
              </span>
            )}
            {competitor.isStale && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "#451a03", color: "#fb923c", border: "1px solid #7c2d12" }}
                title="No scrape in the last 7 days — data may be outdated"
              >
                stale
              </span>
            )}
            {competitor.trend && <TrendBadge trend={competitor.trend} />}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" style={selected ? { transform: "rotate(90deg)" } : {}} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold">{competitor.totalReviews.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">data points</span>
          </div>
          {competitor.hasAnalysis && competitor.healthScore !== undefined && (
            <HealthBadge score={competitor.healthScore} />
          )}
        </div>

        <SourceBar sources={competitor.sources} />

        {competitor.newBySource && Object.keys(competitor.newBySource).length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {Object.entries(competitor.newBySource)
              .sort(([, a], [, b]) => b - a)
              .map(([src, delta]) => (
                <span key={src} className="text-[10px] font-mono" style={{ color: SOURCE_COLORS[src] ?? "#94a3b8" }}>
                  {src} +{delta}
                </span>
              ))}
          </div>
        )}

        {competitor.velocity && competitor.velocity.some(v => v > 0) && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-mono">30-day velocity</span>
              <span className="text-[10px] font-mono" style={{ color }}>
                peak {Math.max(...competitor.velocity)}/day
              </span>
            </div>
            <VelocitySparkline data={competitor.velocity} color={color} slug={competitor.slug} />
          </div>
        )}

        {s && total > 0 && (
          <div className="space-y-1">
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
              {(["positive", "negative", "neutral", "mixed"] as const).map(key => {
                const pct = Math.round((s[key] / total) * 100);
                return pct > 0 ? (
                  <div key={key} style={{ width: `${pct}%`, background: SENTIMENT_COLORS[key] }} title={`${key}: ${pct}%`} />
                ) : null;
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>{Math.round((s.positive / total) * 100)}% pos</span>
              <span>{Math.round((s.negative / total) * 100)}% neg</span>
              <span>intensity {s.avgIntensity}/10</span>
            </div>
          </div>
        )}

        {!competitor.hasAnalysis && competitor.totalReviews === 0 && (
          <p className="text-xs text-muted-foreground font-mono">run scrapers to collect data</p>
        )}
        {competitor.totalReviews > 0 && !competitor.hasAnalysis && (
          <p className="text-xs text-amber-400/80 font-mono">run analyze.py to classify</p>
        )}
        {(competitor.newReviews ?? 0) > 0 && competitor.hasAnalysis && (
          <p className="text-[10px] text-amber-400/70 font-mono">
            ↺ re-analyze suggested — {competitor.newReviews} new reviews since last run
          </p>
        )}
        {latestScrape && (
          <p className="text-[10px] text-muted-foreground">
            updated {formatDistanceToNow(new Date(latestScrape), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HealthScoreChart({ slug, snapshots, color }: { slug: string; snapshots: HistorySnapshot[]; color: string }) {
  // Fetch current review count to compute health score
  const { data: compData } = useCompetitors();
  const comp = compData?.competitors?.find((c: { slug: string }) => c.slug === slug);
  const totalReviews = comp?.totalReviews ?? 0;

  const computeTrend = (snaps: HistorySnapshot[]): { direction: "up" | "down" | "flat" } | null => {
    if (snaps.length < 2) return null;
    const recent = snaps.slice(-3);
    const posRatio = recent.map((s) => {
      const t = s.positive + s.negative + s.neutral + s.mixed || 1;
      return s.positive / t;
    });
    const avg = posRatio.reduce((sum, r) => sum + r, 0) / posRatio.length;
    const first = posRatio[0];
    const last = posRatio[posRatio.length - 1];
    if (Math.abs(last - first) < 0.05) return { direction: "flat" };
    return last > first ? { direction: "up" } : { direction: "down" };
  };

  const computeHealthScore = (
    s: { positive: number; negative: number; neutral: number; mixed: number; avgIntensity: number },
    trend: { direction: "up" | "down" | "flat" } | null,
    reviews: number
  ): number => {
    const t = s.positive + s.negative + s.neutral + s.mixed || 1;
    const sentScore = Math.round((s.positive / t) * 50);
    const intensityBonus = Math.round(Math.min(s.avgIntensity, 10) / 10 * 10);
    const trendBonus = trend?.direction === "up" ? 15 : trend?.direction === "down" ? -10 : 0;
    const volumeBonus = Math.round(Math.min(reviews, 500) / 500 * 25);
    return Math.max(0, Math.min(100, sentScore + intensityBonus + trendBonus + volumeBonus));
  };

  if (snapshots.length < 2) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground font-mono">
        Run scraper twice to see health score trend
      </div>
    );
  }

  const data = snapshots.map((snap, i) => {
    const trend = computeTrend(snapshots.slice(0, i + 1));
    const score = computeHealthScore(
      { positive: snap.positive, negative: snap.negative, neutral: snap.neutral, mixed: snap.mixed, avgIntensity: snap.avgIntensity },
      trend,
      totalReviews
    );
    return {
      run: `#${i + 1}`,
      date: (() => { try { return new Date(snap.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return `Run ${i + 1}`; } })(),
      score,
    };
  });

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = latest.score - prev.score;

  return (
    <div className="space-y-3 pt-4 border-t border-border/40">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Health Score History · {data.length} runs
        </p>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
            {delta >= 0 ? "+" : ""}{delta} vs prev
          </span>
          <span className="text-lg font-bold" style={{ color: latest.score >= 70 ? "#4ade80" : latest.score >= 40 ? "#fbbf24" : "#f87171" }}>
            {latest.score}/100
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-health-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.6} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 11 }}
            formatter={(val: number) => [`${val}/100`, "Health Score"]}
            labelFormatter={(label) => `Run: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#grad-health-${color.replace("#","")})`}
            dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-mono">
        <span>Formula: sentiment 50% + intensity 10% + trend ±15% + volume 25%</span>
        <span>{totalReviews} total reviews</span>
      </div>
    </div>
  );
}

// ─── detail panel ─────────────────────────────────────────────────────────────

// ─── sentiment sparkline ──────────────────────────────────────────────────────

interface HistorySnapshot {
  timestamp: string;
  positive: number; negative: number; neutral: number; mixed: number;
  avgIntensity: number;
}

function SentimentSparkline({ snapshots, color }: { snapshots: HistorySnapshot[]; color: string }) {
  const data = snapshots.map((snap, i) => {
    const total = snap.positive + snap.negative + snap.neutral + snap.mixed || 1;
    return {
      run: `#${i + 1}`,
      date: (() => { try { return new Date(snap.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return `Run ${i + 1}`; } })(),
      positive: Math.round((snap.positive / total) * 100),
      negative: Math.round((snap.negative / total) * 100),
      neutral:  Math.round((snap.neutral  / total) * 100),
      mixed:    Math.round((snap.mixed    / total) * 100),
      intensity: snap.avgIntensity,
    };
  });

  const latest  = data[data.length - 1];
  const prev    = data[data.length - 2];
  const posDelta = prev ? latest.positive - prev.positive : 0;
  const negDelta = prev ? latest.negative - prev.negative : 0;

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    fontSize: 11,
    padding: "6px 10px",
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Sentiment History · {data.length} run{data.length !== 1 ? "s" : ""}
        </p>
        {prev && (
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className={posDelta >= 0 ? "text-emerald-400" : "text-red-400"}>
              pos {posDelta >= 0 ? "+" : ""}{posDelta}%
            </span>
            <span className={negDelta <= 0 ? "text-emerald-400" : "text-red-400"}>
              neg {negDelta >= 0 ? "+" : ""}{negDelta}%
            </span>
            <span className="text-muted-foreground/60">vs prev run</span>
          </div>
        )}
      </div>

      {/* stacked area chart */}
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-pos-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={SENTIMENT_COLORS.positive} stopOpacity={0.5} />
              <stop offset="95%" stopColor={SENTIMENT_COLORS.positive} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={`grad-neg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={SENTIMENT_COLORS.negative} stopOpacity={0.5} />
              <stop offset="95%" stopColor={SENTIMENT_COLORS.negative} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={`grad-neu-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={SENTIMENT_COLORS.neutral} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SENTIMENT_COLORS.neutral} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val: number, name: string) => [`${val}%`, name]}
            labelFormatter={(label) => `Run: ${label}`}
          />
          <Area type="monotone" dataKey="positive" name="Positive" stroke={SENTIMENT_COLORS.positive} strokeWidth={2} fill={`url(#grad-pos-${color.replace("#","")})`} dot={{ r: 3, fill: SENTIMENT_COLORS.positive }} activeDot={{ r: 4 }} />
          <Area type="monotone" dataKey="negative" name="Negative" stroke={SENTIMENT_COLORS.negative} strokeWidth={2} fill={`url(#grad-neg-${color.replace("#","")})`} dot={{ r: 3, fill: SENTIMENT_COLORS.negative }} activeDot={{ r: 4 }} />
          <Area type="monotone" dataKey="neutral"  name="Neutral"  stroke={SENTIMENT_COLORS.neutral}  strokeWidth={1.5} fill={`url(#grad-neu-${color.replace("#","")})`} dot={{ r: 2, fill: SENTIMENT_COLORS.neutral }} activeDot={{ r: 3 }} strokeDasharray="4 2" />
        </AreaChart>
      </ResponsiveContainer>

      {/* intensity micro-row */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-mono text-muted-foreground">Pain intensity:</span>
        <div className="flex items-end gap-1 h-5">
          {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div
                className="w-4 rounded-sm"
                style={{
                  height: `${Math.round((d.intensity / 10) * 18)}px`,
                  background: color,
                  opacity: 0.4 + (i / data.length) * 0.6,
                }}
                title={`${d.date}: ${d.intensity}/10`}
              />
            </div>
          ))}
        </div>
        <span className="text-[10px] font-mono" style={{ color }}>
          {latest.intensity}/10 latest
        </span>
      </div>
    </div>
  );
}

interface WishGroup { theme: string; label: string; count: number; quotes: string[] }

function WishlistPanel({ groups, total, withWish, color }: { groups: WishGroup[]; total: number; withWish: number; color: string }) {
  if (!groups.length) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground font-mono">No wish data yet — run the scraper</p>
      </div>
    );
  }
  const maxCount = groups[0]?.count ?? 1;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-mono">
        {withWish} of {total} reviews expressed a feature wish
      </p>
      {groups.map((g) => (
        <div key={g.theme} className="rounded-md border border-border/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: `${color}20`, color }}
              >
                {g.label}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{g.count} user{g.count !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round((g.count / maxCount) * 100)}%`, background: color }}
              />
            </div>
          </div>
          <ul className="space-y-1.5">
            {g.quotes.slice(0, 3).map((q, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {q.length > 140 ? q.slice(0, 137) + "…" : q}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface DetailPanelProps { slug: string; name: string; color: string }
function NotesSection({ slug, color }: { slug: string; color: string }) {
  const { query, mutation } = useNotes(slug);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => { setDraft(null); }, [slug]);

  const text = draft ?? query.data?.text ?? "";
  const savedAt = query.data?.updatedAt;

  useEffect(() => {
    if (draft === null) return;
    const t = setTimeout(() => mutation.mutate(draft), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Analyst Notes</p>
        <span className="text-[10px] font-mono text-muted-foreground">
          {mutation.isPending
            ? "Saving…"
            : savedAt
              ? `saved ${formatDistanceToNow(new Date(savedAt), { addSuffix: true })}`
              : text.trim()
                ? "unsaved"
                : ""}
        </span>
      </div>
      <textarea
        className="w-full rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-border transition-colors font-sans leading-relaxed"
        style={{ minHeight: 180, caretColor: color }}
        placeholder="Add analyst notes, observations, or strategic takeaways…"
        value={text}
        onChange={e => setDraft(e.target.value)}
        spellCheck
        disabled={query.isLoading}
      />
      {query.isLoading && (
        <p className="text-xs text-muted-foreground font-mono animate-pulse">Loading notes…</p>
      )}
    </div>
  );
}

function DetailPanel({ slug, name, color }: DetailPanelProps) {
  const [tab, setTab] = useState<"sentiment" | "themes" | "gap" | "wishlist" | "notes">("sentiment");
  const { data: analysis } = useAnalysis(slug, true);
  const { data: themes } = useThemes(slug, tab === "themes");
  const { data: gap } = useGap(slug, tab === "gap");
  const { data: historyData } = useHistory(slug);
  const { data: wishData } = useWishes(slug, tab === "wishlist");
  const snapshots: HistorySnapshot[] = historyData?.snapshots ?? [];

  const tabs = [
    { id: "sentiment" as const, label: "Sentiment" },
    { id: "themes" as const, label: "Themes" },
    { id: "gap" as const, label: "Gap Analysis" },
    { id: "wishlist" as const, label: "Wishlist" },
    { id: "notes" as const, label: "Notes" },
  ];

  const sentimentData = analysis?.sentiment
    ? Object.entries(analysis.sentiment)
        .filter(([k]) => k !== "avgIntensity")
        .map(([name, value]) => ({ name, value: value as number }))
        .filter(d => d.value > 0)
    : [];

  const themeData = analysis?.topThemes?.map((t: string) => ({
    theme: t,
    count: (analysis.analyses ?? []).filter((a: { themes: string[] }) => a.themes?.includes(t)).length,
  })) ?? [];

  return (
    <Card className="shadow-none border-border/50">
      <CardHeader className="pb-0 border-b border-border/50" style={{ background: `${color}06` }}>
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {name}
          </CardTitle>
          {analysis && (
            <span className="text-xs text-muted-foreground font-mono">
              {analysis.total} analyzed · avg intensity {analysis.sentiment?.avgIntensity}/10
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 text-xs font-medium rounded-t transition-colors"
              style={tab === t.id
                ? { color, borderBottom: `2px solid ${color}`, background: `${color}10` }
                : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {tab === "sentiment" && (
          <>
            <div className="grid grid-cols-2 gap-6">
              {sentimentData.length > 0 ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Sentiment Distribution</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} fontSize={10}>
                          {sentimentData.map((entry) => (
                            <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Top Pain Points</p>
                    <div className="space-y-2">
                      {(analysis?.analyses ?? [])
                        .filter((a: { pain_point?: string }) => a.pain_point)
                        .slice(0, 5)
                        .map((a: { pain_point: string; sentiment: string }, i: number) => (
                          <div key={i} className="flex gap-2 items-start">
                            <SentimentBadge sentiment={a.sentiment} />
                            <p className="text-xs text-muted-foreground leading-relaxed">{a.pain_point}</p>
                          </div>
                        ))}
                      {!analysis?.total && (
                        <p className="text-xs text-muted-foreground font-mono">No analysis yet — run the scraper</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="col-span-2 flex items-center justify-center h-32">
                  <p className="text-sm text-muted-foreground font-mono">No analysis data yet — click Run Scraper above</p>
                </div>
              )}
            </div>

            {snapshots.length >= 1 && (
              <>
                <div className="mt-4 pt-4 border-t border-border/40">
                  <SentimentSparkline snapshots={snapshots} color={color} />
                </div>
                <HealthScoreChart slug={slug} snapshots={snapshots} color={color} />
              </>
            )}
          </>
        )}

        {tab === "themes" && (
          <div className="space-y-4">
            {themeData.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Theme Frequency</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={themeData} margin={{ left: -20, right: 8, top: 4, bottom: 20 }}>
                    <XAxis dataKey="theme" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 11 }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {themeData.map((_: unknown, i: number) => <Cell key={i} fill={color} fillOpacity={0.7 + (i === 0 ? 0.3 : 0)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {themes?.clusters?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Clustered Themes</p>
                {themes.clusters.map((cluster: { theme: string; description: string; count: number; example_quotes?: string[] }) => (
                  <div key={cluster.theme} className="p-3 rounded-md border border-border/40 bg-muted/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{cluster.theme}</span>
                      <Badge variant="outline" className="text-xs font-mono">{cluster.count}×</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{cluster.description}</p>
                    {cluster.example_quotes?.slice(0, 1).map((q, i) => (
                      <p key={i} className="text-xs italic text-muted-foreground/70 border-l-2 pl-2" style={{ borderColor: color }}>"{q}"</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {!themeData.length && !themes?.clusters?.length && (
              <p className="text-sm text-muted-foreground font-mono">No theme data yet — run the scraper</p>
            )}
          </div>
        )}

        {tab === "gap" && (
          <div>
            {gap?.markdown ? (
              <div className="prose prose-sm prose-invert max-w-none">
                <div
                  className="text-sm leading-relaxed space-y-3 text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: gap.markdown
                    .replace(/^## (.+)$/gm, '<h3 class="text-foreground font-semibold text-sm mt-4 mb-1">$1</h3>')
                    .replace(/^# (.+)$/gm, '<h2 class="text-foreground font-bold text-base mt-2 mb-2">$1</h2>')
                    .replace(/^\d+\. (.+)$/gm, '<div class="ml-3">• $1</div>')
                    .replace(/^- (.+)$/gm, '<div class="ml-3">• $1</div>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                    .replace(/\n\n/g, '<br/>')
                  }}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground font-mono">No gap analysis yet — run the scraper</p>
            )}
          </div>
        )}

        {tab === "wishlist" && (
          <WishlistPanel
            groups={wishData?.groups ?? []}
            total={wishData?.total ?? 0}
            withWish={wishData?.withWish ?? 0}
            color={color}
          />
        )}
        {tab === "notes" && (
          <NotesSection slug={slug} color={color} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── reviews panel ────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

interface Review {
  source: string;
  competitor: string;
  rating?: number;
  title?: string;
  text?: string;
  body?: string;
  pros?: string;
  cons?: string;
  reviewer_role?: string;
  reviewer_industry?: string;
  reviewer_company_size?: string;
  date?: string;
  url?: string;
  upVotes?: number;
  numberOfComments?: number;
  username?: string;
  communityName?: string;
}

function StarRating({ rating }: { rating?: number }) {
  if (!rating || rating <= 0) return null;
  const max = rating <= 5 ? 5 : 10;
  const normalized = max === 10 ? rating / 2 : rating;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className="h-3 w-3"
          style={{
            fill: s <= Math.round(normalized) ? "#fbbf24" : "transparent",
            color: s <= Math.round(normalized) ? "#fbbf24" : "hsl(var(--border))",
          }}
        />
      ))}
      <span className="text-[10px] font-mono text-muted-foreground ml-0.5">
        {normalized.toFixed(1)}
      </span>
    </div>
  );
}

function ReviewCard({ review, color }: { review: Review; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const mainText = review.text || review.body || "";
  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + "…" : s;

  return (
    <div
      className="p-4 rounded-lg border border-border/40 bg-card/50 space-y-2.5 hover:border-border/70 transition-colors"
    >
      {/* header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: `${SOURCE_COLORS[review.source] ?? "#94a3b8"}22`,
              color: SOURCE_COLORS[review.source] ?? "#94a3b8",
              border: `1px solid ${SOURCE_COLORS[review.source] ?? "#94a3b8"}44`,
            }}
          >
            {review.source}
          </span>
          <StarRating rating={review.rating} />
        </div>
        {review.date && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{review.date}</span>
        )}
      </div>

      {/* title */}
      {review.title && (
        <p className="text-sm font-semibold text-foreground leading-snug">{review.title}</p>
      )}

      {/* pros / cons (Capterra) */}
      {(review.pros || review.cons) && (
        <div className="grid grid-cols-2 gap-2">
          {review.pros && (
            <div className="rounded-md p-2.5 text-xs" style={{ background: "#34d39910", border: "1px solid #34d39930" }}>
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Pros</p>
              <p className="text-muted-foreground leading-relaxed">
                {expanded ? review.pros : truncate(review.pros, 180)}
              </p>
            </div>
          )}
          {review.cons && (
            <div className="rounded-md p-2.5 text-xs" style={{ background: "#f8717110", border: "1px solid #f8717130" }}>
              <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Cons</p>
              <p className="text-muted-foreground leading-relaxed">
                {expanded ? review.cons : truncate(review.cons, 180)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* body text (Reddit / generic) */}
      {mainText && !review.pros && !review.cons && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {expanded ? mainText : truncate(mainText, 300)}
        </p>
      )}

      {/* expand toggle */}
      {((review.pros && review.pros.length > 180) ||
        (review.cons && review.cons.length > 180) ||
        (mainText && mainText.length > 300)) && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "show less ↑" : "show more ↓"}
        </button>
      )}

      {/* footer: reviewer info */}
      <div className="flex items-center gap-3 flex-wrap pt-0.5">
        {(review.reviewer_role || review.username) && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {review.reviewer_role || `u/${review.username}`}
          </span>
        )}
        {review.reviewer_industry && (
          <span className="text-[10px] text-muted-foreground font-mono">· {review.reviewer_industry}</span>
        )}
        {review.reviewer_company_size && (
          <span className="text-[10px] text-muted-foreground font-mono">· {review.reviewer_company_size}</span>
        )}
        {review.communityName && (
          <span className="text-[10px] text-muted-foreground font-mono">r/{review.communityName}</span>
        )}
        {review.upVotes != null && (
          <span className="text-[10px] text-muted-foreground font-mono">↑ {review.upVotes}</span>
        )}
        {review.numberOfComments != null && (
          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
            <MessageSquare className="h-2.5 w-2.5" /> {review.numberOfComments}
          </span>
        )}
        {review.url && (
          <a
            href={review.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono ml-auto"
            style={{ color }}
          >
            view →
          </a>
        )}
      </div>
    </div>
  );
}

interface ReviewsCompetitor {
  name: string;
  slug: string;
  totalReviews: number;
  sources: Array<{ source: string; count: number }>;
}

function ReviewsPanel({ competitors, competitorColors }: {
  competitors: ReviewsCompetitor[];
  competitorColors: string[];
}) {
  const [selectedSlug, setSelectedSlug] = useState<string>(competitors[0]?.slug ?? "hirevue");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedComp = competitors.find((c) => c.slug === selectedSlug);
  const color = competitorColors[competitors.findIndex((c) => c.slug === selectedSlug)] ?? "#60a5fa";

  // reset pagination when filters change
  const resetOffset = useCallback(() => setOffset(0), []);

  // debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      resetOffset();
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, resetOffset]);

  const ratingParams: Record<string, { minRating?: number; maxRating?: number }> = {
    all: {},
    "5": { minRating: 4.5, maxRating: 5 },
    "4": { minRating: 3.5, maxRating: 4.49 },
    "3": { minRating: 2.5, maxRating: 3.49 },
    "low": { minRating: 0.1, maxRating: 2.49 },
  };

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    ...(sourceFilter !== "all" && { source: sourceFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(ratingParams[ratingFilter]?.minRating != null && { minRating: String(ratingParams[ratingFilter].minRating) }),
    ...(ratingParams[ratingFilter]?.maxRating != null && { maxRating: String(ratingParams[ratingFilter].maxRating) }),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["intel", selectedSlug, "reviews", sourceFilter, debouncedSearch, ratingFilter, offset],
    queryFn: () => fetch(`${API}/${selectedSlug}/reviews?${params}`).then((r) => r.json()),
    placeholderData: (prev) => prev,
  });

  const reviews: Review[] = data?.reviews ?? [];
  const total: number = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  const sources = selectedComp?.sources ?? [];
  const activeSources = sources.filter((s) => s.count > 0).map((s) => s.source);

  return (
    <div className="space-y-5">
      {/* competitor selector */}
      <div className="flex flex-wrap gap-2">
        {competitors.map((comp, i) => (
          <button
            key={comp.slug}
            onClick={() => { setSelectedSlug(comp.slug); resetOffset(); setSourceFilter("all"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border"
            style={selectedSlug === comp.slug
              ? { background: `${competitorColors[i]}20`, color: competitorColors[i], borderColor: `${competitorColors[i]}60` }
              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
            }
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: competitorColors[i] }} />
            {comp.name}
            <span className="text-[10px] font-mono opacity-60">{comp.totalReviews}</span>
          </button>
        ))}
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* search */}
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews…"
            className="w-full rounded-md border border-border bg-background text-sm pl-8 pr-3 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1"
            style={{ "--tw-ring-color": color } as React.CSSProperties}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* source pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", ...activeSources].map((src) => (
            <button
              key={src}
              onClick={() => { setSourceFilter(src); resetOffset(); }}
              className="px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors border"
              style={sourceFilter === src
                ? src === "all"
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", borderColor: "transparent" }
                  : { background: `${SOURCE_COLORS[src]}22`, color: SOURCE_COLORS[src], borderColor: `${SOURCE_COLORS[src]}44` }
                : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {src === "all" ? "All sources" : src}
              {src !== "all" && (
                <span className="ml-1 opacity-60">
                  {sources.find((s) => s.source === src)?.count ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* rating filter */}
        <select
          value={ratingFilter}
          onChange={(e) => { setRatingFilter(e.target.value); resetOffset(); }}
          className="rounded-md border border-border bg-background text-xs font-mono px-2.5 py-1.5 text-muted-foreground focus:outline-none"
        >
          <option value="all">All ratings</option>
          <option value="5">★★★★★ (5)</option>
          <option value="4">★★★★ (4)</option>
          <option value="3">★★★ (3)</option>
          <option value="low">★★ or below</option>
        </select>
      </div>

      {/* results header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-mono">
          {isFetching && !isLoading
            ? "Filtering…"
            : total === 0
            ? "No reviews match your filters"
            : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total.toLocaleString()} reviews`}
        </p>
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const url = `${API}/${selectedSlug}/reviews/export?${params}`;
                window.open(url, "_blank");
              }}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              title="Export filtered reviews to CSV"
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={!hasPrev || isFetching}
              className="text-xs font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              ← prev
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasMore || isFetching}
              className="text-xs font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              next →
            </button>
          </div>
        )}
      </div>

      {/* review cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-lg border border-border/30 bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="shadow-none border-border/50 border-dashed">
          <CardContent className="py-12 text-center space-y-2">
            <MessageSquare className="h-7 w-7 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground font-mono">
              {total === 0 && !debouncedSearch && ratingFilter === "all" && sourceFilter === "all"
                ? "No reviews collected yet — run the scraper first"
                : "No reviews match your current filters"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review, i) => (
            <ReviewCard key={`${review.source}-${i}-${offset}`} review={review} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── compare panel ────────────────────────────────────────────────────────────

const THEME_LABELS: Record<string, string> = {
  feature_request: "Feature Req",
  bug: "Bug",
  pricing: "Pricing",
  support: "Support",
  ux: "UX",
  ai_bias: "AI Bias",
  candidate_experience: "Candidate Exp",
  accuracy: "Accuracy",
  integration: "Integration",
  transparency: "Transparency",
  fairness: "Fairness",
  speed: "Speed",
  trust: "Trust",
};

interface CompetitorSummary {
  name: string;
  slug: string;
  totalReviews: number;
  hasAnalysis: boolean;
  sentimentSummary?: {
    positive: number; negative: number; neutral: number; mixed: number; avgIntensity: number;
  };
  sources: Array<{ source: string; count: number }>;
  newReviews?: number;
  newBySource?: Record<string, number>;
  isStale?: boolean;
  velocity?: number[];
  healthScore?: number;
  hasNote?: boolean;
}

// ─── gap analysis helpers ─────────────────────────────────────────────────────

interface GapData {
  theme: string;
  label: string;
  competitorCount: number;
  competitorNames: string[];
  negativeRatio: number;
  avgIntensity: number;
  score: number;
  topPainPoints: string[];
  topWishes: string[];
}

type AnalysisItem = {
  sentiment?: string;
  intensity?: number;
  themes?: string[];
  pain_point?: string;
  wish?: string;
};

type AnalysisResult = {
  data?: { analyses?: AnalysisItem[]; topThemes?: string[] };
};

function computeGaps(
  competitors: CompetitorSummary[],
  analyses: AnalysisResult[],
): GapData[] {
  // theme → per-competitor bucket
  const themeMap = new Map<string, {
    competitors: Set<string>;
    negCount: number;
    totalCount: number;
    intensitySum: number;
    intensityCount: number;
    painPoints: string[];
    wishes: string[];
  }>();

  competitors.forEach((comp, i) => {
    const items = (analyses[i]?.data?.analyses ?? []) as AnalysisItem[];
    items.forEach((item) => {
      const themes = item.themes ?? [];
      const isNeg = item.sentiment === "negative" || item.sentiment === "mixed";
      themes.forEach((t) => {
        if (!themeMap.has(t)) {
          themeMap.set(t, {
            competitors: new Set(),
            negCount: 0, totalCount: 0,
            intensitySum: 0, intensityCount: 0,
            painPoints: [], wishes: [],
          });
        }
        const bucket = themeMap.get(t)!;
        bucket.competitors.add(comp.slug);
        bucket.totalCount++;
        if (isNeg) {
          bucket.negCount++;
          if (item.intensity) { bucket.intensitySum += item.intensity; bucket.intensityCount++; }
          if (item.pain_point && !bucket.painPoints.includes(item.pain_point) && bucket.painPoints.length < 4) {
            bucket.painPoints.push(item.pain_point);
          }
        }
        if (item.wish && !bucket.wishes.includes(item.wish) && bucket.wishes.length < 3) {
          bucket.wishes.push(item.wish);
        }
      });
    });
  });

  const results: GapData[] = [];
  themeMap.forEach((bucket, theme) => {
    if (bucket.totalCount < 3) return; // ignore noise
    const negativeRatio = bucket.totalCount > 0 ? bucket.negCount / bucket.totalCount : 0;
    const avgIntensity = bucket.intensityCount > 0 ? bucket.intensitySum / bucket.intensityCount : 5;
    const competitorCount = bucket.competitors.size;
    const competitorNames = competitors
      .filter((c) => bucket.competitors.has(c.slug))
      .map((c) => c.name);
    // score: cross-competitor spread × dissatisfaction rate × intensity
    const score = competitorCount * negativeRatio * avgIntensity;
    results.push({
      theme,
      label: THEME_LABELS[theme] ?? theme,
      competitorCount,
      competitorNames,
      negativeRatio,
      avgIntensity,
      score,
      topPainPoints: bucket.painPoints.slice(0, 3),
      topWishes: bucket.wishes.slice(0, 2),
    });
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

// severity colour: higher negativeRatio × intensity → redder
function gapColor(negativeRatio: number, avgIntensity: number) {
  const heat = Math.min(negativeRatio * avgIntensity / 10, 1);
  if (heat > 0.6) return { bg: "#ff4d4d14", border: "#ff4d4d44", accent: "#ff6b6b" };
  if (heat > 0.35) return { bg: "#f59e0b14", border: "#f59e0b44", accent: "#f59e0b" };
  return { bg: "#60a5fa14", border: "#60a5fa44", accent: "#60a5fa" };
}

function buildExportRows(
  competitors: CompetitorSummary[],
  analyses: Array<{ data?: { topThemes?: string[]; analyses?: Array<{ pain_point?: string }> } }>,
) {
  return competitors.map((comp, i) => {
    const analysis = analyses[i]?.data;
    const sentiment = comp.sentimentSummary;
    const sentTotal = sentiment ? sentiment.positive + sentiment.negative + sentiment.neutral + sentiment.mixed : 0;
    const pct = (n: number) => (sentTotal > 0 ? Math.round((n / sentTotal) * 100) : 0);
    const capterra = comp.sources.find((s) => s.source === "capterra")?.count ?? 0;
    const reddit  = comp.sources.find((s) => s.source === "reddit")?.count  ?? 0;
    const g2      = comp.sources.find((s) => s.source === "g2")?.count      ?? 0;
    const topThemes = ((analysis?.topThemes ?? []) as string[])
      .slice(0, 5).map((t) => THEME_LABELS[t] ?? t).join(", ");
    const painPoints = ((analysis?.analyses ?? []) as Array<{ pain_point?: string }>)
      .filter((a) => a.pain_point)
      .slice(0, 4)
      .map((a) => a.pain_point!)
      .join(" | ");
    return {
      Competitor: comp.name,
      "Total Reviews": comp.totalReviews,
      Capterra: capterra,
      Reddit: reddit,
      G2: g2,
      "Positive %": sentiment ? pct(sentiment.positive) : "",
      "Negative %": sentiment ? pct(sentiment.negative) : "",
      "Neutral %":  sentiment ? pct(sentiment.neutral)  : "",
      "Mixed %":    sentiment ? pct(sentiment.mixed)    : "",
      "Avg Intensity": sentiment?.avgIntensity ?? "",
      "Top Themes": topThemes,
      "Top Pain Points": painPoints,
    };
  });
}

function downloadCSV(rows: ReturnType<typeof buildExportRows>) {
  const headers = Object.keys(rows[0]) as Array<keyof (typeof rows)[0]>;
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `truevoice-competitive-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function pdfDarkPage(doc: InstanceType<typeof import("jspdf").default>, w: number, h: number) {
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, w, h, "F");
}

function pdfPageHeader(
  doc: InstanceType<typeof import("jspdf").default>,
  title: string,
  subtitle: string,
  stat: string,
  pageNum: number,
  totalPages: number,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(245, 245, 245);
  doc.text(title, 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(130, 130, 140);
  doc.text(subtitle, 14, 25);

  doc.setFontSize(7.5);
  doc.setTextColor(90, 170, 120);
  doc.text(stat, 14, 31);

  doc.setFontSize(7);
  doc.setTextColor(60, 60, 70);
  doc.text(`Page ${pageNum} of ${totalPages}`, 283, 31, { align: "right" });
}

async function downloadPDF(
  rows: ReturnType<typeof buildExportRows>,
  colors: string[],
  gaps: GapData[],
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const W = 297; const H = 210;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalReviews = rows.reduce((s, r) => s + (r["Total Reviews"] as number), 0);
  const analyzedCount = rows.filter((r) => r["Avg Intensity"] !== "").length;
  const totalPages = gaps.length > 0 ? 2 : 1;
  const stat = `${totalReviews.toLocaleString()} total data points  ·  ${analyzedCount}/5 analyzed`;

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Competitor comparison
  // ════════════════════════════════════════════════════════════════════════
  pdfDarkPage(doc, W, H);
  pdfPageHeader(doc, "TrueVoice HQ — Competitive Intelligence", `AI Video Interview Market · Generated ${today}`, stat, 1, totalPages);

  const tableHead = [
    ["Competitor", "Reviews", "Capterra", "Reddit", "G2", "Positive", "Negative", "Neutral", "Mixed", "Intensity", "Top Themes", "Top Pain Points"],
  ];
  const tableBody = rows.map((r) => [
    r.Competitor,
    r["Total Reviews"],
    r.Capterra,
    r.Reddit,
    r.G2,
    r["Positive %"]    !== "" ? `${r["Positive %"]}%`    : "—",
    r["Negative %"]    !== "" ? `${r["Negative %"]}%`    : "—",
    r["Neutral %"]     !== "" ? `${r["Neutral %"]}%`     : "—",
    r["Mixed %"]       !== "" ? `${r["Mixed %"]}%`       : "—",
    r["Avg Intensity"] !== "" ? r["Avg Intensity"]        : "—",
    r["Top Themes"]    || "—",
    r["Top Pain Points"] || "—",
  ]);

  autoTable(doc, {
    startY: 38,
    head: tableHead,
    body: tableBody,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2.5, textColor: [220, 220, 225], fillColor: [22, 22, 28], lineColor: [45, 45, 55], lineWidth: 0.3 },
    headStyles: { fillColor: [30, 30, 40], textColor: [160, 160, 170], fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 24 },
      1: { cellWidth: 16, halign: "center" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 10, halign: "center" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 16, halign: "center" },
      7: { cellWidth: 14, halign: "center" },
      8: { cellWidth: 12, halign: "center" },
      9: { cellWidth: 16, halign: "center" },
      10: { cellWidth: 42 },
      11: { cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        data.cell.styles.textColor = hexToRgb(colors[data.row.index] ?? "#60a5fa");
      }
      if (data.section === "body" && data.column.index === 6) {
        const n = parseInt(String(data.cell.raw));
        if (!isNaN(n) && n >= 30) data.cell.styles.textColor = [255, 100, 80];
      }
      if (data.section === "body" && data.column.index === 5) {
        const n = parseInt(String(data.cell.raw));
        if (!isNaN(n) && n >= 40) data.cell.styles.textColor = [80, 200, 140];
      }
    },
  });

  const p1FinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 70);
  doc.text("Confidential — TrueVoice HQ internal use only", 14, p1FinalY);

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Gap analysis (only when data exists)
  // ════════════════════════════════════════════════════════════════════════
  if (gaps.length > 0) {
    doc.addPage("a4", "landscape");
    pdfDarkPage(doc, W, H);
    pdfPageHeader(
      doc,
      "TrueVoice HQ — Market Gap Opportunities",
      `Where competitors consistently fail · Score = spread × dissatisfaction × intensity · Generated ${today}`,
      stat,
      2,
      totalPages,
    );

    // ── scoring legend strip ──────────────────────────────────────────────
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 110);
    doc.text("Score formula:  (# competitors affected)  ×  (negative + mixed %)  ×  (avg pain intensity 1–10)", 14, 37);

    // ── gap table ─────────────────────────────────────────────────────────
    const gapHead = [["Rank", "Theme", "Score", "Dissatisfied", "Competitors Affected", "Avg Intensity", "Top Pain Points", "TrueVoice Angle"]];
    const gapBody = gaps.map((g, i) => [
      RANK_LABELS[i] ?? `#${i + 1}`,
      g.label,
      g.score.toFixed(1),
      `${Math.round(g.negativeRatio * 100)}%`,
      g.competitorNames.join(", "),
      g.avgIntensity.toFixed(1),
      g.topPainPoints.join("\n") || "—",
      g.topWishes[0] || "—",
    ]);

    // severity accent per row: red=hot, amber=warm, blue=cool
    const gapAccents = gaps.map((g) => {
      const heat = Math.min((g.negativeRatio * g.avgIntensity) / 10, 1);
      if (heat > 0.6) return [220, 80, 80] as [number, number, number];
      if (heat > 0.35) return [210, 155, 40] as [number, number, number];
      return [80, 150, 220] as [number, number, number];
    });

    autoTable(doc, {
      startY: 42,
      head: gapHead,
      body: gapBody,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 2.5, textColor: [215, 215, 220], fillColor: [18, 18, 24], lineColor: [40, 40, 52], lineWidth: 0.3 },
      headStyles: { fillColor: [28, 28, 38], textColor: [150, 150, 165], fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        1: { cellWidth: 28, fontStyle: "bold" },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 44 },
        5: { cellWidth: 22, halign: "center" },
        6: { cellWidth: 70 },
        7: { cellWidth: 70 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const accent = gapAccents[data.row.index];
        // rank + theme columns get accent colour
        if (data.column.index === 0 || data.column.index === 1) {
          data.cell.styles.textColor = accent;
        }
        // score column: bold accent
        if (data.column.index === 2) {
          data.cell.styles.textColor = accent;
          data.cell.styles.fontStyle = "bold";
        }
        // dissatisfied column: red when high
        if (data.column.index === 3) {
          const n = parseInt(String(data.cell.raw));
          if (!isNaN(n) && n >= 50) data.cell.styles.textColor = [240, 90, 80];
          else if (!isNaN(n) && n >= 30) data.cell.styles.textColor = [220, 155, 60];
        }
        // alternating row tint for readability
        if (data.row.index % 2 === 1) {
          data.cell.styles.fillColor = [24, 24, 32];
        }
      },
    });

    const p2FinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 70);
    doc.text("Confidential — TrueVoice HQ internal use only", 14, p2FinalY);
  }

  doc.save(`truevoice-competitive-comparison-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function ComparePanel({ competitors, colors }: {
  competitors: CompetitorSummary[];
  colors: string[];
}) {
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const analyses = useQueries({
    queries: competitors.map((comp) => ({
      queryKey: ["intel", comp.slug, "analysis"],
      queryFn: () => fetch(`${API}/${comp.slug}/analysis`).then((r) => r.json()),
      enabled: comp.hasAnalysis,
    })),
  });

  const noData = competitors.every((c) => c.totalReviews === 0);

  const handleExport = async (format: "csv" | "pdf") => {
    setExporting(format);
    try {
      const rows = buildExportRows(competitors, analyses);
      if (format === "csv") {
        downloadCSV(rows);
      } else {
        const gaps = computeGaps(competitors, analyses);
        await downloadPDF(rows, colors, gaps);
      }
    } finally {
      setExporting(null);
    }
  };

  if (noData) {
    return (
      <Card className="shadow-none border-border/50 border-dashed">
        <CardContent className="py-12 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No data to compare yet</p>
          <p className="text-xs text-muted-foreground font-mono">
            Click <strong className="text-foreground">Run Scraper</strong> to collect data across all competitors
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground font-mono">
          All 5 competitors side-by-side
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("csv")}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            {exporting === "csv" ? "Exporting…" : "CSV"}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            {exporting === "pdf" ? "Generating…" : "PDF Report"}
          </button>
        </div>
      </div>

      {/* scrollable 5-col grid */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `repeat(${competitors.length}, 1fr)`, gap: "12px" }}>
          {competitors.map((comp, i) => {
            const color = colors[i] ?? "#60a5fa";
            const analysis = analyses[i]?.data;
            const sentiment = comp.sentimentSummary;
            const sentTotal = sentiment ? sentiment.positive + sentiment.negative + sentiment.neutral + sentiment.mixed : 0;
            const topThemes = (analysis?.topThemes ?? []) as string[];
            const painPoints = (analysis?.analyses ?? [])
              .filter((a: { pain_point?: string }) => a.pain_point)
              .map((a: { pain_point: string }) => a.pain_point)
              .slice(0, 4) as string[];
            const capterra = comp.sources.find((s) => s.source === "capterra")?.count ?? 0;
            const reddit = comp.sources.find((s) => s.source === "reddit")?.count ?? 0;
            const g2 = comp.sources.find((s) => s.source === "g2")?.count ?? 0;

            // compute average rating from capterra data if we have analysis
            const ratingsArr = (analysis?.analyses ?? []).map((a: { source?: string }) => a).filter(Boolean);
            const avgRatingFromAnalysis = null; // ratings come from raw, not analysis

            return (
              <div
                key={comp.slug}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: `${color}44` }}
              >
                {/* header */}
                <div
                  className="px-4 py-3 flex flex-col gap-1"
                  style={{ background: `${color}12`, borderBottom: `1px solid ${color}30` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full flex-none" style={{ background: color }} />
                    <span className="font-bold text-sm truncate">{comp.name}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-2xl font-mono font-bold" style={{ color }}>
                      {comp.totalReviews.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">reviews</span>
                  </div>
                </div>

                <div className="p-3 space-y-4">
                  {/* source breakdown */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Sources</p>
                    <div className="space-y-1">
                      {[
                        { src: "capterra", count: capterra },
                        { src: "reddit", count: reddit },
                        { src: "g2", count: g2 },
                      ].map(({ src, count }) => (
                        <div key={src} className="flex items-center gap-2">
                          <span
                            className="text-[9px] font-mono px-1 py-0.5 rounded w-14 text-center flex-none"
                            style={{
                              background: `${SOURCE_COLORS[src]}18`,
                              color: SOURCE_COLORS[src],
                              border: `1px solid ${SOURCE_COLORS[src]}33`,
                            }}
                          >
                            {src}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                            {count > 0 && comp.totalReviews > 0 && (
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.round((count / comp.totalReviews) * 100)}%`,
                                  background: SOURCE_COLORS[src],
                                  opacity: 0.7,
                                }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-6 text-right flex-none">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* sentiment */}
                  {sentiment && sentTotal > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Sentiment</p>
                        <span className="text-[10px] font-mono" style={{ color }}>
                          {sentiment.avgIntensity}/10 intensity
                        </span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden gap-px">
                        {(["positive", "negative", "neutral", "mixed"] as const).map((key) => {
                          const pct = Math.round((sentiment[key] / sentTotal) * 100);
                          return pct > 0 ? (
                            <div
                              key={key}
                              style={{ width: `${pct}%`, background: SENTIMENT_COLORS[key] }}
                              title={`${key}: ${pct}%`}
                            />
                          ) : null;
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        {(["positive", "negative", "neutral", "mixed"] as const).map((key) => {
                          const pct = sentTotal > 0 ? Math.round((sentiment[key] / sentTotal) * 100) : 0;
                          return (
                            <div key={key} className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full flex-none" style={{ background: SENTIMENT_COLORS[key] }} />
                              <span className="text-[10px] font-mono text-muted-foreground capitalize">{key}</span>
                              <span className="text-[10px] font-mono ml-auto" style={{ color: SENTIMENT_COLORS[key] }}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Sentiment</p>
                      <p className="text-[11px] text-muted-foreground/50 font-mono italic">
                        {comp.hasAnalysis ? "Loading…" : comp.totalReviews > 0 ? "Run analysis" : "No data yet"}
                      </p>
                    </div>
                  )}

                  {/* top themes */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Top Themes</p>
                    {topThemes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {topThemes.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                            style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
                          >
                            {THEME_LABELS[t] ?? t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/50 font-mono italic">
                        {comp.hasAnalysis ? "Loading…" : comp.totalReviews > 0 ? "Run analysis" : "No data yet"}
                      </p>
                    )}
                  </div>

                  {/* top pain points */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Top Pain Points</p>
                    {painPoints.length > 0 ? (
                      <ul className="space-y-1.5">
                        {painPoints.map((p, j) => (
                          <li key={j} className="flex gap-1.5 items-start">
                            <span className="flex-none mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: color, opacity: 1 - j * 0.2 }} />
                            <span className="text-[11px] text-muted-foreground leading-relaxed">{p}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/50 font-mono italic">
                        {comp.hasAnalysis ? "Loading…" : comp.totalReviews > 0 ? "Run analysis" : "No data yet"}
                      </p>
                    )}
                  </div>

                  {/* "vs TrueVoice" opportunity hint — only when analysis exists */}
                  {sentiment && sentTotal > 0 && (
                    <div
                      className="rounded-md px-2.5 py-2 text-[10px] font-mono"
                      style={{ background: `${color}0d`, border: `1px solid ${color}22` }}
                    >
                      <span className="text-muted-foreground">Neg + Mixed: </span>
                      <span style={{ color }} className="font-bold">
                        {Math.round(((sentiment.negative + sentiment.mixed) / sentTotal) * 100)}%
                      </span>
                      <span className="text-muted-foreground"> dissatisfied → opportunity</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-4 pt-1">
        {(["positive", "negative", "neutral", "mixed"] as const).map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLORS[key] }} />
            <span className="text-[11px] text-muted-foreground capitalize">{key}</span>
          </div>
        ))}
      </div>

      {/* ── gap analysis ──────────────────────────────────────────────────── */}
      <GapAnalysisSection
        competitors={competitors}
        analyses={analyses}
        colors={colors}
      />

      {/* ── universal wishlist ────────────────────────────────────────────── */}
      <CrossWishlistSection colors={colors} />

      {/* ── analyst notes side-by-side ───────────────────────────────────── */}
      <NotesCompareSection competitors={competitors} colors={colors} />
    </div>
  );
}

// ─── notes compare section ────────────────────────────────────────────────────

function NotesCompareSection({ competitors, colors }: {
  competitors: CompetitorSummary[];
  colors: string[];
}) {
  const notesResults = useQueries({
    queries: competitors.map(comp => ({
      queryKey: ["intel", comp.slug, "notes"],
      queryFn: (): Promise<{ text: string; updatedAt: string | null }> =>
        fetch(`${API}/${comp.slug}/notes`).then(r => r.json()),
      staleTime: 30_000,
    })),
  });

  const hasAnyNote = notesResults.some(r => (r.data?.text ?? "").trim().length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Analyst Notes</p>
        </div>
        {!hasAnyNote && (
          <span className="text-[11px] text-muted-foreground font-mono">
            Open a competitor's Notes tab to add observations
          </span>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-[900px]"
          style={{ gridTemplateColumns: `repeat(${competitors.length}, 1fr)`, gap: "12px" }}
        >
          {competitors.map((comp, i) => {
            const color = colors[i] ?? "#60a5fa";
            const result = notesResults[i];
            const text = (result.data?.text ?? "").trim();
            const savedAt = result.data?.updatedAt;

            return (
              <div
                key={comp.slug}
                className="rounded-xl border overflow-hidden flex flex-col"
                style={{ borderColor: `${color}44` }}
              >
                {/* column header */}
                <div
                  className="px-3 py-2.5 flex items-center gap-2 shrink-0"
                  style={{ background: `${color}12`, borderBottom: `1px solid ${color}30` }}
                >
                  <span className="h-2 w-2 rounded-full flex-none" style={{ background: color }} />
                  <span className="font-semibold text-sm truncate flex-1">{comp.name}</span>
                  {text && <FileText className="h-3 w-3 flex-none" style={{ color }} />}
                </div>

                {/* note body */}
                <div className="p-3 flex-1" style={{ minHeight: 120 }}>
                  {result.isLoading ? (
                    <p className="text-[11px] text-muted-foreground font-mono animate-pulse">Loading…</p>
                  ) : text ? (
                    <div className="space-y-2 h-full flex flex-col">
                      <p
                        className="text-[12px] leading-relaxed whitespace-pre-wrap break-words flex-1"
                        style={{ color: "hsl(var(--foreground)/0.85)", display: "-webkit-box", WebkitLineClamp: 14, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {text}
                      </p>
                      {savedAt && (
                        <p className="text-[10px] font-mono text-muted-foreground shrink-0">
                          saved {formatDistanceToNow(new Date(savedAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/40 font-mono italic">No notes yet</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── gap analysis UI ──────────────────────────────────────────────────────────

const RANK_LABELS = ["#1 Priority", "#2 Priority", "#3 Priority", "#4", "#5"];

function GapAnalysisSection({
  competitors,
  analyses,
  colors,
}: {
  competitors: CompetitorSummary[];
  analyses: AnalysisResult[];
  colors: string[];
}) {
  const anyAnalysis = analyses.some((a) => (a.data?.analyses?.length ?? 0) > 0);

  const gaps = anyAnalysis ? computeGaps(competitors, analyses) : [];

  if (!anyAnalysis) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-6 text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Gap analysis available after running scraper + analysis</p>
        <p className="text-xs text-muted-foreground/60 font-mono">
          Scores every theme by how many competitors fail at it × dissatisfaction rate × intensity
        </p>
      </div>
    );
  }

  if (gaps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">No cross-competitor gaps detected yet — run analysis to populate</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* section header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/60" />
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-bold tracking-tight">Market Gap Opportunities</span>
        </div>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <p className="text-xs text-muted-foreground/70 font-mono -mt-1">
        Themes where competitors consistently fail, ranked by spread × dissatisfaction × intensity — highest = biggest TrueVoice opportunity
      </p>

      {/* gap cards grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {gaps.map((gap, idx) => {
          const { bg, border, accent } = gapColor(gap.negativeRatio, gap.avgIntensity);
          const dissatisfiedPct = Math.round(gap.negativeRatio * 100);

          return (
            <div
              key={gap.theme}
              className="rounded-xl p-4 space-y-3"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              {/* card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${accent}20`, color: accent }}
                    >
                      {RANK_LABELS[idx] ?? `#${idx + 1}`}
                    </span>
                  </div>
                  <h4 className="text-base font-bold mt-1" style={{ color: accent }}>
                    {gap.label}
                  </h4>
                </div>
                {/* big dissatisfied % */}
                <div className="text-right flex-none">
                  <div className="text-2xl font-mono font-bold" style={{ color: accent }}>
                    {dissatisfiedPct}%
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">dissatisfied</div>
                </div>
              </div>

              {/* stats row */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Affects</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: accent }}>
                    {gap.competitorCount}/5
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">competitors</span>
                </div>
                <span className="text-muted-foreground/30">·</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Intensity</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: accent }}>
                    {gap.avgIntensity.toFixed(1)}/10
                  </span>
                </div>
              </div>

              {/* affected competitors pills */}
              <div className="flex flex-wrap gap-1">
                {gap.competitorNames.map((name, ci) => {
                  const compIdx = competitors.findIndex((c) => c.name === name);
                  const col = colors[compIdx] ?? "#60a5fa";
                  return (
                    <span
                      key={name}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                      style={{ background: `${col}18`, color: col, border: `1px solid ${col}30` }}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>

              {/* pain points */}
              {gap.topPainPoints.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wider">
                    What users complain about
                  </p>
                  <ul className="space-y-1.5">
                    {gap.topPainPoints.map((pt, j) => (
                      <li key={j} className="flex gap-2 items-start">
                        <span
                          className="flex-none mt-1 h-1 w-1 rounded-full"
                          style={{ background: accent }}
                        />
                        <span className="text-[11px] text-muted-foreground leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* wish / TrueVoice angle */}
              {gap.topWishes.length > 0 && (
                <div
                  className="rounded-md px-3 py-2 space-y-1"
                  style={{ background: `${accent}0d`, border: `1px solid ${accent}22` }}
                >
                  <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: accent }}>
                    TrueVoice angle
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {gap.topWishes[0]}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── cross-competitor wishlist ────────────────────────────────────────────────

interface CrossWishGroup {
  theme: string;
  label: string;
  total: number;
  breadth: number;
  byCompetitor: Record<string, number>;
  quotes: string[];
}

const SLUG_COLORS: Record<string, string> = {
  "hirevue": "#3b82f6",
  "sparkhire": "#a855f7",
  "brighthire": "#22c55e",
  "interviewing-io": "#f97316",
  "metaview": "#ec4899",
};

const SLUG_NAMES: Record<string, string> = {
  "hirevue": "HireVue",
  "sparkhire": "SparkHire",
  "brighthire": "BrightHire",
  "interviewing-io": "Interviewing.io",
  "metaview": "Metaview",
};

function CrossWishlistSection({ colors }: { colors: string[] }) {
  const { data, isLoading } = useCrossWishes();
  const groups: CrossWishGroup[] = data?.groups ?? [];

  const hasData = groups.length > 0;
  const maxTotal = groups[0]?.total ?? 1;

  return (
    <div className="space-y-4 pt-2">
      {/* section header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/60" />
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-bold tracking-tight">Universal Feature Wishlist</span>
        </div>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <p className="text-xs text-muted-foreground/70 font-mono -mt-1">
        Features users across all competitors wish existed — ranked by how many products share the demand
      </p>

      {isLoading && (
        <div className="flex items-center justify-center h-24">
          <p className="text-xs text-muted-foreground font-mono animate-pulse">Loading wish data…</p>
        </div>
      )}

      {!isLoading && !hasData && (
        <div className="rounded-xl border border-dashed border-border/50 p-6 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Wishlist available after running scraper + analysis</p>
          <p className="text-xs text-muted-foreground/60 font-mono">
            Claude extracts a wish from each review — this view aggregates them across all 5 competitors
          </p>
        </div>
      )}

      {hasData && (
        <div className="space-y-3">
          {groups.slice(0, 8).map((g, idx) => (
            <div
              key={g.theme}
              className="rounded-xl border border-border/40 p-4 space-y-3"
              style={{ background: idx < 3 ? "hsl(var(--muted)/0.35)" : undefined }}
            >
              {/* row 1: rank badge, label, breadth pill, volume bar */}
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 shrink-0">
                  #{idx + 1}
                </span>
                <span className="text-sm font-semibold flex-1 truncate">{g.label}</span>
                <span className="text-[10px] font-mono text-violet-300 shrink-0">
                  {g.breadth}/5 competitors
                </span>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {g.total} mentions
                </span>
              </div>

              {/* row 2: per-competitor breakdown pills */}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(g.byCompetitor)
                  .sort(([, a], [, b]) => b - a)
                  .map(([slug, count]) => {
                    const col = SLUG_COLORS[slug] ?? "#94a3b8";
                    return (
                      <span
                        key={slug}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: `${col}18`, color: col, border: `1px solid ${col}30` }}
                      >
                        {SLUG_NAMES[slug] ?? slug}
                        <span className="opacity-70">·{count}</span>
                      </span>
                    );
                  })}
              </div>

              {/* row 3: volume bar */}
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500/60"
                  style={{ width: `${Math.round((g.total / maxTotal) * 100)}%` }}
                />
              </div>

              {/* row 4: example quotes */}
              {g.quotes.length > 0 && (
                <ul className="space-y-1.5 pt-0.5">
                  {g.quotes.slice(0, 2).map((q, qi) => (
                    <li key={qi} className="flex gap-2 items-start">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400/60" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {q.length > 160 ? q.slice(0, 157) + "…" : q}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── features panel ───────────────────────────────────────────────────────────

function FeaturesPanel() {
  const { data } = useFeatures();
  const rows = data?.rows ?? [];

  if (!rows.length) {
    return (
      <Card className="shadow-none border-border/50">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">No feature priority data yet — click Run Scraper to generate</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-none border-border/50">
      <CardHeader className="pb-2 bg-muted/20">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-400" />
          Feature Priority Ranking
        </CardTitle>
        <p className="text-xs text-muted-foreground">Opportunity score = frequency × intensity ÷ competitors already addressing it</p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="pb-2 text-left">Feature</th>
                <th className="pb-2 text-right">Freq</th>
                <th className="pb-2 text-right">Intensity</th>
                <th className="pb-2 text-right">Competitors</th>
                <th className="pb-2 text-right">Opportunity ↓</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((row: { feature: string; frequency: number; avg_intensity: number; competitors_mentioning: number; opportunity_score: number }, i: number) => (
                <tr key={row.feature} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="py-2 capitalize text-foreground">{row.feature.replace(/_/g, " ")}</td>
                  <td className="py-2 text-right">{row.frequency}</td>
                  <td className="py-2 text-right">{row.avg_intensity}</td>
                  <td className="py-2 text-right">{row.competitors_mentioning}</td>
                  <td className="py-2 text-right">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        background: i < 3 ? "#3b82f618" : "transparent",
                        color: i < 3 ? "#3b82f6" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {row.opportunity_score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── league table ─────────────────────────────────────────────────────────────

type CompetitorRow = Parameters<typeof CompetitorCard>[0]["competitor"] & { color: string };

function LeagueTable({ competitors, colors, onSelect, selected }: {
  competitors: Parameters<typeof CompetitorCard>[0]["competitor"][];
  colors: string[];
  onSelect: (slug: string) => void;
  selected: string | null;
}) {
  type SortKey = "health" | "name" | "trend" | "positive" | "reviews" | "new";
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const withColor: CompetitorRow[] = competitors.map((c, i) => ({ ...c, color: colors[i] ?? "#60a5fa" }));

  // Health rank is fixed regardless of active sort — medals always reflect health position
  const healthRanked = [...withColor].sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0));
  const healthRankOf = new Map(healthRanked.map((c, i) => [c.slug, i]));

  const trendVal = (c: CompetitorRow) =>
    c.trend?.direction === "up" ? 2 : c.trend?.direction === "flat" ? 1 : c.trend ? 0 : -1;

  const positivePctOf = (c: CompetitorRow) => {
    const s = c.sentimentSummary;
    const st = s ? s.positive + s.negative + s.neutral + s.mixed : 0;
    return st > 0 ? (s!.positive / st) * 100 : 0;
  };

  const sorted = [...withColor].sort((a, b) => {
    let cmp = 0;
    if      (sortKey === "health")   cmp = (a.healthScore ?? 0) - (b.healthScore ?? 0);
    else if (sortKey === "name")     cmp = a.name.localeCompare(b.name);
    else if (sortKey === "trend")    cmp = trendVal(a) - trendVal(b);
    else if (sortKey === "positive") cmp = positivePctOf(a) - positivePctOf(b);
    else if (sortKey === "reviews")  cmp = a.totalReviews - b.totalReviews;
    else if (sortKey === "new")      cmp = (a.newReviews ?? 0) - (b.newReviews ?? 0);
    return sortDir === "desc" ? -cmp : cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => (
    sortKey === col
      ? sortDir === "desc"
        ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "hsl(var(--primary))" }} />
        : <ChevronUp className="h-3 w-3 shrink-0" style={{ color: "hsl(var(--primary))" }} />
      : <ChevronUp className="h-3 w-3 shrink-0 opacity-25" />
  );

  const thBase = "px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-foreground";

  const rankStyle = (healthRank: number): { color: string; label: string } => {
    if (healthRank === 0) return { color: "#fbbf24", label: "🥇" };
    if (healthRank === 1) return { color: "#94a3b8", label: "🥈" };
    if (healthRank === 2) return { color: "#cd7c2f", label: "🥉" };
    return { color: "hsl(var(--muted-foreground))", label: `#${healthRank + 1}` };
  };

  if (withColor.every(c => c.totalReviews === 0)) {
    return (
      <Card className="shadow-none border-border/50 border-dashed">
        <CardContent className="py-12 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No data collected yet</p>
          <p className="text-xs text-muted-foreground font-mono">
            Click <strong className="text-foreground">Run Scraper</strong> above to populate the league table
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-muted-foreground">
            <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-wider w-12">Rank</th>
            <th className={`${thBase} text-left`} onClick={() => handleSort("name")}>
              <div className="flex items-center gap-1">Competitor <SortIcon col="name" /></div>
            </th>
            <th className={`${thBase} text-center w-16`} onClick={() => handleSort("health")}>
              <div className="flex items-center justify-center gap-1">Health <SortIcon col="health" /></div>
            </th>
            <th className={`${thBase} text-center w-14`} onClick={() => handleSort("trend")}>
              <div className="flex items-center justify-center gap-1">Trend <SortIcon col="trend" /></div>
            </th>
            <th className={`${thBase} text-left min-w-[150px]`} onClick={() => handleSort("positive")}>
              <div className="flex items-center gap-1">Sentiment <SortIcon col="positive" /></div>
            </th>
            <th className={`${thBase} text-right w-24`} onClick={() => handleSort("reviews")}>
              <div className="flex items-center justify-end gap-1">Reviews <SortIcon col="reviews" /></div>
            </th>
            <th className={`${thBase} text-right w-20`} onClick={() => handleSort("new")}>
              <div className="flex items-center justify-end gap-1">New <SortIcon col="new" /></div>
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-wider w-40 text-muted-foreground">
              30d Velocity
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((comp) => {
            const healthRank = healthRankOf.get(comp.slug) ?? 0;
            const { color: rankColor, label: rankLabel } = rankStyle(healthRank);
            const s = comp.sentimentSummary;
            const st = s ? s.positive + s.negative + s.neutral + s.mixed : 0;
            const positivePct = st > 0 ? Math.round((s!.positive / st) * 100) : 0;
            const negativePct = st > 0 ? Math.round((s!.negative / st) * 100) : 0;
            const neutralPct  = st > 0 ? Math.round(((s!.neutral + s!.mixed) / st) * 100) : 0;
            const isSelected  = selected === comp.slug;
            return (
              <tr
                key={comp.slug}
                className="border-t border-border/60 hover:bg-muted/20 transition-colors cursor-pointer"
                style={isSelected ? { background: `${comp.color}14` } : {}}
                onClick={() => onSelect(comp.slug)}
              >
                <td className="px-4 py-3">
                  <span className="text-[13px] font-mono font-bold" style={{ color: rankColor }}>
                    {rankLabel}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: comp.color }} />
                    <span className="font-medium">{comp.name}</span>
                    {comp.isStale && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#451a03", color: "#fb923c", border: "1px solid #7c2d12" }}>
                        stale
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    {comp.hasAnalysis && comp.healthScore !== undefined
                      ? <HealthBadge score={comp.healthScore} />
                      : <span className="text-muted-foreground font-mono text-xs">—</span>
                    }
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    {comp.trend
                      ? comp.trend.direction === "up"
                        ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                        : comp.trend.direction === "down"
                          ? <TrendingDown className="h-4 w-4 text-red-400" />
                          : <Minus className="h-4 w-4 text-muted-foreground" />
                      : <span className="text-muted-foreground font-mono text-xs">—</span>
                    }
                  </div>
                </td>

                <td className="px-4 py-3">
                  {s && st > 0 ? (
                    <div className="space-y-1">
                      <div className="flex h-1.5 rounded-full overflow-hidden w-full" style={{ gap: 1 }}>
                        <div style={{ width: `${positivePct}%`, background: "#4ade80" }} />
                        <div style={{ width: `${negativePct}%`, background: "#f87171" }} />
                        <div style={{ flex: 1, background: "hsl(var(--muted))" }} />
                      </div>
                      <div className="flex gap-3 text-[10px] font-mono">
                        <span style={{ color: "#4ade80" }}>{positivePct}%+</span>
                        <span style={{ color: "#f87171" }}>{negativePct}%−</span>
                        <span style={{ color: "#94a3b8" }}>{neutralPct}%~</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">no analysis</span>
                  )}
                </td>

                <td className="px-4 py-3 text-right">
                  <span className="font-mono font-bold">{comp.totalReviews.toLocaleString()}</span>
                  {comp.hasAnalysis && (
                    <div className="text-[10px] text-muted-foreground font-mono">analyzed</div>
                  )}
                </td>

                <td className="px-4 py-3 text-right">
                  {(comp.newReviews ?? 0) > 0
                    ? <span className="text-[11px] font-mono font-bold" style={{ color: "#4ade80" }}>+{comp.newReviews}</span>
                    : <span className="text-muted-foreground font-mono text-xs">—</span>
                  }
                </td>

                <td className="px-4 py-3">
                  <div style={{ width: 144 }}>
                    {comp.velocity && comp.velocity.some(v => v > 0)
                      ? <VelocitySparkline data={comp.velocity} color={comp.color} slug={comp.slug} />
                      : <span className="text-muted-foreground font-mono text-xs">—</span>
                    }
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── digest view ──────────────────────────────────────────────────────────────

function DigestView({ colors }: { colors: string[] }) {
  const { data, isLoading } = useDigest(true);
  const items = data?.items ?? [];
  const totalNew = items.reduce((s, it) => s + it.newReviews, 0);

  const reviewText = (r: Record<string, unknown>) =>
    String(r.text ?? r.body ?? r.pros ?? "").trim().slice(0, 180);
  const reviewTitle = (r: Record<string, unknown>) => String(r.title ?? "").trim();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading digest…
      </div>
    );
  }

  if (totalNew === 0) {
    return (
      <Card className="shadow-none border-border/50 border-dashed">
        <CardContent className="py-12 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No new reviews since last scrape</p>
          <p className="text-xs text-muted-foreground font-mono">Run the scraper to collect fresh data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* summary banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border text-sm"
        style={{ background: "#14532d18", borderColor: "#166534" }}>
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="font-mono font-bold text-emerald-400">+{totalNew} new reviews</span>
        <span className="text-muted-foreground">collected since last scrape snapshot</span>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => {
          const color = colors[i] ?? "#60a5fa";

          if (item.newReviews === 0) {
            return (
              <div key={item.slug}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border/40 opacity-40">
                <span className="h-2 w-2 rounded-full flex-none" style={{ background: color }} />
                <span className="text-sm text-muted-foreground">{item.name}</span>
                <span className="text-xs text-muted-foreground font-mono ml-auto">no new reviews</span>
              </div>
            );
          }

          const hd = item.healthDelta;
          const hdColor = hd === null ? "#94a3b8" : hd > 0 ? "#4ade80" : hd < 0 ? "#f87171" : "#94a3b8";
          const hdLabel = hd !== null ? `${hd > 0 ? "+" : ""}${Math.round(hd)}` : null;

          return (
            <Card key={item.slug} className="shadow-none" style={{ borderColor: `${color}44` }}>
              <CardContent className="p-4 space-y-3">
                {/* header row */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="h-2.5 w-2.5 rounded-full flex-none" style={{ background: color }} />
                  <span className="font-semibold">{item.name}</span>
                  {item.healthScore !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <HealthBadge score={item.healthScore} />
                      {hdLabel && (
                        <span className="text-xs font-mono font-bold" style={{ color: hdColor }}>
                          {hdLabel}
                        </span>
                      )}
                    </div>
                  )}
                  {item.trend && (
                    item.trend.direction === "up"
                      ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                      : item.trend.direction === "down"
                        ? <TrendingDown className="h-4 w-4 text-red-400" />
                        : <Minus className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex gap-1.5 flex-wrap ml-auto">
                    {Object.entries(item.newBySource).map(([src, n]) => (
                      <span key={src} className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${SOURCE_COLORS[src] ?? "#60a5fa"}18`, color: SOURCE_COLORS[src] ?? "#60a5fa", border: `1px solid ${SOURCE_COLORS[src] ?? "#60a5fa"}33` }}>
                        {src} +{n}
                      </span>
                    ))}
                  </div>
                </div>

                {/* recent review snippets */}
                {item.recentReviews.length > 0 && (
                  <div className="space-y-2.5 pl-4 border-l-2" style={{ borderColor: `${color}40` }}>
                    {item.recentReviews.map((r, j) => {
                      const title = reviewTitle(r);
                      const text = reviewText(r);
                      const src = String(r._source ?? "");
                      return (
                        <div key={j} className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: `${SOURCE_COLORS[src] ?? "#60a5fa"}18`, color: SOURCE_COLORS[src] ?? "#60a5fa" }}>
                              {src}
                            </span>
                            {title && <span className="text-xs font-medium truncate">{title}</span>}
                          </div>
                          {text && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                              {text}{text.length >= 180 ? "…" : ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data, isLoading, refetch, isFetching } = useCompetitors();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "features" | "reviews" | "compare" | "digest">("overview");
  const [leagueView, setLeagueView] = useState<"cards" | "table">("cards");

  const competitors = data?.competitors ?? [];
  const selectedComp = competitors.find((c: { slug: string }) => c.slug === selected);

  const totalReviews = competitors.reduce((s: number, c: { totalReviews: number }) => s + c.totalReviews, 0);
  const analyzed = competitors.filter((c: { hasAnalysis: boolean }) => c.hasAnalysis).length;
  const totalNew = competitors.reduce((s: number, c: { newReviews?: number }) => s + (c.newReviews ?? 0), 0);

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Competitive Intelligence</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[1,2,3,4,5].map(i => (
            <Card key={i} className="animate-pulse h-48"><CardContent /></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Competitive Intelligence</h1>
          <p className="text-muted-foreground mt-1">TrueVoice HQ · AI video interview market analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-sm bg-card border border-border px-4 py-2 rounded-md">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              <span className="font-mono font-bold text-foreground">{totalReviews.toLocaleString()}</span>
              <span>data points</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="font-mono font-bold text-foreground">{analyzed}/5</span>
              <span>analyzed</span>
            </div>
            {totalNew > 0 && (
              <>
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono font-bold text-emerald-400">+{totalNew}</span>
                  <span className="text-muted-foreground">new</span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          <NotificationButton />
          <ScheduleButton />
          <ScraperPanel />
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { id: "overview", label: "Overview" },
          { id: "compare", label: "Compare" },
          { id: "features", label: "Feature Priority" },
          { id: "reviews", label: "Raw Reviews" },
          { id: "digest", label: "Digest" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setView(id as "overview" | "features" | "reviews" | "compare" | "digest")}
            className="px-4 py-1.5 text-sm rounded-md transition-colors"
            style={view === id
              ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
              : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <div className="space-y-6">
          {totalNew > 0 && (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 rounded-lg border text-xs"
              style={{ background: "#14532d18", borderColor: "#166534" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="font-mono font-bold text-emerald-400 shrink-0">+{totalNew} new reviews collected</span>
              <span className="text-muted-foreground/40">·</span>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {competitors
                  .filter((c: { newReviews?: number }) => (c.newReviews ?? 0) > 0)
                  .map((c: { slug: string; name: string; newReviews?: number }) => {
                    const idx = competitors.findIndex((x: { slug: string }) => x.slug === c.slug);
                    return (
                      <span key={c.slug} className="font-mono" style={{ color: COMPETITOR_COLORS[idx] ?? "#60a5fa" }}>
                        {c.name} +{c.newReviews}
                      </span>
                    );
                  })}
              </div>
              {data?.lastUpdated && (
                <span className="text-muted-foreground/60 font-mono ml-auto shrink-0">
                  scraped {formatDistanceToNow(new Date(data.lastUpdated), { addSuffix: true })}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-end">
            <div className="flex rounded-md overflow-hidden border border-border">
              <button
                onClick={() => setLeagueView("cards")}
                title="Card view"
                className="px-2.5 py-1.5 transition-colors"
                style={leagueView === "cards"
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                  : { color: "hsl(var(--muted-foreground))" }}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setLeagueView("table")}
                title="League table"
                className="px-2.5 py-1.5 border-l border-border transition-colors"
                style={leagueView === "table"
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                  : { color: "hsl(var(--muted-foreground))" }}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {leagueView === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {competitors.map((comp: Parameters<typeof CompetitorCard>[0]["competitor"], i: number) => (
                <CompetitorCard
                  key={comp.slug}
                  competitor={comp}
                  color={COMPETITOR_COLORS[i] ?? "#60a5fa"}
                  onClick={() => setSelected(selected === comp.slug ? null : comp.slug)}
                  selected={selected === comp.slug}
                />
              ))}
            </div>
          ) : (
            <LeagueTable
              competitors={competitors}
              colors={COMPETITOR_COLORS}
              onSelect={(slug) => setSelected(selected === slug ? null : slug)}
              selected={selected}
            />
          )}

          {selectedComp && (
            <DetailPanel
              slug={selectedComp.slug}
              name={selectedComp.name}
              color={COMPETITOR_COLORS[competitors.findIndex((c: { slug: string }) => c.slug === selectedComp.slug)] ?? "#60a5fa"}
            />
          )}

          {!selected && totalReviews === 0 && (
            <Card className="shadow-none border-border/50 border-dashed">
              <CardContent className="py-12 text-center space-y-3">
                <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No data collected yet</p>
                <p className="text-xs text-muted-foreground font-mono">
                  Click <strong className="text-foreground">Run Scraper</strong> above to collect competitor reviews and run analysis
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {view === "compare" && (
        <ComparePanel
          competitors={competitors}
          colors={COMPETITOR_COLORS}
        />
      )}

      {view === "features" && <FeaturesPanel />}

      {view === "reviews" && (
        <ReviewsPanel
          competitors={competitors}
          competitorColors={COMPETITOR_COLORS}
        />
      )}

      {view === "digest" && (
        <DigestView colors={COMPETITOR_COLORS} />
      )}
    </div>
  );
}
