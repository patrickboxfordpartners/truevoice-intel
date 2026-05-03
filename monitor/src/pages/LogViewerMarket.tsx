import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle } from "lucide-react";

const PRIORITY_COLORS = ["bg-red-500", "bg-orange-500", "bg-amber-400", "bg-emerald-500", "bg-sky-500"];

export default function FeaturePriority() {
  const { data, isLoading } = useQuery({
    queryKey: ["intel", "features"],
    queryFn: () => fetch("/api/intel/features").then(r => r.json()),
    refetchInterval: 60000,
  });

  const features: Array<{
    feature: string; priority: number; competitors: string[];
    rationale?: string; frequency?: number;
  }> = data?.features ?? [];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature Priority</h1>
        <p className="text-muted-foreground mt-1">
          AI-ranked features TrueVoice HQ should build based on competitor gaps.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1,2,3,4].map(i => (
            <Card key={i} className="animate-pulse h-32 shadow-none border-border/50"><CardContent /></Card>
          ))}
        </div>
      ) : features.length === 0 ? (
        <Card className="shadow-none border-border/50 border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No feature priorities yet</p>
            <p className="text-xs text-muted-foreground font-mono">
              Run <code className="bg-muted px-1.5 py-0.5 rounded">bash scraper/run_scrape.sh</code> to generate
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {features.map((f, i) => (
            <Card key={i} className="shadow-none border-border/50">
              <CardHeader className="py-3 px-5 bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${PRIORITY_COLORS[Math.min(i, PRIORITY_COLORS.length - 1)]}`}>
                    {i + 1}
                  </div>
                  <CardTitle className="text-base font-semibold">{f.feature}</CardTitle>
                  <div className="ml-auto flex items-center gap-2">
                    {f.frequency != null && (
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> {f.frequency} mentions
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono ${
                        f.priority >= 8 ? "text-red-400 border-red-500/30 bg-red-500/10" :
                        f.priority >= 6 ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                        "text-muted-foreground"
                      }`}
                    >
                      priority {f.priority}/10
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-3 px-5 space-y-2">
                {f.rationale && (
                  <p className="text-sm text-muted-foreground">{f.rationale}</p>
                )}
                {f.competitors?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider self-center mr-1">gap in:</span>
                    {f.competitors.map(c => (
                      <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
