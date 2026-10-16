"use client";
import { ArrowUpCircle, Loader2, RefreshCw } from "lucide-react";
import { useUpdate } from "@/components/hq/update";
import { ago, LANG_COLOR, type Repo } from "@/lib/hq";
import { STAGE_LABEL, StatusIcon, stageState } from "@/components/kit/status-icon";
import { KINDS, type TabKind } from "./nav";

type Props = {
  active: string;
  pinned: Repo[];
  total: number;
  synced?: number;
  onOpen: (kind: TabKind, arg?: string) => void;
};

const WORKSPACE: TabKind[] = ["home", "profile", "repos", "commits", "graph", "links", "context"];
const RESOURCES: TabKind[] = ["resume", "activity", "integrations"];

function Item({ kind, active, badge, onOpen }: { kind: Exclude<TabKind, "project">; active: boolean; badge?: React.ReactNode; onOpen: Props["onOpen"] }) {
  const { icon: Icon, title } = KINDS[kind];
  return (
    <button
      onClick={() => onOpen(kind)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      <span>{title}</span>
      {badge !== undefined && <span className="ml-auto text-xs text-muted-foreground">{badge}</span>}
    </button>
  );
}

const Heading = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-1 mt-5 flex items-center justify-between px-2.5 text-xs text-muted-foreground/80">
    <span>{children}</span>
    <span>{right}</span>
  </div>
);

/** Left rail: workspace pages, resources, and the pinned projects with their live status. */
function UpdateButton() {
  const u = useUpdate();
  const newer = !!u.info?.newer;
  return (
    <button onClick={() => (newer ? u.install() : u.check(true))} disabled={u.checking || u.installing}
      title={newer ? `Update to ${u.info?.latest}` : "Check for updates"}
      className={`ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition ${newer ? "border-brand/40 bg-brand/15 text-foreground hover:bg-brand/25" : "border-border hover:bg-accent hover:text-foreground"}`}>
      {u.checking || u.installing ? <Loader2 className="size-3 animate-spin" /> : newer ? <ArrowUpCircle className="size-3 text-brand" /> : <RefreshCw className="size-3" />}
      {u.installing ? "Updating" : newer ? "Update" : "Check"}
    </button>
  );
}

export function Sidebar({ active, pinned, total, synced, onOpen }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2.5 py-3">
      <Heading>Workspace</Heading>
      <nav className="space-y-0.5">
        {WORKSPACE.map((k) => (
          <Item key={k} kind={k as Exclude<TabKind, "project">} active={active === k} onOpen={onOpen} badge={k === "repos" ? total : undefined} />
        ))}
      </nav>
      <Heading>Resources</Heading>
      <nav className="space-y-0.5">
        {RESOURCES.map((k) => <Item key={k} kind={k as Exclude<TabKind, "project">} active={active === k} onOpen={onOpen} />)}
      </nav>
      <Heading right={`${pinned.length} pinned`}>Pinned</Heading>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {pinned.map((r) => (
          <button
            key={r.name}
            onClick={() => onOpen("project", r.name)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
              active === `project:${r.name}` ? "bg-sidebar-accent text-foreground" : "text-sidebar-foreground/90 hover:bg-sidebar-accent/50"
            }`}
          >
            <i className="size-3.5 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${LANG_COLOR[r.primary ?? ""] ?? "#71717a"})` }} />
            <span className="truncate">{r.name}</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <StatusIcon state={stageState(r.live)} size={13} />
              {r.live ? STAGE_LABEL[r.live] ?? r.live : "Repo"}
            </span>
          </button>
        ))}
        {!pinned.length && <p className="px-2.5 text-xs text-muted-foreground">Star projects to pin them here.</p>}
      </div>
      <div className="mt-3 flex items-center gap-2 px-2.5 text-xs text-muted-foreground">
        <StatusIcon state={synced ? "done" : "backlog"} size={13} />
        {synced ? `Synced ${ago(new Date(synced * 1000).toISOString())}${ago(new Date(synced * 1000).toISOString()) === "today" ? "" : " ago"}` : "Not synced yet"}
        <UpdateButton />
      </div>
    </aside>
  );
}
