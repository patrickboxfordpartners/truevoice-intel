import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Star, MessageSquare, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";

const COMPETITORS: Record<string, string> = {
  hirevue: "HireVue",
  sparkhire: "SparkHire",
  brighthire: "BrightHire",
  "interviewing-io": "Interviewing.io",
  metaview: "Metaview",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-emerald-400",
  negative: "text-red-400",
  neutral: "text-muted-foreground",
};

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  negative: "bg-red-500/10 text-red-400 border-red-500/30",
  neutral: "bg-muted/40 text-muted-foreground",
};

export default function CompetitorDetail({ params }: { params?: { slug: string } }) {
  const routeParams = useParams<{ slug: string }>();
  const slug = params?.slug ?? routeParams?.slug ?? "hirevue";
  const name = COMPETITORS[slug] ?? slug;

  const reviews = useQuery({
    queryKey: ["intel", slug, "reviews"],
    queryFn: () => fetch(`/api/intel/${slug}/reviews?limit=50`).then(r => r.json()),
  });

  const analysis = useQuery({
    queryKey: ["intel", slug, "analysis"],
    queryFn: () => fetch(`/api/intel/${slug}/analysis`).then(r => r.json()),
  });

  const themes = useQuery({
    queryKey: ["intel", slug, "themes"],
    queryFn: () => fetch(`/api/intel/${slug}/themes`).then(r => r.json()),
  });

  const gap = useQuery({
    queryKey: ["intel", slug, "gap"],
    queryFn: () => fetch(`/api/intel/${slug}/gap`).then(r => r.json()),
  });

  const sentiment = analysis.data?.sentiment;
  const total = (sentiment?.positive ?? 0) + (sentiment?.negative ?? 0) + (sentiment?.neutral ?? 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <button className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </button>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-semibold">{name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
          <p className="text-muted-foreground mt-1">Competitive intelligence deep dive</p>
        </div>
        {sentiment && total > 0 && (
          <div className="flex gap-3">
            {(["positive", "negative", "neutral"] as const).map(s => (
              <Card key={s} className="shadow-none border-border/50 py-2 px-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground capitalize">{s}</div>
                <div className={`text-xl font-bold font-mono mt-0.5 ${SENTIMENT_COLORS[s]}`}>
                  {total > 0 ? Math.round((sentiment[s] / total) * 100) : 0}%
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Tabs defaultValue="reviews">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="gap">Gap Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="mt-4">
          <div className="border border-border rounded-lg overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[100px] font-mono text-xs uppercase tracking-wider text-muted-foreground">Source</TableHead>
                  <TableHead className="w-[80px] font-mono text-xs uppercase tracking-wider text-muted-foreground">Rating</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Review</TableHead>
                  <TableHead className="w-[100px] font-mono text-xs uppercase tracking-wider text-muted-foreground">Sentiment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Loading reviews…</TableCell></TableRow>
                ) : reviews.data?.reviews?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No reviews yet — run the scraper first</TableCell></TableRow>
                ) : (
                  (reviews.data?.reviews ?? []).map((r: {
                    source: string; rating?: number; text: string; sentiment?: string;
                  }, i: number) => (
                    <TableRow key={i} className="border-border/40 align-top">
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{r.source}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.rating != null ? (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                            {r.rating}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xl">
                        <p className="line-clamp-3">{r.text}</p>
                      </TableCell>
                      <TableCell>
                        {r.sentiment && (
                          <Badge variant="outline" className={`text-[10px] font-mono ${SENTIMENT_BADGE[r.sentiment] ?? ""}`}>
                            {r.sentiment}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="themes" className="mt-4">
          {themes.isLoading ? (
            <div className="text-center text-muted-foreground py-12">Loading themes…</div>
          ) : !themes.data?.themes?.length ? (
            <div className="text-center text-muted-foreground py-12">No themes yet — run analyze.py first</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {themes.data.themes.map((t: { theme: string; count: number; sentiment?: string; examples?: string[] }, i: number) => (
                <Card key={i} className="shadow-none border-border/50">
                  <CardHeader className="py-3 px-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.theme}
                      </CardTitle>
                      <span className="text-xs font-mono text-muted-foreground">{t.count}×</span>
                    </div>
                  </CardHeader>
                  {t.examples?.length ? (
                    <CardContent className="py-3 px-4 space-y-1.5">
                      {t.examples.slice(0, 2).map((ex, j) => (
                        <p key={j} className="text-xs text-muted-foreground line-clamp-2 italic">"{ex}"</p>
                      ))}
                    </CardContent>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="gap" className="mt-4">
          {gap.isLoading ? (
            <div className="text-center text-muted-foreground py-12">Loading gap analysis…</div>
          ) : !gap.data?.content ? (
            <div className="text-center text-muted-foreground py-12">No gap analysis yet — run analyze.py first</div>
          ) : (
            <Card className="shadow-none border-border/50">
              <CardContent className="py-5 px-6 prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight">
                <ReactMarkdown>{gap.data.content}</ReactMarkdown>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
