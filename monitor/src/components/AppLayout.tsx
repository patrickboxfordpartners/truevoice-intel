import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Activity, Database, AlertCircle, BarChart3, Users, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetch("/api/health").then(r => r.json()),
    refetchInterval: 30000,
  });
}

function getHealthCheckQueryKey() {
  return ["health"];
}

const COMPETITORS = [
  { name: "HireVue", slug: "hirevue" },
  { name: "SparkHire", slug: "sparkhire" },
  { name: "BrightHire", slug: "brighthire" },
  { name: "Interviewing.io", slug: "interviewing-io" },
  { name: "Metaview", slug: "metaview" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const { data: health } = useHealthCheck();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="border-r border-border bg-card">
          <SidebarHeader className="border-b border-border/50 py-4 px-4">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span>TrueVoice Intel</span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <div className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-success' : 'bg-destructive'}`} />
              API Status: {health?.status === 'ok' ? 'Online' : 'Offline'}
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Overview</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/"}>
                      <Link href="/">
                        <Activity className="h-4 w-4" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/features"}>
                      <Link href="/features">
                        <Layers className="h-4 w-4" />
                        <span>Feature Priority</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/sources"}>
                      <Link href="/sources">
                        <Database className="h-4 w-4" />
                        <span>Data Sources</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Competitors</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {COMPETITORS.map(c => (
                    <SidebarMenuItem key={c.slug}>
                      <SidebarMenuButton asChild isActive={location === `/competitor/${c.slug}`}>
                        <Link href={`/competitor/${c.slug}`}>
                          <Users className="h-4 w-4" />
                          <span>{c.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
