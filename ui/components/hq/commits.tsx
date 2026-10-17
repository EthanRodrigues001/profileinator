"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, GitCommitHorizontal, DownloadCloud, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityGrid } from "@/components/kit/activity-grid";
import { Initials } from "@/components/kit/cells";
import { TopRepos } from "./charts";
import { EmptyState } from "@/components/kit/empty-state";
import { CommitGraph } from "@/components/kit/commit-graph";
import { SpecGrid } from "@/components/kit/spec-grid";
import { api, type Commit, type Repo } from "@/lib/hq";
import { cn } from "@/lib/utils";
import { useSelection, type Selection } from "@/lib/selection";
import type { ViewProps } from "./views";

type Stored = { fetched: number; nodes: Commit[] };

const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const rel = (iso: string) => {
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  return d < 1 ? "today" : d < 2 ? "1d" : d < 60 ? `${Math.round(d)}d` : d < 700 ? `${Math.round(d / 30)}mo` : `${Math.round(d / 365)}y`;
};
/** Selecting a commit shows its files in the inspector rail, which also links to GitHub. */
const openIn = (repos: Repo[], select: (s: Selection) => void) => (c: Commit) => {
  const r = repos.find((x) => x.name === c.repo);
  select({ kind: "commit", repo: c.repo ?? "", sha: c.sha, msg: c.msg, url: r?.url ? `${r.url}/commit/${c.sha}` : undefined });
};

/** One repo's history with the branch graph. Loaded from the cache; Refresh pulls again from GitHub. */
export function RepoCommits({ repo, repos }: { repo: string; repos: Repo[] }) {
  const { setSel } = useSelection();
  const [data, setData] = useState<Stored | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true);
    try { setData(await api<Stored>("commits", { repo, refresh, limit: 100 })); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }, [repo]);
  useEffect(() => { load(false); }, [load]);

  const nodes = (data?.nodes ?? []).map((c) => ({ ...c, repo }));
  const add = nodes.reduce((a, c) => a + (c.add || 0), 0);
  const del = nodes.reduce((a, c) => a + (c.del || 0), 0);
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <h2 className="text-sm font-medium">{repo}</h2>
        <span className="text-[13px] text-muted-foreground">{nodes.length} commits · <span className="font-mono text-emerald-400">+{add}</span> <span className="font-mono text-red-400">−{del}</span></span>
        <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => load(true)}>
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>
      <div className="border-t border-border">
        {data ? <CommitGraph commits={nodes} onOpen={openIn(repos, setSel)} /> : <div className="py-16 text-center text-sm text-muted-foreground">Loading from GitHub…</div>}
      </div>
    </div>
  );
}

/** Searchable repo dropdown for narrow layouts: same rows as the side list, in a popover. */
function RepoPicker({ value, repos, total, onChange }: { value: string; repos: { name: string; n: number; last: string }[]; total: number; onChange: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = repos.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const pick = (r: string) => { onChange(r); setOpen(false); setQ(""); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-border bg-card/40 px-3 text-[13px] transition hover:bg-card">
        {value ? <Initials text={value} /> : <span className="grid size-6 place-items-center rounded-md bg-brand/15 text-[10px] font-semibold text-brand">ALL</span>}
        <span className="flex-1 truncate text-left font-medium">{value || "All repos"}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 top-11 z-30 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter repos…" className="h-8 pl-8 text-[13px] md:text-[13px]" />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              <button onClick={() => pick("")} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-accent", !value && "bg-accent/50")}>
                <span className="grid size-6 place-items-center rounded-md bg-brand/15 text-[10px] font-semibold text-brand">ALL</span>
                <span className="flex-1 font-medium">All repos</span><span className="font-mono text-[11px] text-muted-foreground">{total} repos</span>
              </button>
              {shown.map((r) => (
                <button key={r.name} onClick={() => pick(r.name)} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-accent", value === r.name && "bg-accent/50")}>
                  <Initials text={r.name} /><span className="flex-1 truncate font-medium">{r.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{r.n}</span><span className="w-9 text-right text-[11px] text-muted-foreground/70">{rel(r.last)}</span>
                </button>
              ))}
              {!shown.length && <div className="py-6 text-center text-[13px] text-muted-foreground">No repos match.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Commits workspace: totals and a 26-week heatmap on top, a repo list on the left, and on the right either the
 * merged feed (grouped by day) or the selected repo's branch graph.
 */
export function Commits({ d }: ViewProps) {
  const { setSel } = useSelection();
  const [repo, setRepo] = useState("");
  const [feed, setFeed] = useState<Commit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const loadFeed = useCallback(async () => setFeed(await api<Commit[]>("feed", { limit: 5000 })), []);
  useEffect(() => { loadFeed(); }, [loadFeed]);

  const fetchAll = async () => {
    setBusy(true);
    try {
      const r = await api<{ repos: number; failed: string[] }>("commits_all", { limit: 60 });
      toast.success(`Fetched ${r.repos} repos${r.failed.length ? `, ${r.failed.length} failed` : ""}`);
      await loadFeed();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  const stats = useMemo(() => {
    const all = feed ?? [];
    const per = new Map<string, { n: number; last: string }>();
    const days: Record<string, number> = {};
    const cutoff = Date.now() - 30 * 864e5;
    let recent = 0, add = 0, del = 0;
    const active = new Set<string>();
    const last30 = new Map<string, number>();
    all.forEach((c) => {
      const p = per.get(c.repo!) ?? { n: 0, last: "" };
      per.set(c.repo!, { n: p.n + 1, last: p.last > c.date ? p.last : c.date });
      days[dayOf(c.date)] = (days[dayOf(c.date)] ?? 0) + 1;
      add += c.add || 0; del += c.del || 0;
      if (Date.parse(c.date) > cutoff) { recent++; active.add(c.repo!); last30.set(c.repo!, (last30.get(c.repo!) ?? 0) + 1); }
    });
    const top = [...last30.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { per, days, recent, active: active.size, add, del, latest: all[0], top };
  }, [feed]);

  const list = d.repos
    .filter((r) => !r.fork && stats.per.has(r.name) && r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (stats.per.get(b.name)!.last > stats.per.get(a.name)!.last ? 1 : -1));

  if (feed && !feed.length) {
    return (
      <div className="p-8"><EmptyState icon={GitCommitHorizontal} title="No commits cached yet" hint="Fetch the history of your repos once; after that it is stored on this computer.">
        <Button disabled={busy} onClick={fetchAll}><DownloadCloud className="size-4" />{busy ? "Fetching every repo…" : "Fetch all repos"}</Button>
      </EmptyState></div>
    );
  }

  const Row = ({ name, count, last, active }: { name: string; count?: number | string; last?: string; active: boolean }) => (
    <button onClick={() => setRepo(name === "__all" ? "" : name)}
      className={cn("flex w-full items-center gap-2.5 border-b border-border/40 px-4 py-2 text-left text-[13px] transition hover:bg-accent/30", active && "bg-accent/50")}>
      {name === "__all" ? <span className="grid size-6 place-items-center rounded-md bg-brand/15 text-[10px] font-semibold text-brand">ALL</span> : <Initials text={name} />}
      <span className="min-w-0 flex-1 truncate font-medium">{name === "__all" ? "All repos" : name}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
      {last && <span className="w-9 text-right text-[11px] text-muted-foreground/70">{rel(last)}</span>}
    </button>
  );

  return (
    <div className="@container">
      <SpecGrid cols={4} items={[
        { label: "Commits, last 30 days", value: String(stats.recent) },
        { label: "Active repos, last 30 days", value: String(stats.active) },
        { label: "Lines changed (fetched)", value: <><span className="text-emerald-400">+{compact(stats.add)}</span> <span className="text-red-400">−{compact(stats.del)}</span></> },
        { label: "Latest", value: stats.latest ? `${stats.latest.repo} · ${rel(stats.latest.date)}` : "" },
      ]} />
      <div className="grid items-start border-b border-border @3xl:grid-cols-[auto_1fr] @3xl:divide-x @3xl:divide-border">
        <div className="px-4 py-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Activity · {feed?.length ?? 0} commits across {stats.per.size} repos</div>
          <ActivityGrid counts={stats.days} weeks={26} />
        </div>
        <div className="self-stretch px-5 py-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Most active, last 30 days</div>
          <TopRepos items={stats.top} loading={!feed} />
        </div>
      </div>

      <div className="@2xl:grid @2xl:grid-cols-[16rem_1fr]">
        <aside className="hidden border-r border-border @2xl:block">
          <div className="relative border-b border-border px-3 py-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter repos…" className="h-8 pl-8 text-[13px] md:text-[13px]" />
          </div>
          <div className="sticky top-9 max-h-[70vh] overflow-y-auto">
            <Row name="__all" count={`${stats.per.size} repos`} active={!repo} />
            {list.map((r) => <Row key={r.name} name={r.name} count={stats.per.get(r.name)!.n} last={stats.per.get(r.name)!.last} active={repo === r.name} />)}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="border-b border-border px-4 py-2 @2xl:hidden">
            <RepoPicker value={repo} repos={list.map((r) => ({ name: r.name, n: stats.per.get(r.name)!.n, last: stats.per.get(r.name)!.last }))} total={stats.per.size} onChange={setRepo} />
          </div>
          {repo ? <RepoCommits repo={repo} repos={d.repos} /> : (
            <>
              <div className="flex h-12 items-center gap-3 px-4">
                <h2 className="text-sm font-medium">Latest across all repos</h2>
                <span className="text-[13px] text-muted-foreground">{feed?.length ?? 0} commits loaded · latest 60 per repo, newest first</span>
                <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={fetchAll}>
                  <DownloadCloud className={`size-3.5 ${busy ? "animate-pulse" : ""}`} />{busy ? "Fetching every repo…" : "Fetch all repos"}
                </Button>
              </div>
              <CommitGraph commits={(feed ?? []).slice(0, 200)} graph={false} showRepo groupDays onOpen={openIn(d.repos, setSel)} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
