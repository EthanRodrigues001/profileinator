"use client";
import { useEffect, useMemo, useState } from "react";
import { Bot, Plug, Undo2, User, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip, Chip } from "@/components/kit/cells";
import { linkState } from "@/components/kit/status-icon";
import { ago, api, bytes, fileUrl, type Commit, type FileEntry, type LogEntry } from "@/lib/hq";
import { useSelection } from "@/lib/selection";
import { describe, clock } from "../activity";
import { CopyButton, Empty, Field, Section, agoTs, type PanelProps } from "./shared";

/* ------------------------------------------------------------------ Links */

type Hist = { at: number; status: string; code: number; ms: number }[];

export function LinkStatus({ d, reload }: PanelProps) {
  const { sel } = useSelection();
  const [busy, setBusy] = useState(false);
  if (sel?.kind !== "link") {
    const all = Object.values(d.links);
    return (
      <>
        <Section title="All links"><Field label="Live">{all.filter((l) => l.status === "ok").length}</Field><Field label="Gated">{all.filter((l) => l.status === "gated").length}</Field><Field label="Broken">{all.filter((l) => l.status === "dead" || l.status === "down").length}</Field></Section>
        <Empty>Select a link in the table to see its status here.</Empty>
      </>
    );
  }
  const l = d.links[sel.url];
  return (
    <>
      <Section title={sel.name}>
        <p className="mb-3 break-all text-xs text-muted-foreground">{sel.url}</p>
        <Field label="Status">{l ? <StatusChip state={linkState(l.status)}>{l.status === "ok" ? "Live" : l.status}</StatusChip> : "Unchecked"}</Field>
        <Field label="HTTP code">{l?.code || "–"}</Field>
        <Field label="Response">{l ? `${l.ms}ms` : "–"}</Field>
        <Field label="Checked">{l?.checked ?? "never"}</Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await api("check_link", { url: sel.url }); toast.success("Checked"); await reload(); } catch (e) { toast.error((e as Error).message); } setBusy(false); }}>Check now</Button>
          <Button size="sm" variant="outline" onClick={() => window.open(sel.url, "_blank")}>Open</Button>
          <CopyButton text={sel.url} label="Copy" done="Address copied" />
        </div>
      </Section>
    </>
  );
}

export function LinkHistory({ d }: PanelProps) {
  const { sel } = useSelection();
  const [h, setH] = useState<Hist | null>(null);
  useEffect(() => { setH(null); if (sel?.kind === "link") api<Hist>("link_history", { url: sel.url }).then(setH).catch(() => setH([])); }, [sel, d.links]);
  if (sel?.kind !== "link") return <Empty>Select a link to see its last ten checks.</Empty>;
  if (h === null) return <Empty>Loading…</Empty>;
  if (!h.length) return <Empty>No history yet. Press Check now on the Status tab, or Check all on the Links page.</Empty>;
  const max = Math.max(...h.map((x) => x.ms), 1);
  const ok = h.filter((x) => x.status === "ok").length;
  return (
    <>
      <Section title="Last checks" right={`${ok}/${h.length} live`}>
        <div className="flex h-12 items-end gap-1">
          {h.map((x, i) => <i key={i} title={`${x.status} · ${x.ms}ms`} className={`flex-1 rounded-sm ${x.status === "ok" ? "bg-ok/70" : x.status === "gated" ? "bg-warn/70" : "bg-bad/70"}`} style={{ height: `${Math.max(8, (x.ms / max) * 100)}%` }} />)}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Bar height is response time.</p>
      </Section>
      <Section title="Log">
        <ul className="space-y-1.5">
          {[...h].reverse().map((x, i) => <li key={i} className="flex items-center justify-between text-[13px]"><span>{x.status === "ok" ? "Live" : x.status}{x.code ? ` · ${x.code}` : ""}</span><span className="font-mono text-xs text-muted-foreground">{x.ms}ms · {agoTs(x.at)}</span></li>)}
        </ul>
      </Section>
    </>
  );
}

export function LinkUsedIn({ d }: PanelProps) {
  const { sel } = useSelection();
  if (sel?.kind !== "link") return <Empty>Select a link to see where it is used.</Empty>;
  const prof = d.me.links.filter((l) => l.url === sel.url);
  const proj = d.repos.filter((r) => r.homepage === sel.url || r.url === sel.url);
  return (
    <>
      <Section title="Profile links">
        {prof.length ? prof.map((l) => <Field key={l.id} label={l.label}>{(l as { resume?: boolean }).resume ? "on resume" : "profile only"}</Field>) : <p className="text-[13px] text-muted-foreground">Not one of your profile links.</p>}
      </Section>
      <Section title="Projects">
        {proj.length ? proj.map((r) => <Field key={r.name} label={r.name}>{r.homepage === sel.url ? "live site" : "repo"}{r.pinned ? " · pinned" : ""}</Field>) : <p className="text-[13px] text-muted-foreground">Not attached to a project.</p>}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ Commits */

type Detail = { message: string; url: string; stats: { additions: number; deletions: number; total: number }; files: { name: string; status: string; add: number; del: number }[] };

export function CommitDetail() {
  const { sel } = useSelection();
  const [x, setX] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setX(null); setErr("");
    if (sel?.kind === "commit") api<Detail>("commit_detail", { repo: sel.repo, sha: sel.sha }).then(setX).catch((e) => setErr((e as Error).message));
  }, [sel]);
  if (sel?.kind !== "commit") return <Empty>Click a commit to see which files it changed.</Empty>;
  return (
    <>
      <Section title={sel.repo} right={<span className="font-mono">{sel.sha.slice(0, 7)}</span>}>
        <p className="whitespace-pre-wrap text-[13px]">{x?.message ?? sel.msg}</p>
        {x && <p className="mt-2 text-xs"><span className="text-ok">+{x.stats.additions}</span> <span className="text-bad">−{x.stats.deletions}</span> <span className="text-muted-foreground">in {x.files.length} file{x.files.length === 1 ? "" : "s"}</span></p>}
        {(x?.url || sel.url) && <Button size="sm" variant="outline" className="mt-3" onClick={() => window.open(x?.url ?? sel.url, "_blank")}>Open on GitHub</Button>}
      </Section>
      <Section title="Files">
        {err ? <p className="text-[13px] text-bad">{err}</p> : !x ? <p className="text-[13px] text-muted-foreground">Loading from GitHub…</p> : (
          <ul className="space-y-1.5">
            {x.files.map((f) => <li key={f.name} className="flex items-baseline justify-between gap-3 text-xs"><span className="min-w-0 truncate font-mono" title={f.name}>{f.name}</span><span className="shrink-0 font-mono"><span className="text-ok">+{f.add}</span> <span className="text-bad">−{f.del}</span></span></li>)}
          </ul>
        )}
      </Section>
    </>
  );
}

function useFeed() {
  const [feed, setFeed] = useState<Commit[] | null>(null);
  useEffect(() => { api<Commit[]>("feed", { limit: 5000 }).then(setFeed).catch(() => setFeed([])); }, []);
  return feed;
}

export function RepoStats({ d }: PanelProps) {
  const { sel } = useSelection();
  const feed = useFeed();
  const repo = sel?.kind === "commit" ? sel.repo : null;
  const mine = useMemo(() => (feed ?? []).filter((c) => c.repo === repo), [feed, repo]);
  if (!repo) return <Empty>Select a commit to see stats for its repo.</Empty>;
  const month = mine.filter((c) => Date.now() - Date.parse(c.date) < 30 * 864e5).length;
  const authors: Record<string, number> = {};
  mine.forEach((c) => (authors[c.author] = (authors[c.author] ?? 0) + 1));
  const adds = mine.reduce((a, c) => a + (c.add || 0), 0), dels = mine.reduce((a, c) => a + (c.del || 0), 0);
  return (
    <Section title={repo}>
      <Field label="Commits cached">{mine.length}</Field>
      <Field label="Last 30 days">{month}</Field>
      <Field label="Latest">{mine[0] ? `${ago(mine[0].date)}${ago(mine[0].date) === "today" ? "" : " ago"}` : "–"}</Field>
      <Field label="Lines">{`+${adds.toLocaleString()} −${dels.toLocaleString()}`}</Field>
      <Field label="Authors">{Object.keys(authors).length}</Field>
      <Field label="Pinned">{d.repos.find((r) => r.name === repo)?.pinned ? "yes" : "no"}</Field>
    </Section>
  );
}

export function Authors() {
  const feed = useFeed();
  const top = useMemo(() => {
    const a: Record<string, number> = {};
    (feed ?? []).forEach((c) => (a[c.author] = (a[c.author] ?? 0) + 1));
    return Object.entries(a).sort((x, y) => y[1] - x[1]).slice(0, 10);
  }, [feed]);
  if (feed === null) return <Empty>Loading…</Empty>;
  if (!top.length) return <Empty>No commits cached yet.</Empty>;
  const max = top[0][1];
  return (
    <Section title="Top authors" right={`${(feed ?? []).length} commits`}>
      <ul className="space-y-2.5">
        {top.map(([name, n]) => (
          <li key={name}><div className="mb-1 flex justify-between text-[13px]"><span className="truncate">{name}</span><span className="font-mono text-xs text-muted-foreground">{n}</span></div>
            <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand/80" style={{ width: `${(n / max) * 100}%` }} /></div></li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ Context */

const ID_FIELDS: [string, string][] = [["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["location", "Location"], ["headline", "Headline"], ["summary", "Summary"]];

function InlineEdit({ label, initial, onSave, placeholder }: { label: string; initial: string; onSave: (v: string) => Promise<void>; placeholder?: string }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(initial), [initial]);
  return (
    <li>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="flex gap-1.5">
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-7 text-xs md:text-xs" onKeyDown={(e) => e.key === "Enter" && v.trim() && v !== initial && (setBusy(true), onSave(v.trim()).finally(() => setBusy(false)))} />
        <Button size="sm" variant="outline" className="h-7" disabled={busy || !v.trim() || v === initial} onClick={async () => { setBusy(true); await onSave(v.trim()); setBusy(false); }}>Save</Button>
      </div>
    </li>
  );
}

export function ContextAnswer({ d, reload }: PanelProps) {
  const open = Object.entries(d.me.answers ?? {}).filter(([, v]) => v === null || v === "");
  const save = (key: string) => async (value: string) => { try { await api("set_answer", { key, value }); toast.success("Answer saved"); await reload(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Unanswered" right={`${open.length}`}>
      {open.length ? <ul className="space-y-3">{open.map(([k]) => <InlineEdit key={k} label={k.replace(/_/g, " ")} initial="" onSave={save(k)} placeholder={k.includes("salary") ? "e.g. 12 LPA" : k.includes("date") ? "e.g. 2026-12-01" : "Your answer"} />)}</ul>
        : <p className="text-[13px] text-muted-foreground">Every standard application question has an answer.</p>}
    </Section>
  );
}

export function ContextMissing({ d, reload }: PanelProps) {
  const missing = ID_FIELDS.filter(([k]) => !d.me.identity[k]);
  const save = (key: string) => async (value: string) => { try { await api("set_identity", { [key]: value }); toast.success("Saved"); await reload(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Missing identity" right={`${missing.length}`}>
      {missing.length ? <ul className="space-y-3">{missing.map(([k, label]) => <InlineEdit key={k} label={label} initial="" onSave={save(k)} />)}</ul>
        : <p className="text-[13px] text-muted-foreground">Your identity is complete.</p>}
    </Section>
  );
}

export function ContextDefaults({ d, reload }: PanelProps) {
  const done = Object.entries(d.me.answers ?? {}).filter(([, v]) => v !== null && v !== "");
  const save = (key: string) => async (value: string) => { try { await api("set_answer", { key, value }); toast.success("Answer updated"); await reload(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Section title="Stored answers" right={`${done.length}`}>
      {done.length ? <ul className="space-y-3">{done.map(([k, v]) => <InlineEdit key={k} label={k.replace(/_/g, " ")} initial={String(v)} onSave={save(k)} />)}</ul>
        : <p className="text-[13px] text-muted-foreground">No answers stored yet.</p>}
    </Section>
  );
}

/* ------------------------------------------------------------------ Files */

export function FileDetails({ reload, go }: PanelProps) {
  const { sel, setSel } = useSelection();
  const [f, setF] = useState<FileEntry | null>(null);
  useEffect(() => { setF(null); if (sel?.kind === "file") api<FileEntry[]>("files").then((l) => setF(l.find((x) => x.id === sel.id) ?? null)).catch(() => {}); }, [sel]);
  if (sel?.kind !== "file") return <Empty>Select a file to inspect it. Resume versions, screenshots and your photo all show here.</Empty>;
  if (!f) return <Empty>Loading…</Empty>;
  return (
    <>
      <Section title={f.label || f.name}>
        <Field label="File">{f.name}</Field>
        <Field label="Kind">{f.kind}{f.current ? " · current" : ""}</Field>
        <Field label="Size">{bytes(f.size)}</Field>
        <Field label="Added">{agoTs(f.added)}</Field>
        <Field label="Type">{f.mime}</Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.open(fileUrl(f.id), "_blank")}>Open</Button>
          {f.kind === "resume" && !f.current && <Button size="sm" variant="outline" onClick={async () => { await api("file_update", { id: f.id, current: true }); toast.success("Now the current resume"); await reload(); setSel({ kind: "file", id: f.id }); }}>Make current</Button>}
          <Button size="sm" variant="ghost" className="text-bad" onClick={async () => { if (!confirm("Delete this file? This cannot be undone.")) return; await api("file_delete", { id: f.id }); setSel(null); toast.success("Deleted"); await reload(); go("files"); }}>Delete</Button>
        </div>
      </Section>
      <Section title="Linked to" right={`${f.links.length}`}>
        {f.links.length ? <ul className="space-y-1 text-[13px]">{f.links.map((l, i) => <li key={i}>{l.type === "me" ? "Profile" : `${l.type}: ${l.ref}`}</li>)}</ul> : <p className="text-[13px] text-muted-foreground">Not linked to anything yet.</p>}
      </Section>
    </>
  );
}

type Storage = { files: number; bytes: number; by_kind: Record<string, { files: number; bytes: number }>; duplicates: string[][] };
export function FileStorage() {
  const [s, setS] = useState<Storage | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    api<Storage>("storage").then(setS).catch(() => {});
    api<FileEntry[]>("files").then((l) => setNames(Object.fromEntries(l.map((f) => [f.id, f.label || f.name])))).catch(() => {});
  }, []);
  if (!s) return <Empty>Loading…</Empty>;
  return (
    <>
      <Section title="Space used" right={bytes(s.bytes)}>
        {Object.entries(s.by_kind).map(([k, v]) => <Field key={k} label={k}>{v.files} · {bytes(v.bytes)}</Field>)}
        {!s.files && <p className="text-[13px] text-muted-foreground">No files stored yet.</p>}
      </Section>
      <Section title="Duplicates" right={`${s.duplicates.length}`}>
        {s.duplicates.length ? <ul className="space-y-2 text-[13px]">{s.duplicates.map((g, i) => <li key={i}>{g.map((id) => names[id] ?? id).join(" = ")}</li>)}</ul> : <p className="text-[13px] text-muted-foreground">No identical files.</p>}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ Activity */

const ACTOR = { app: { label: "You", icon: User }, agent: { label: "Agent", icon: Bot }, cli: { label: "Terminal", icon: Terminal } } as const;

export function ActivityDetails({ d, reload }: PanelProps) {
  const { sel } = useSelection();
  const log = d.log as LogEntry[];
  const e = sel?.kind === "log" ? log.find((x) => x.ts === sel.ts) : null;
  const newestChange = [...log].reverse().find((x) => x.kind === "change");
  if (!e) return <Empty>Select an entry to see its detail and undo it if it was the latest change.</Empty>;
  const a = e.src ? ACTOR[e.src] : null;
  const canUndo = e.kind === "change" && newestChange?.ts === e.ts;
  return (
    <Section title={describe(e).title}>
      <Field label="When">{new Date(e.ts * 1000).toLocaleDateString("en", { month: "short", day: "numeric" })} · {clock(e.ts)}</Field>
      <Field label="By">{a ? <span className="inline-flex items-center gap-1"><a.icon className="size-3" />{a.label}</span> : "unknown"}</Field>
      <Field label="Kind">{e.kind}</Field>
      <p className="mt-2 break-words rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground">{e.text}</p>
      <div className="mt-3">
        <Button size="sm" variant="outline" disabled={!canUndo} onClick={async () => { try { await api("undo", { n: 1 }); toast.success("Undone"); await reload(); } catch (x) { toast.error((x as Error).message); } }}><Undo2 className="size-3.5" />Undo this change</Button>
        {!canUndo && <p className="mt-1.5 text-xs text-muted-foreground">Only the latest change can be undone from here.</p>}
      </div>
    </Section>
  );
}

export function ActivitySummary({ d }: PanelProps) {
  const log = d.log as LogEntry[];
  const by = (f: (e: LogEntry) => string) => { const m: Record<string, number> = {}; log.forEach((e) => { const k = f(e); m[k] = (m[k] ?? 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const days = useMemo(() => {
    const m: Record<string, number> = {};
    log.forEach((e) => { const k = new Date(e.ts * 1000).toISOString().slice(0, 10); m[k] = (m[k] ?? 0) + 1; });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  }, [log]);
  return (
    <>
      <Section title="Who changed things" right={`${log.length}`}>
        {by((e) => (e.src ? ACTOR[e.src].label : "Before tracking")).map(([k, n]) => <Field key={k} label={k}>{n}</Field>)}
      </Section>
      <Section title="By kind">{by((e) => e.kind).map(([k, n]) => <Field key={k} label={k}>{n}</Field>)}</Section>
      <Section title="Busiest days">{days.map(([k, n]) => <Field key={k} label={k.slice(5)}>{n}</Field>)}</Section>
    </>
  );
}

/* ------------------------------------------------------------------ Integrations */

type Gh = { installed: boolean; logged_in: boolean; login?: string; repos?: number; synced?: number | null };
type Mcp = { server: { responding: boolean; version: string }; claude: { registered: boolean; status?: string }; tools: { name: string; kind: string }[] };

export function IntegrationsStatus({ d }: PanelProps) {
  const [gh, setGh] = useState<Gh | null>(null);
  useEffect(() => { api<Gh>("github_status").then(setGh).catch(() => {}); }, []);
  const sites = [...d.me.links.map((l) => l.url), ...d.repos.filter((r) => r.pinned && r.homepage).map((r) => r.homepage!)];
  return (
    <>
      <Section title="GitHub">
        <Field label="Status">{gh ? (gh.logged_in ? <Chip tone="ok">Connected</Chip> : "Not connected") : "…"}</Field>
        {gh?.login && <Field label="Account">@{gh.login}</Field>}
        <Field label="Repos stored">{d.repos.length}</Field>
        <Field label="Last synced">{d.synced ? agoTs(d.synced) : "never"}</Field>
      </Section>
      <Section title="Links"><Field label="Tracked">{sites.length}</Field><Field label="Checked">{sites.filter((u) => d.links[u]).length}</Field></Section>
      <Section title="Planned"><p className="text-[13px] text-muted-foreground">LinkedIn, Google Drive, Notion, GitLab, Vercel and Cal.com are on the list.</p></Section>
    </>
  );
}

export function IntegrationsCaps() {
  const [m, setM] = useState<Mcp | null>(null);
  useEffect(() => { api<Mcp>("mcp_status").then(setM).catch(() => {}); }, []);
  if (!m) return <Empty>Loading…</Empty>;
  const count = (k: string) => m.tools.filter((t) => t.kind === k).length;
  return (
    <>
      <Section title="MCP server"><Field label="Status"><span className="inline-flex items-center gap-1.5"><Plug className="size-3" />{m.server.responding ? "Responding" : "Down"}</span></Field><Field label="Version">{m.server.version}</Field><Field label="Claude Code">{m.claude.registered ? "Registered" : "Not registered"}</Field></Section>
      <Section title="What agents can do">
        <Field label="Read">{count("read")} tools</Field><Field label="Write">{count("write")} tools</Field><Field label="Network">{count("network")} tools</Field>
        <p className="mt-2 text-xs text-muted-foreground">Every write is validated, undoable and recorded in Activity with who made it.</p>
      </Section>
    </>
  );
}
