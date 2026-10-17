"use client";
import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/shell/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useHQ } from "@/components/hq/use-hq";
import { Commits } from "@/components/hq/commits";
import { GraphView } from "@/components/hq/graph";
import { Home } from "@/components/hq/home";
import { Onboarding } from "@/components/hq/onboarding";
import { UpdateBanner } from "@/components/hq/update";
import { Profile } from "@/components/hq/profile";
import { ProjectsTable } from "@/components/hq/projects-table";
import { Project } from "@/components/hq/project";
import { ContextPage } from "@/components/hq/context";
import type { ViewProps } from "@/components/hq/views";
import { ActivityLog } from "@/components/hq/activity";
import { Links } from "@/components/hq/links";
import { Resume } from "@/components/hq/resume";
import { Integrations } from "@/components/hq/integrations";
import { Files } from "@/components/hq/files";
import { LinkGuard } from "@/components/hq/link-guard";
import { NativeMenuGuard } from "@/components/shell/native-menu";
import { Inspector, hasRail } from "@/components/shell/inspector";
import { SelectionProvider } from "@/lib/selection";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar, type CloseMode } from "@/components/shell/tabbar";
import { Topbar } from "@/components/shell/topbar";
import { SearchPalette } from "@/components/shell/search";
import { tabId, tabTitle, type Tab, type TabKind } from "@/components/shell/nav";

const HOME: Tab = { id: "home", kind: "home", title: "Home" };

export default function App() {
  return <SelectionProvider><Shell /></SelectionProvider>;
}

function Shell() {
  const { data, error, busy, run, reload } = useHQ();
  const [onboard, setOnboard] = useState<boolean | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([HOME]);
  const [active, setActive] = useState("home");
  const [rail, setRail] = useState(true);
  const [inspector, setInspector] = useState(true);
  useEffect(() => { try { setInspector(localStorage.getItem("hq-inspector") !== "off"); } catch { /* storage blocked */ } }, []);
  const toggleInspector = () => setInspector((v) => { try { localStorage.setItem("hq-inspector", v ? "off" : "on"); } catch { /* storage blocked */ } return !v; });

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
      case "integrations": return <Integrations {...props} />;
      case "resume": return <Resume {...props} />;
      case "files": return <Files {...props} reload={reload} />;
      case "activity": return <ActivityLog {...props} />;
      case "project": return <Project {...props} arg={tab.arg!} />;
    }
  };

  if (data && onboard === null) return null; // decide welcome vs workspace before painting
  if (onboard) return <><LinkGuard /><NativeMenuGuard /><Onboarding onDone={() => { setOnboard(false); reload(); }} /></>;

  return (
    <div className="flex h-screen flex-col">
      <LinkGuard />
      <NativeMenuGuard />
      <Topbar
        workspace={data?.me.identity.name?.split(" ")[0]?.toLowerCase() || "me"}
        page={tab.title}
        busy={busy}
        search={<SearchPalette d={data} go={open} run={run} />}
        onToggleSidebar={() => setRail((r) => !r)}
        onSync={() => run("sync", "GitHub sync")}
        rail={hasRail(tab.kind) ? { open: inspector, toggle: toggleInspector } : undefined}
      />
      <UpdateBanner />
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
        {data && inspector && hasRail(tab.kind) && <Inspector d={data} tab={tab} go={open} run={run} reload={reload} />}
      </div>
    </div>
  );
}
