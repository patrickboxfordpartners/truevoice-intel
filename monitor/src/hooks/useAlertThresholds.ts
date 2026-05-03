import { useState, useCallback } from "react";

export interface PipelineThreshold {
  minRatePerHour: number;
  maxSilenceMinutes: number;
}

export interface AlertThresholds {
  "SDR Enrichment": PipelineThreshold;
  "Market Signals": PipelineThreshold;
  "Mailboxford": PipelineThreshold;
}

const STORAGE_KEY = "pipeline_alert_thresholds";

const DEFAULTS: AlertThresholds = {
  "SDR Enrichment": { minRatePerHour: 100, maxSilenceMinutes: 15 },
  "Market Signals": { minRatePerHour: 50, maxSilenceMinutes: 15 },
  "Mailboxford": { minRatePerHour: 80, maxSilenceMinutes: 15 },
};

function load(): AlertThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AlertThresholds>;
    return {
      "SDR Enrichment": { ...DEFAULTS["SDR Enrichment"], ...parsed["SDR Enrichment"] },
      "Market Signals": { ...DEFAULTS["Market Signals"], ...parsed["Market Signals"] },
      "Mailboxford": { ...DEFAULTS["Mailboxford"], ...parsed["Mailboxford"] },
    };
  } catch {
    return DEFAULTS;
  }
}

export interface AlertState {
  lowRate: boolean;
  silent: boolean;
  active: boolean;
  reasons: string[];
}

export function computeAlertState(
  pipeline: { name: string; ratePerHour: number; latestTs?: string; running: boolean },
  threshold: PipelineThreshold
): AlertState {
  const reasons: string[] = [];
  let lowRate = false;
  let silent = false;

  if (pipeline.running && pipeline.ratePerHour < threshold.minRatePerHour) {
    lowRate = true;
    reasons.push(`Rate ${pipeline.ratePerHour} ops/hr < threshold ${threshold.minRatePerHour}`);
  }

  if (pipeline.latestTs) {
    const ageMs = Date.now() - new Date(pipeline.latestTs).getTime();
    const ageMinutes = ageMs / 60000;
    if (ageMinutes > threshold.maxSilenceMinutes) {
      silent = true;
      reasons.push(`Silent for ${Math.round(ageMinutes)}m (threshold ${threshold.maxSilenceMinutes}m)`);
    }
  }

  return { lowRate, silent, active: lowRate || silent, reasons };
}

export function useAlertThresholds() {
  const [thresholds, setThresholds] = useState<AlertThresholds>(load);

  const update = useCallback((name: keyof AlertThresholds, patch: Partial<PipelineThreshold>) => {
    setThresholds(prev => {
      const next = {
        ...prev,
        [name]: { ...prev[name], ...patch },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setThresholds(DEFAULTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return { thresholds, update, reset };
}
