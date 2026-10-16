"use client";
import { X } from "lucide-react";
import { Chip, Initials, StatusChip } from "@/components/kit/cells";
import { DataTable, type Column } from "@/components/kit/data-table";
import { StatusIcon, type State } from "@/components/kit/status-icon";
import { TechBadge } from "@/components/kit/tech-badge";
import type { Achievement, ClaimGap, Positioning, Repo, TechEntry } from "@/lib/hq";

/** Evidence tier -> state icon, so a glance at the column shows how solid each skill is. */
export const TIER_STATE: Record<string, State> = { Core: "done", Regular: "review", Working: "progress", Tried: "todo", Past: "backlog" };
const TIER_HINT: Record<string, string> = {
  Core: "15+ projects and still in use", Regular: "5-14 projects", Working: "2-4 projects, recent use", Tried: "used once, recently", Past: "not touched recently",
};

const CATEGORIES = ["Frontend & UI", "Backend, data & auth", "AI / ML", "Mobile, desktop & extensions", "Tooling & testing", "Languages"];

/** Every technology with the evidence behind it, grouped by area. Tier comes from how many projects use it and how recently. */
export function TechStack({ items }: { items: TechEntry[] }) {
  const cols: Column<TechEntry>[] = [
    { key: "name", header: "Technology", sort: (r) => r.name.toLowerCase(), className: "w-64", cell: (r) => <TechBadge name={r.name} /> },
    { key: "tier", header: "Evidence", hint: "Core 15+ projects and current, Regular 5-14, Working 2-4 with recent use, Tried once, Past not touched recently.",
      sort: (r) => ["Core", "Regular", "Working", "Tried", "Past"].indexOf(r.tier), cell: (r) => <StatusChip state={TIER_STATE[r.tier] ?? "todo"}>{r.tier}</StatusChip> },
    { key: "n", header: "Projects", align: "right", hide: "lg", sort: (r) => r.projects ?? 0, cell: (r) => <span className="font-mono text-muted-foreground">{r.projects ?? "–"}</span> },
    { key: "first", header: "First seen", hide: "2xl", sort: (r) => r.first_seen ?? "", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.first_seen ?? "–"}</span> },
    { key: "last", header: "Last used", hide: "xl", sort: (r) => r.last_used ?? "", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.last_used ?? "–"}</span> },
    { key: "recent", header: "Recent projects", hide: "3xl", className: "w-full max-w-0", cell: (r) => <span className="block truncate text-muted-foreground">{(r.recent ?? []).join(", ") || r.note || "–"}</span> },
  ];
  return (
    <DataTable noun="technologies" rows={items} columns={cols} rowKey={(r) => r.category + r.name} searchText={(r) => `${r.name} ${r.category} ${r.tier} ${(r.recent ?? []).join(" ")}`}
      filters={[{ key: "tier", label: "Evidence", options: Object.keys(TIER_HINT), match: (r, v) => r.tier === v }]}
      groups={{ by: (r) => r.category, order: CATEGORIES }} />
  );
}

const KIND_STATE: Record<string, State> = { Hackathon: "review", Competition: "progress", Course: "done", Certification: "done", Award: "done", Event: "todo" };

export function Achievements({ items }: { items: (string | Achievement)[] }) {
  const rows: Achievement[] = items.map((x) => (typeof x === "string" ? { title: x, kind: "Event", date: "" } : x));
  const cols: Column<Achievement>[] = [
    { key: "t", header: "Achievement", className: "w-full max-w-0", sort: (r) => r.title.toLowerCase(), cell: (r) => <span className="block truncate font-medium">{r.title}</span> },
    { key: "k", header: "Kind", sort: (r) => r.kind, cell: (r) => <StatusChip state={KIND_STATE[r.kind] ?? "todo"}>{r.kind}</StatusChip> },
    { key: "d", header: "When", align: "right", sort: (r) => r.date, cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.date || "–"}</span> },
  ];
  return <DataTable toolbar={false} noun="achievements" rows={rows} columns={cols} rowKey={(r) => r.title + r.date} empty="No achievements yet." />;
}

/** Skills listed on a profile with no code behind them, and what to do about each. */
export function ClaimGaps({ items }: { items: ClaimGap[] }) {
  const cols: Column<ClaimGap>[] = [
    { key: "n", header: "Claimed", className: "w-64 max-w-64", cell: (r) => <span className="flex items-center gap-2 font-medium"><StatusIcon state="failed" size={13} /><span className="truncate">{r.name}</span></span> },
    { key: "w", header: "Listed on", hide: "lg", cell: (r) => <Chip>{r.where}</Chip> },
    { key: "e", header: "Evidence found", hide: "2xl", className: "w-1/2 max-w-0", cell: (r) => <span className="block truncate text-muted-foreground">{r.evidence}</span> },
    { key: "a", header: "Do this", className: "w-1/2 max-w-0", cell: (r) => <span className="block truncate">{r.action ?? "–"}</span> },
  ];
  return <DataTable toolbar={false} noun="claims" rows={items} columns={cols} rowKey={(r) => r.name} empty="Nothing flagged. Every listed skill has evidence." />;
}

/** Projects by category with counts: the shape of the whole body of work. */
export function ProjectMix({ repos, go }: { repos: Repo[]; go: (name: string) => void }) {
  const order = ["Showcase", "Hackathon", "Local-only", "Private", "Older"];
  const by = (c: string) => repos.filter((r) => r.category === c);
  return (
    <div>
      {order.map((c) => (
        <div key={c} className="border-b border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <StatusIcon state={c === "Showcase" ? "done" : c === "Private" ? "backlog" : "todo"} size={12} />{c}<span className="text-muted-foreground/60">{by(c).length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {by(c).map((r) => (
              <button key={r.name} onClick={() => go(r.name)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card/40 pl-1 pr-2 text-xs transition hover:border-brand/40">
                <Initials text={r.name} className="size-5 text-[9px]" />{r.name}
              </button>
            ))}
            {!by(c).length && <span className="text-xs text-muted-foreground">None</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Headlines, summaries, what to avoid and the honest skill order. */
export function PositioningView({ p, onDel, field }: { p: Positioning; onDel: (path: string) => void; field: (label: string, value: string, path: string, multi?: boolean) => React.ReactNode }) {
  return (
    <div>
      {field("Direction", p.direction ?? "", "me/positioning/direction", true)}
      {(p.headlines ?? []).map((h, i) => field(`Headline · ${h.label}`, h.text, `me/positioning/headlines/${i}/text`))}
      {(p.summaries ?? []).map((s, i) => field(`Summary · ${s.label}`, s.text, `me/positioning/summaries/${i}/text`, true))}
      <div className="border-b border-border/60 px-4 py-4">
        <div className="mb-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Avoid</div>
        <ul className="space-y-1.5 text-[13px]">
          {(p.avoid ?? []).map((a, i) => (
            <li key={a} className="group flex items-center gap-2"><StatusIcon state="failed" size={12} />{a}
              <button aria-label="Remove" onClick={() => onDel(`me/positioning/avoid/${i}`)} className="rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-4 py-4">
        <div className="mb-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Skill order, strongest first</div>
        <ol className="flex flex-wrap gap-1.5">
          {(p.skill_order ?? []).map((s, i) => <li key={s} className="flex items-center gap-1.5"><span className="font-mono text-[11px] text-muted-foreground/60">{String(i + 1).padStart(2, "0")}</span><TechBadge name={s} /></li>)}
        </ol>
      </div>
    </div>
  );
}
