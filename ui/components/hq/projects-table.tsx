"use client";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Initials, RowAction, StageChip } from "@/components/kit/cells";
import { StatusIcon, readyState } from "@/components/kit/status-icon";
import { DataTable, type Column, type FilterDef, type Groups } from "@/components/kit/data-table";
import { LANG_COLOR, ago, type Repo } from "@/lib/hq";
import { isLocal } from "@/lib/hq";
import { useSelection } from "@/lib/selection";
import type { ViewProps } from "./views";

/** The five things a project needs before it earns a place on a resume. One point each. */
export const checks = (r: Repo) => [
  { label: "Tagline", ok: !!r.tagline, fix: "one line a recruiter should read" },
  { label: "Stack listed", ok: !!(r.stack?.length || r.detected?.length), fix: "technologies used (Sync GitHub detects them)" },
  { label: "Resume bullets", ok: !!r.bullets?.length, fix: "what you built, with outcomes" },
  { label: "Live site responds", ok: !!(r.homepage && r.live === "ok"), fix: "a working URL, link check passing" },
  { label: "Description", ok: !!(r.desc || r.tagline), fix: "GitHub description or tagline" },
];
export const readiness = (r: Repo) => checks(r).filter((c) => c.ok).length;

/** Readiness as a state icon plus n/5; hover for the checklist. */
function Meter({ r }: { r: Repo }) {
  const n = readiness(r);
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-default items-center gap-2" />}>
        <StatusIcon state={readyState(n)} />
        <span className="font-mono text-[11px] text-muted-foreground">{n}/5</span>
      </TooltipTrigger>
      <TooltipContent side="left" className="flex-col items-start gap-1 py-2">
        <div className="font-medium">{r.name}: resume readiness {n}/5</div>
        {checks(r).map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <StatusIcon state={c.ok ? "done" : "todo"} size={12} />
            <span>{c.label}{!c.ok && <span className="opacity-60"> · {c.fix}</span>}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

const GROUPS: Groups<Repo> = {
  by: (r) => (r.pinned ? "Pinned" : r.category ?? (isLocal(r) ? "Local-only" : r.live === "ok" ? "Live" : r.fork ? "Forks" : "Repos")),
  order: ["Pinned", "Showcase", "Hackathon", "Local-only", "Live", "Repos", "Forks", "Older", "Private"],
  // Pinned stays open and the rest fold away; with nothing pinned yet, everything stays open.
  collapsedByDefault: (rows) => (rows.some((r) => r.pinned) ? ["Showcase", "Hackathon", "Local-only", "Live", "Repos", "Forks", "Older", "Private"] : []),
  hint: {
    Pinned: "shown on your resume and profile",
    Showcase: "recent and substantial work",
    Hackathon: "hackathon and college projects",
    "Local-only": "not on GitHub yet",
    Live: "working site, not categorised",
    Repos: "code only",
    Forks: "forked from someone else",
    Older: "2020 to 2024",
    Private: "business work, keep off public profiles",
  },
};

/** Projects as a dense grouped table: pinned first, then live sites, then plain repos. */
export function ProjectsTable({ d, run, go }: ViewProps) {
  const { sel, setSel } = useSelection();
  const langs = [...new Set(d.repos.map((r) => r.primary).filter(Boolean))].sort() as string[];

  const columns: Column<Repo>[] = [
    {
      key: "name", header: "Project", sort: (r) => r.name.toLowerCase(), className: "w-full max-w-0 @xl:w-64 @xl:max-w-none",
      cell: (r) => <div className="flex min-w-0 items-center gap-2.5"><Initials text={r.name} /><span className="truncate font-medium">{r.name}</span></div>,
    },
    { key: "why", header: "What it is", hide: "xl", className: "w-full max-w-0", cell: (r) => <span className="block truncate text-muted-foreground">{r.tagline || r.desc || r.summary || "–"}</span> },
    {
      key: "lang", header: "Language", hide: "lg", sort: (r) => r.primary ?? "",
      cell: (r) => r.primary ? <span className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: LANG_COLOR[r.primary] ?? "#71717a" }} />{r.primary}</span> : <span className="text-muted-foreground/50">–</span>,
    },
    { key: "ready", header: "Ready", hint: "Resume readiness: tagline, stack, bullets, live site, description. Hover a row's bars for details.", hide: "2xl", sort: readiness, cell: (r) => <Meter r={r} /> },
    {
      key: "stage", header: "Stage", sort: (r) => r.live ?? "z",
      cell: (r) => <StageChip live={r.live} local={isLocal(r)} />,
    },
    {
      key: "pinned", header: "Pinned", sort: (r) => (r.pinned ? 1 : 0),
      cell: (r) => <span onClick={(e) => e.stopPropagation()}><Switch size="sm" checked={r.pinned} onCheckedChange={(v) => run("pin", v ? "Pinned" : "Unpinned", { repo: r.name, on: v })} /></span>,
    },
    { key: "stars", header: "Stars", sort: (r) => r.stars ?? 0, align: "right", defaultHidden: true, cell: (r) => <span className="font-mono text-muted-foreground">{r.stars || "–"}</span> },
    { key: "updated", header: "Updated", hide: "lg", sort: (r) => r.pushed ?? "", align: "right", cell: (r) => <span className="text-muted-foreground">{r.pushed ? ago(r.pushed) : "–"}</span> },
    { key: "open", header: "", className: "w-20 text-right", cell: (r) => <RowAction onClick={() => go("project", r.name)}>Open</RowAction> },
  ];

  const filters: FilterDef<Repo>[] = [
    { key: "lang", label: "Language", options: langs, match: (r, v) => r.primary === v },
    { key: "vis", label: "Visibility", options: ["Public", "Private"], match: (r, v) => (v === "Private") === !!r.private },
    { key: "stage", label: "Stage", options: ["Live", "Repo only", "Local only"], match: (r, v) => (v === "Live" ? r.live === "ok" : v === "Local only" ? isLocal(r) : !isLocal(r) && r.live !== "ok") },
    { key: "ready", label: "Readiness", options: ["Ready (3+)", "Needs work"], match: (r, v) => (v === "Needs work") === (readiness(r) < 3) },
  ];

  return (
    <DataTable
      title="Projects"
      noun="projects"
      rows={d.repos}
      columns={columns}
      filters={filters}
      groups={GROUPS}
      rowKey={(r) => r.name}
      searchText={(r) => `${r.name} ${r.desc ?? ""} ${r.tagline ?? ""} ${r.summary ?? ""} ${r.category ?? ""} ${r.primary ?? ""} ${(r.stack ?? []).join(" ")}`}
      onRowClick={(r) => setSel({ kind: "project", name: r.name })}
      selectedKey={sel?.kind === "project" ? sel.name : undefined}
    />
  );
}
