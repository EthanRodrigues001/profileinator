"use client";
import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/shell/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useHQ } from "@/components/hq/use-hq";
import { Commits } from "@/components/hq/commits";
import { GraphView } from "@/components/hq/graph";
import { Home } from "@/components/hq/home";
import { Onboarding } from "@/components/hq/onboarding";
import { Profile } from "@/components/hq/profile";
import { ProjectsTable } from "@/components/hq/projects-table";
import { Project } from "@/components/hq/project";
import { ContextPage } from "@/components/hq/context";
import { ActivityLog, Integrations, Links, Resume, type ViewProps } from "@/components/hq/views";
import { RightPanel } from "@/components/shell/rightpanel";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar, type CloseMode } from "@/components/shell/tabbar";
import { Topbar } from "@/components/shell/topbar";
import { tabId, tabTitle, type Tab, type TabKind } from "@/components/shell/nav";

const HOME: Tab = { id: "home", kind: "home", title: "Home" };

export default function App() {
  const { data, error, busy, run, reload } = useHQ();
  const [onboard, setOnboard] = useState<boolean | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([HOME]);
  const [active, setActive] = useState("home");
  const [rail, setRail] = useState(true);

  // first load only: an empty profile (no name, no repos) starts on the welcome screen
  useEffect(() => {
    if (data && onboard === null) setOnboard(!data.me.identity.name && data.repos.length === 0);
  }, [data, onboard]);

  const open = useCallback((kind: TabKind, arg?: string) => {
    const id = tabId(kind, arg);
    setTabs((t) => (t.some((x) => x.id === id) ? t : [...t, { id, kind, arg, title: tabTitle(kind, arg) }]));
    setActive(id);
  }, []);

  /** Close tabs relative to `id`: itself, all others, everything left/right of it, or all (Home stays as the fallback). */
  const closeTabs = (mode: CloseMode, id: string) => {
    const i = tabs.findIndex((x) => x.id === id);
    const next = tabs.filter((x, j) => (mode === "self" ? x.id !== id : mode === "others" ? x.id === id : mode === "left" ? j >= i : mode === "right" ? j <= i : false));
    const kept = next.length ? next : [HOME];
    setTabs(kept);
    if (!kept.some((x) => x.id === active)) setActive(mode === "self" ? (kept[Math.max(0, i - 1)] ?? HOME).id : mode === "all" ? HOME.id : id);
  };

  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const props = data && ({ d: data, run, go: open } satisfies ViewProps);

  const body = () => {
    if (!props) return null;
    switch (tab.kind) {
      case "home": return <Home {...props} />;
      case "profile": return <Profile {...props} />;
      case "graph": return <GraphView {...props} />;
      case "commits": return <Commits {...props} />;
      case "repos": return <ProjectsTable {...props} />;
      case "links": return <Links {...props} />;
      case "context": return <ContextPage {...props} />;
      case "integrations": return <Integrations />;
      case "resume": return <Resume />;
      case "activity": return <ActivityLog {...props} />;
      case "project": return <Project {...props} arg={tab.arg!} />;
    }
  };

  if (data && onboard === null) return null; // decide welcome vs workspace before painting
  if (onboard) return <Onboarding onDone={() => { setOnboard(false); reload(); }} />;

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        workspace={data?.me.identity.name?.split(" ")[0]?.toLowerCase() || "me"}
        page={tab.title}
        repos={data?.repos ?? []}
        busy={busy}
        onToggleSidebar={() => setRail((r) => !r)}
        onOpenProject={(n) => open("project", n)}
        onSync={() => run("sync", "GitHub sync")}
      />
      <div className="flex min-h-0 flex-1">
        {rail && data && <Sidebar active={active} pinned={data.repos.filter((r) => r.pinned)} total={data.repos.length} synced={data.synced} onOpen={open} />}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar tabs={tabs} active={active} onSelect={setActive} onClose={closeTabs} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && <p className="p-8 text-sm text-bad">Cannot reach hq: {error}. Start it with <code>hq ui</code>.</p>}
            {!data && !error && <div className="mx-auto max-w-3xl space-y-4 p-8"><Skeleton className="h-60" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>}
            <ErrorBoundary key={tab.id}>{body()}</ErrorBoundary>
          </div>
        </main>
        {data && <RightPanel d={data} onOpen={open} />}
      </div>
    </div>
  );
}
