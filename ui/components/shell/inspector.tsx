"use client";
import { useEffect, useState } from "react";
import { Activity, BarChart3, Bot, CircleHelp, Eye, FileText, FolderGit2, GitCommitHorizontal, HardDrive, HeartPulse, History, Info, Link2, ListChecks, ListTree, Pencil, Plug, Boxes, Sparkles, Sun, Users, type LucideIcon } from "lucide-react";
import { Tip } from "@/components/kit/tip";
import { cn } from "@/lib/utils";
import { useSelection } from "@/lib/selection";
import type { Data } from "@/components/hq/use-hq";
import { Agent, Health, Today } from "@/components/hq/rail/home";
import { Brief, Complete, Visible } from "@/components/hq/rail/profile";
import { ActivityTab, Ask, Checks, Details } from "@/components/hq/rail/projects";
import {
  ActivityDetails, ActivitySummary, Authors, CommitDetail, ContextAnswer, ContextDefaults, ContextMissing, FileDetails, FileStorage,
  IntegrationsCaps, IntegrationsStatus, LinkHistory, LinkStatus, LinkUsedIn, RepoStats,
} from "@/components/hq/rail/pages";
import type { PanelProps } from "@/components/hq/rail/shared";
import type { Tab, TabKind } from "./nav";

type Def = { id: string; label: string; icon: LucideIcon };

/** Tabs of the inspector for each page. Pages missing here (Graph, Resume) have no rail. */
const TABS: Partial<Record<TabKind, Def[]>> = {
  home: [{ id: "today", label: "Today", icon: Sun }, { id: "health", label: "Health", icon: HeartPulse }, { id: "agent", label: "Agent", icon: Bot }],
  profile: [{ id: "complete", label: "Completeness", icon: ListChecks }, { id: "visible", label: "Visibility", icon: Eye }, { id: "brief", label: "Agent brief", icon: FileText }],
  repos: [{ id: "details", label: "Details", icon: Info }, { id: "checks", label: "Checks", icon: ListChecks }, { id: "activity", label: "Activity", icon: History }, { id: "ask", label: "Ask", icon: Sparkles }],
  project: [{ id: "details", label: "Details", icon: Info }, { id: "checks", label: "Checks", icon: ListChecks }, { id: "activity", label: "Activity", icon: History }, { id: "ask", label: "Ask", icon: Sparkles }],
  commits: [{ id: "commit", label: "Commit", icon: GitCommitHorizontal }, { id: "repo", label: "Repo", icon: FolderGit2 }, { id: "authors", label: "Authors", icon: Users }],
  links: [{ id: "status", label: "Status", icon: Activity }, { id: "history", label: "History", icon: History }, { id: "used", label: "Used in", icon: Link2 }],
  context: [{ id: "answer", label: "Answer", icon: Pencil }, { id: "missing", label: "Missing", icon: CircleHelp }, { id: "defaults", label: "Stored answers", icon: ListTree }],
  files: [{ id: "details", label: "Details", icon: Info }, { id: "storage", label: "Storage", icon: HardDrive }],
  activity: [{ id: "details", label: "Details", icon: Info }, { id: "summary", label: "Summary", icon: BarChart3 }],
  integrations: [{ id: "status", label: "Status", icon: Plug }, { id: "caps", label: "Capabilities", icon: Boxes }],
};

export const hasRail = (kind: TabKind) => !!TABS[kind];

const KEY = (k: TabKind) => `hq-rail-tab:${k === "project" ? "repos" : k}`;

/**
 * Right-hand inspector. Its content depends on the page and on what is selected there. Tabs are a thin icon strip on the
 * far edge (so they cost no vertical space); the active one is named in the header.
 */
export function Inspector({ d, tab, go, run, reload }: { d: Data; tab: Tab; go: PanelProps["go"]; run: PanelProps["run"]; reload: PanelProps["reload"] }) {
  const defs = TABS[tab.kind] ?? [];
  const { sel } = useSelection();
  const [active, setActive] = useState<string>(defs[0]?.id ?? "");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY(tab.kind)); } catch { /* storage blocked */ }
    setActive(defs.some((x) => x.id === saved) ? saved! : defs[0]?.id ?? "");
  }, [tab.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => { setActive(id); try { localStorage.setItem(KEY(tab.kind), id); } catch { /* storage blocked */ } };
  const cur = defs.find((x) => x.id === active) ?? defs[0];
  if (!cur) return null;

  // the project the panels talk about: the open project page, or the row picked in the table
  const subject = tab.kind === "project" ? tab.arg ?? null : sel?.kind === "project" ? sel.name : null;
  const p: PanelProps = { d, go, run, reload };
  const P = { ...p, subject };

  const body = (() => {
    switch (`${tab.kind === "project" ? "repos" : tab.kind}:${cur.id}`) {
      case "home:today": return <Today {...p} />;
      case "home:health": return <Health {...p} />;
      case "home:agent": return <Agent {...p} />;
      case "profile:complete": return <Complete {...p} />;
      case "profile:visible": return <Visible {...p} />;
      case "profile:brief": return <Brief />;
      case "repos:details": return <Details {...P} />;
      case "repos:checks": return <Checks {...P} />;
      case "repos:activity": return <ActivityTab {...P} />;
      case "repos:ask": return <Ask {...P} />;
      case "commits:commit": return <CommitDetail />;
      case "commits:repo": return <RepoStats {...p} />;
      case "commits:authors": return <Authors />;
      case "links:status": return <LinkStatus {...p} />;
      case "links:history": return <LinkHistory {...p} />;
      case "links:used": return <LinkUsedIn {...p} />;
      case "context:answer": return <ContextAnswer {...p} />;
      case "context:missing": return <ContextMissing {...p} />;
      case "context:defaults": return <ContextDefaults {...p} />;
      case "files:details": return <FileDetails {...p} />;
      case "files:storage": return <FileStorage />;
      case "activity:details": return <ActivityDetails {...p} />;
      case "activity:summary": return <ActivitySummary {...p} />;
      case "integrations:status": return <IntegrationsStatus {...p} />;
      case "integrations:caps": return <IntegrationsCaps />;
      default: return null;
    }
  })();

  return (
    <aside className="hidden w-[22rem] shrink-0 border-l border-border xl:flex">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
          <cur.icon className="size-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">{cur.label}</span>
          {subject && (tab.kind === "repos" || tab.kind === "project") && <span className="ml-auto max-w-[50%] truncate rounded-full border border-border bg-muted/40 px-2 py-px text-[11px] text-muted-foreground">{subject}</span>}
        </div>
        <div key={`${tab.kind}:${cur.id}:${subject ?? ""}`} className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
      <nav aria-label="Inspector tabs" className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border py-2">
        {defs.map((x) => (
          <Tip key={x.id} side="left" content={x.label}>
            <button onClick={() => choose(x.id)} aria-label={x.label} aria-current={x.id === cur.id}
              className={cn("grid size-8 place-items-center rounded-lg transition", x.id === cur.id ? "border border-border bg-card text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
              <x.icon className="size-4" />
            </button>
          </Tip>
        ))}
      </nav>
    </aside>
  );
}
