"use client";
import { PromptList } from "./onboarding";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Lock, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip, Initials, RowAction, StageChip, StatusChip } from "@/components/kit/cells";
import { linkState } from "@/components/kit/status-icon";
import { DataTable, type Column } from "@/components/kit/data-table";
import { LANG_COLOR, ago, api, type Integration, type Repo } from "@/lib/hq";
import type { TabKind } from "@/components/shell/nav";
import type { Data } from "./use-hq";

export type ViewProps = { d: Data; run: (op: string, label: string, args?: object) => Promise<void>; go: (kind: TabKind, arg?: string) => void };

export const statusClass = (s?: string) =>
  s === "ok" || s === "connected" || s === "ready" ? "text-ok" : s === "dead" || s === "down" ? "text-bad" : "text-warn";

export { Activity, Languages } from "./charts";

export function RepoRow({ r, run, onOpen }: { r: Repo; run: ViewProps["run"]; onOpen?: (n: string) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-1 py-2.5 text-sm last:border-0 hover:bg-muted/30">
      <button aria-label="Pin" onClick={() => run("pin", r.pinned ? "Unpinned" : "Pinned", { repo: r.name, on: !r.pinned })}>
        <Star className={`size-4 ${r.pinned ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      </button>
      <span onClick={() => onOpen?.(r.name)} className="w-44 shrink-0 cursor-pointer truncate font-medium hover:text-brand">
        {r.name}
        {r.private && <Lock className="ml-1.5 inline size-3 text-muted-foreground" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.tagline || r.desc}</span>
      {r.primary && (
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <i className="size-2 rounded-full" style={{ background: LANG_COLOR[r.primary] ?? "#71717a" }} />
          {r.primary}
        </span>
      )}
      <span className="w-10 text-right text-xs text-muted-foreground">{r.stars ? `★ ${r.stars}` : ""}</span>
      <span className="w-9 text-right text-xs text-muted-foreground">{ago(r.pushed)}</span>
      {r.live && <StageChip live={r.live} />}
    </div>
  );
}

export function Repos({ d, run, go }: ViewProps) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("");
  const langs = useMemo(() => [...new Set(d.repos.map((r) => r.primary).filter(Boolean))].sort() as string[], [d.repos]);
  const list = d.repos.filter((r) => (!lang || r.primary === lang) && (!q || (r.name + (r.desc ?? "")).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search repositories" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All languages</option>
          {langs.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      <Card><CardContent>{list.map((r) => <RepoRow key={r.name} r={r} run={run} onOpen={(n) => go("project", n)} />)}</CardContent></Card>
    </div>
  );
}

type LinkRow = { name: string; url: string; group: "Profile" | "Project sites" };

export function Links({ d, run }: ViewProps) {
  const rows: LinkRow[] = [
    ...d.me.links.map((l) => ({ name: l.label, url: l.url, group: "Profile" as const })),
    ...d.repos.filter((r) => r.pinned && r.homepage).map((r) => ({ name: r.name, url: r.homepage!, group: "Project sites" as const })),
  ];
  const tone = (s?: string) => (s === "ok" ? "ok" : s === "dead" || s === "down" ? "bad" : s === "gated" ? "warn" : "neutral") as "ok" | "bad" | "warn" | "neutral";
  const columns: Column<LinkRow>[] = [
    { key: "name", header: "Name", sort: (r) => r.name.toLowerCase(), className: "w-full @lg:w-56", cell: (r) => <div className="flex items-center gap-2.5"><Initials text={r.name} /><span className="font-medium">{r.name}</span></div> },
    { key: "url", header: "URL", hide: "lg", className: "w-full max-w-0", cell: (r) => <a onClick={(e) => e.stopPropagation()} href={r.url} target="_blank" rel="noreferrer" className="block truncate text-muted-foreground hover:text-brand">{r.url.replace(/^https?:\/\/(www\.)?/, "")}</a> },
    { key: "status", header: "Status", sort: (r) => d.links[r.url]?.status ?? "z", cell: (r) => { const s = d.links[r.url]?.status; return <StatusChip state={linkState(s)}>{s ?? "unchecked"}</StatusChip>; } },
    { key: "code", header: "Code", hide: "xl", align: "right", cell: (r) => <span className="font-mono text-muted-foreground">{d.links[r.url]?.code || "–"}</span> },
    { key: "ms", header: "Latency", hide: "2xl", align: "right", sort: (r) => d.links[r.url]?.ms ?? 0, cell: (r) => <span className="font-mono text-muted-foreground">{d.links[r.url] ? `${d.links[r.url].ms}ms` : "–"}</span> },
    { key: "checked", header: "Checked", hide: "3xl", align: "right", cell: (r) => <span className="text-muted-foreground">{d.links[r.url]?.checked ?? "–"}</span> },
    { key: "act", header: "", className: "w-20 text-right", cell: (r) => <RowAction onClick={() => window.open(r.url, "_blank")}>Open</RowAction> },
  ];
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button size="sm" onClick={() => run("check_links", "Link check")}>Check all links</Button>
        <p className="text-xs text-muted-foreground">“gated” means the site answers but blocks bots (LinkedIn, X). Check those by hand.</p>
      </div>
      <DataTable title="Links" noun="links" rows={rows} columns={columns} rowKey={(r) => r.url + r.name}
        groups={{ by: (r) => r.group, order: ["Profile", "Project sites"], hint: { Profile: "your public profiles", "Project sites": "live URLs of pinned projects" } }}
        searchText={(r) => `${r.name} ${r.url}`} />
    </div>
  );
}

export function Integrations() {
  const [items, setItems] = useState<Integration[]>([]);
  useEffect(() => {
    api<Integration[]>("integrations").then(setItems);
  }, []);
  const tone = (s: string) => (s === "connected" || s === "ready" ? "ok" : "warn") as "ok" | "warn";
  return (
    <div>
      <DataTable title="Integrations" noun="integrations" rows={items} rowKey={(i) => i.id}
        columns={[
          { key: "id", header: "Integration", className: "w-56", cell: (i) => <div className="flex items-center gap-2.5"><Initials text={i.id} /><span className="font-medium capitalize">{i.id}</span></div> },
          { key: "status", header: "Status", cell: (i) => <StatusChip state={i.status === "connected" || i.status === "ready" ? "done" : i.status === "planned" ? "backlog" : "progress"}>{i.status}</StatusChip> },
          { key: "note", header: "What it does", className: "w-full max-w-0", cell: (i) => <span className="block truncate text-muted-foreground">{i.note}</span> },
        ]} />
      <div className="px-4 pb-8 pt-6">
        <h3 className="mb-1 text-sm font-medium">Prompts for your agent</h3>
        <p className="mb-3 text-xs text-muted-foreground">Paste into any agent connected to hq. Whatever it stores is indexed into the graph immediately.</p>
        <PromptList />
      </div>
    </div>
  );
}

export function Resume() {
  const [md, setMd] = useState("");
  useEffect(() => { api<string>("export", { what: "resume" }).then(setMd); }, []);
  return (
    <div>
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-medium">Resume <span className="ml-1 font-normal text-muted-foreground">markdown, built from pinned projects</span></h2>
        <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(md); toast.success("Resume markdown copied"); }}><Copy className="size-3.5" />Copy markdown</Button>
      </div>
      <pre className="whitespace-pre-wrap px-4 py-4 font-mono text-xs leading-relaxed text-muted-foreground">{md || "loading…"}</pre>
    </div>
  );
}

type LogRow = { id: string; date: string; kind: string; text: string };

export function ActivityLog({ d }: ViewProps) {
  const [log, setLog] = useState(d.log);
  useEffect(() => { api<typeof d.log>("log", { limit: 300 }).then(setLog); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows: LogRow[] = [...log].reverse().map((l, i) => ({ id: `${l.ts}-${i}`, date: l.date, kind: l.kind, text: l.text }));
  const dates = [...new Set(rows.map((r) => r.date))];
  return (
    <div>
      <DataTable title="Activity" noun="entries" rows={rows} rowKey={(r) => r.id} searchText={(r) => `${r.kind} ${r.text}`}
        groups={{ by: (r) => r.date, order: dates }}
        columns={[
          { key: "kind", header: "Kind", className: "w-32", cell: (r) => <Chip tone={r.kind === "change" ? "neutral" : r.kind === "decision" ? "brand" : "info"}>{r.kind}</Chip> },
          { key: "text", header: "What happened", className: "w-full max-w-0", cell: (r) => <span className="block truncate">{r.text}</span> },
        ]} />
    </div>
  );
}
