"use client";
import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, Initials, RowAction, StatusChip } from "@/components/kit/cells";
import { DataTable, type Column, type FilterDef } from "@/components/kit/data-table";
import { Tip } from "@/components/kit/tip";
import { linkState } from "@/components/kit/status-icon";
import { ago, api } from "@/lib/hq";
import { useSelection } from "@/lib/selection";
import type { ViewProps } from "./views";

type Row = { name: string; url: string; kind: "Profile" | "Site" | "Repo"; project?: string; resume?: boolean };

const STATUS = (s?: string) => (s === "ok" ? "Live" : s === "gated" ? "Gated" : s === "dead" || s === "down" ? "Broken" : "Unchecked");
const pretty = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** Every link an application could show: your profile links, and the live site and GitHub repo of each pinned project. */
export function Links({ d, run, go }: ViewProps) {
  const { sel, setSel } = useSelection();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const rows: Row[] = [
    ...d.me.links.map((l) => ({ name: l.label, url: l.url, kind: "Profile" as const, resume: !!(l as { resume?: boolean }).resume })),
    ...d.repos.filter((r) => r.pinned && r.homepage).map((r) => ({ name: r.name, url: r.homepage!, kind: "Site" as const, project: r.name })),
    // private repos are left out on purpose: a plain web request to them would always look broken
    ...d.repos.filter((r) => r.pinned && !r.private && r.url).map((r) => ({ name: r.name, url: r.url!, kind: "Repo" as const, project: r.name })),
  ];
  const st = (u: string) => d.links[u];
  const count = (label: string) => rows.filter((r) => STATUS(st(r.url)?.status) === label).length;

  const recheck = async (url: string) => {
    setBusy(url);
    try { await api("check_link", { url }); toast.success("Checked"); } catch (e) { toast.error((e as Error).message); }
    await run("links", "Refreshed");
    setBusy(null);
  };
  const copy = async (url: string) => { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1200); };

  const columns: Column<Row>[] = [
    { key: "name", header: "Link", sort: (r) => r.name.toLowerCase(), className: "w-full @lg:w-60", cell: (r) => (
      <div className="flex items-center gap-2.5"><Initials text={r.name} />
        <div className="min-w-0"><div className="truncate font-medium">{r.name}</div>{r.project && <button onClick={(e) => { e.stopPropagation(); go("project", r.project!); }} className="text-[11px] text-muted-foreground hover:text-foreground">open project</button>}</div>
      </div>) },
    { key: "kind", header: "Type", sort: (r) => r.kind, hide: "lg", cell: (r) => <div className="flex items-center gap-1.5"><Chip tone={r.kind === "Profile" ? "brand" : r.kind === "Site" ? "info" : "neutral"}>{r.kind}</Chip>{r.resume && <Tip content="Shown on your resume"><Chip tone="ok">Resume</Chip></Tip>}</div> },
    { key: "url", header: "Address", hide: "xl", className: "w-full max-w-0", cell: (r) => (
      <div className="flex min-w-0 items-center gap-1.5">
        <a onClick={(e) => e.stopPropagation()} href={r.url} target="_blank" rel="noreferrer" className="truncate text-muted-foreground hover:text-foreground hover:underline">{pretty(r.url)}</a>
        <Tip content={copied === r.url ? "Copied" : "Copy address"}><button onClick={(e) => { e.stopPropagation(); copy(r.url); }} className="shrink-0 rounded p-1 text-muted-foreground/60 transition hover:bg-accent hover:text-foreground">{copied === r.url ? <Check className="size-3" /> : <Copy className="size-3" />}</button></Tip>
      </div>) },
    { key: "status", header: "Status", sort: (r) => STATUS(st(r.url)?.status), cell: (r) => { const s = st(r.url)?.status; return <Tip content={s === "gated" ? "The site answers but blocks automated checks (LinkedIn, X). Open it by hand." : s === "dead" || s === "down" ? `Check failed (${st(r.url)?.code || "no response"})` : undefined}><StatusChip state={linkState(s)}>{STATUS(s)}</StatusChip></Tip>; } },
    { key: "ms", header: "Speed", hide: "2xl", align: "right", sort: (r) => st(r.url)?.ms ?? 0, cell: (r) => <span className="font-mono text-muted-foreground">{st(r.url) ? `${st(r.url).ms}ms` : "–"}</span> },
    { key: "checked", header: "Checked", hide: "xl", align: "right", sort: (r) => st(r.url)?.checked ?? "", cell: (r) => <span className="text-muted-foreground">{st(r.url)?.checked ? `${ago(st(r.url).checked)}${ago(st(r.url).checked) === "today" ? "" : " ago"}` : "–"}</span> },
    { key: "act", header: "", className: "w-32 text-right", cell: (r) => (
      <div className="flex justify-end gap-1.5">
        <RowAction onClick={() => recheck(r.url)}>{busy === r.url ? <Loader2 className="size-3 animate-spin" /> : "Check"}</RowAction>
        <RowAction onClick={() => window.open(r.url, "_blank")}>Open</RowAction>
      </div>) },
  ];

  const filters: FilterDef<Row>[] = [
    { key: "status", label: "Status", options: ["Live", "Gated", "Broken", "Unchecked"], match: (r, v) => STATUS(st(r.url)?.status) === v },
    { key: "kind", label: "Type", options: ["Profile", "Site", "Repo"], match: (r, v) => r.kind === v },
  ];

  const cells: [string, number, string][] = [["Live", count("Live"), "answering normally"], ["Gated", count("Gated"), "blocks bots, check by hand"], ["Broken", count("Broken"), "dead or unreachable"], ["Unchecked", count("Unchecked"), "not tested yet"]];

  return (
    <div>
      <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
        {cells.map(([label, n, sub]) => (
          <div key={label} className="border-r border-border px-4 py-3 last:border-r-0 ">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><i className={`size-2 rounded-full ${label === "Live" ? "bg-ok" : label === "Broken" ? "bg-bad" : label === "Gated" ? "bg-warn" : "bg-muted-foreground/50"}`} />{label}</div>
            <div className="mt-1 text-xl font-semibold tracking-tight">{n}</div>
            <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>
      <DataTable title="Links" noun="links" rows={rows} columns={columns} actions={<Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => run("check_links", "Link check")}><RefreshCw className="size-3.5" />Check all</Button>} rowKey={(r) => r.kind + r.url + r.name} filters={filters}
        onRowClick={(r) => setSel({ kind: "link", url: r.url, name: r.name })} selectedKey={sel?.kind === "link" ? rows.find((r) => r.url === sel.url)?.kind + sel.url + (rows.find((r) => r.url === sel.url)?.name ?? "") : undefined}
        groups={{ by: (r) => (r.kind === "Profile" ? "Profile" : r.kind === "Site" ? "Project sites" : "Project repos"), order: ["Profile", "Project sites", "Project repos"],
          hint: { Profile: "where people find you", "Project sites": "live URLs of pinned projects", "Project repos": "GitHub repos of pinned projects (public only)" } }}
        searchText={(r) => `${r.name} ${r.url} ${r.kind}`} />
    </div>
  );
}
