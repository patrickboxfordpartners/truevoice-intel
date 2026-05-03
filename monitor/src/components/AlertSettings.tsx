import { useState } from "react";
import { Settings, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertThresholds, PipelineThreshold } from "@/hooks/useAlertThresholds";

const PIPELINE_COLORS: Record<string, string> = {
  "SDR Enrichment": "#3b82f6",
  "Market Signals": "#a78bfa",
  "Mailboxford": "#34d399",
};

interface ThresholdRowProps {
  name: keyof AlertThresholds;
  threshold: PipelineThreshold;
  color: string;
  onChange: (name: keyof AlertThresholds, patch: Partial<PipelineThreshold>) => void;
}

function ThresholdRow({ name, threshold, color, onChange }: ThresholdRowProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 pl-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Min Rate (ops/hr)
          </label>
          <input
            type="number"
            min={0}
            value={threshold.minRatePerHour}
            onChange={e => onChange(name, { minRatePerHour: Math.max(0, Number(e.target.value)) })}
            className="w-full bg-muted/50 border border-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Alert if rate drops below this</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Max Silence (min)
          </label>
          <input
            type="number"
            min={1}
            value={threshold.maxSilenceMinutes}
            onChange={e => onChange(name, { maxSilenceMinutes: Math.max(1, Number(e.target.value)) })}
            className="w-full bg-muted/50 border border-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Alert if no log entry for this long</p>
        </div>
      </div>
    </div>
  );
}

interface AlertSettingsProps {
  thresholds: AlertThresholds;
  onUpdate: (name: keyof AlertThresholds, patch: Partial<PipelineThreshold>) => void;
  onReset: () => void;
  alertCount: number;
}

export function AlertSettings({ thresholds, onUpdate, onReset, alertCount }: AlertSettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative gap-2 border-border/60 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
          Alert Thresholds
          {alertCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
              {alertCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Alert Thresholds</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cards turn amber when a running pipeline drops below the minimum rate or goes silent longer than the configured limit. Settings are saved in your browser.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {(Object.keys(thresholds) as (keyof AlertThresholds)[]).map((name, i) => (
            <div key={name}>
              {i > 0 && <Separator className="mb-5 bg-border/50" />}
              <ThresholdRow
                name={name}
                threshold={thresholds[name]}
                color={PIPELINE_COLORS[name] ?? "#60a5fa"}
                onChange={onUpdate}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
