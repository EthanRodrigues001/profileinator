"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Lock, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/kit/dropdown";
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
        <Dropdown className="w-48 shrink-0" value={lang || "all"} onChange={(v) => setLang(v === "all" ? "" : v)}
          options={[{ value: "all", label: "All languages" }, ...langs.map((l) => ({ value: l, label: l }))]} />
      </div>
      <Card><CardContent>{list.map((r) => <RepoRow key={r.name} r={r} run={run} onOpen={(n) => go("project", n)} />)}</CardContent></Card>
    </div>
  );
}
