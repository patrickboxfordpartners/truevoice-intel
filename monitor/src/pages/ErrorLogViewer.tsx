import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const COMPETITORS = [
  { name: "HireVue", slug: "hirevue" },
  { name: "SparkHire", slug: "sparkhire" },
  { name: "BrightHire", slug: "brighthire" },
  { name: "Interviewing.io", slug: "interviewing-io" },
  { name: "Metaview", slug: "metaview" },
];

const SOURCES = ["g2", "capterra", "reddit", "twitter", "producthunt"];

const SOURCE_COLORS: Record<string, string> = {
  g2: "#ff492c",
  capterra: "#55c0a2",
  reddit: "#ff4500",
  twitter: "#1d9bf0",
  producthunt: "#da552f",
};

function useCompetitors() {
  return useQuery({
    queryKey: ["intel", "competitors"],
    queryFn: () => fetch("/api/intel/competitors").then((r) => r.json()),
    refetchInterval: 30000,
  });
}

export default function ErrorLogViewer() {
  const { data, isLoading } = useCompetitors();
  const [selected, setSelected] = useState<string | null>(null);

  const competitors = data?.competitors ?? [];
  const selectedComp = competitors.find((c: { slug: string }) => c.slug === selected);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
        <p className="text-muted-foreground mt-1">Scraping status across all competitors and sources.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse h-32"><CardContent /></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((comp: {
            name: string; slug: string; totalReviews: number;
            sources: Array<{ source: string; count: number; scrapedAt?: string }>;
            hasAnalysis: boolean;
          }) => (
            <Card
              key={comp.slug}
              className="shadow-none border-border/50 cursor-pointer hover:border-border transition-colors"
              onClick={() => setSelected(selected === comp.slug ? null : comp.slug)}
            >
              <CardHeader className="py-3 px-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{comp.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {comp.hasAnalysis ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                        analyzed
                      </Badge>
                    ) : comp.totalReviews > 0 ? (
                      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                        needs analysis
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        no data
                      </Badge>
                    )}
                    <span className="text-xs font-mono text-muted-foreground">{comp.totalReviews.toLocaleString()} total</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-3 px-4">
                <div className="grid grid-cols-5 gap-2">
                  {comp.sources.map(src => (
                    <div key={src.source} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: src.count > 0 ? SOURCE_COLORS[src.source] : "hsl(var(--muted-foreground))" }}
                        />
                        <span className="text-xs font-mono text-muted-foreground">{src.source}</span>
                      </div>
                      <p
                        className="text-sm font-mono font-bold"
                        style={{ color: src.count > 0 ? SOURCE_COLORS[src.source] : "hsl(var(--muted-foreground))" }}
                      >
                        {src.count.toLocaleString()}
                      </p>
                      {src.scrapedAt && (
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(src.scrapedAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {competitors.length === 0 && (
            <Card className="shadow-none border-border/50 border-dashed">
              <CardContent className="py-12 text-center space-y-3">
                <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No data collected yet</p>
                <p className="text-xs text-muted-foreground font-mono">
                  Run <code className="bg-muted px-1.5 py-0.5 rounded">bash scraper/run_scrape.sh</code> to start collecting
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="shadow-none border-border/50 bg-muted/10">
        <CardContent className="py-4 px-5">
          <p className="text-xs font-mono text-muted-foreground font-medium uppercase tracking-wider mb-3">Run order</p>
          <div className="flex flex-wrap gap-2 items-center text-xs font-mono text-muted-foreground">
            {["G2 scraper", "Capterra scraper", "Reddit scraper", "Twitter scraper", "ProductHunt scraper", "analyze.py"].map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="bg-muted border border-border px-2 py-0.5 rounded text-foreground">{step}</span>
                {i < 5 && <span>→</span>}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Or run everything at once: <code className="bg-muted px-1.5 py-0.5 rounded">bash scraper/run_scrape.sh</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
