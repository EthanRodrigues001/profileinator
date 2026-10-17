"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, GitCommitHorizontal, Loader2, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/kit/data-table";
import { brandFor } from "@/components/kit/tech-badge";
import { Initials, StatusChip } from "@/components/kit/cells";
import { api } from "@/lib/hq";
import { cn } from "@/lib/utils";
import type { ViewProps } from "./views";
import { copy, PromptList } from "./onboarding";
import { UpdatesPanel } from "./update";

type Tool = { name: string; kind: "read" | "write" | "network"; desc: string };
type Mcp = {
  server: { name: string; version: string; command: string; args: string[]; url: string; responding: boolean; data: string };
  claude: { installed: boolean; registered: boolean; scope?: string; status?: string };
  tools: Tool[];
};

const TABS = [["integrations", "Integrations"], ["mcp", "MCP"], ["updates", "Updates"]] as const;
type Tab = (typeof TABS)[number][0];

function Tabs({ tab, set }: { tab: Tab; set: (t: Tab) => void }) {
  return (
    <div className="flex border-b border-border px-4">
      {TABS.map(([id, label]) => (
        <button key={id} onClick={() => set(id)}
          className={`relative px-4 py-2.5 text-sm transition ${tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {label}
          {tab === id && <span className="absolute inset-x-3 bottom-0 h-px bg-brand" />}
        </button>
      ))}
    </div>
  );
}

type Gh = {
  installed: boolean; logged_in: boolean; login?: string; name?: string; avatar?: string; bio?: string | null; location?: string | null; company?: string | null;
  blog?: string | null; followers?: number; following?: number; public_repos?: number; url?: string; since?: string; hint?: string; code?: string; waiting?: boolean;
};

/** Brand square from simple-icons when the name matches one, otherwise initials. */
function Mark({ name, className }: { name: string; className?: string }) {
  const b = brandFor(name);
  if (!b) return <Initials text={name} />;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", className)} style={{ background: `#${b.hex}` }}>
      <svg viewBox="0 0 24 24" className="size-4" fill={parseInt(b.hex, 16) > 0x999999 ? "#111" : "#fff"}><path d={b.path} /></svg>
    </span>
  );
}

const ago = (ts?: number | null) => {
  if (!ts) return "never";
  const d = (Date.now() / 1000 - ts) / 86400;
  return d < 1 ? "today" : d < 60 ? `${Math.round(d)}d ago` : `${Math.round(d / 30)}mo ago`;
};

/** GitHub: your profile and sync controls when connected, the connect flow when not. */
function GithubBlock({ d, run }: Pick<ViewProps, "d" | "run">) {
  const [st, setSt] = useState<Gh | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const load = useCallback(() => api<Gh>("github_status").then(setSt).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { load(); return stop; }, [load]);

  const connect = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api<Gh & { connected?: boolean }>("github_connect");
      if (r.connected) { stop(); toast.success("GitHub connected and imported"); await load(); await run("links", ""); }
      else if (r.waiting && r.code) {
        setSt((s) => ({ ...(s as Gh), ...r }));
        if (!timer.current) timer.current = setInterval(async () => {
          const s = await api<Gh>("github_status").catch(() => null);
          if (!s) { stop(); setBusy(false); setErr("Lost connection to hq."); return; }
          if (s.logged_in) { stop(); connect(); } else if (!s.waiting) { stop(); setBusy(false); setSt({ ...s, code: undefined }); setErr("Sign-in was not completed. Try again."); }
        }, 2500);
        return;
      } else setSt(r);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  if (!st) return <div className="px-4 py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Checking GitHub…</div>;

  if (!st.logged_in) {
    const waiting = !!st.code;
    return (
      <div className="flex flex-wrap items-center gap-4 px-4 py-5">
        <Mark name="GitHub" className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h3 className="text-sm font-medium">GitHub</h3><StatusChip state="backlog">Not connected</StatusChip></div>
          <p className="mt-0.5 text-xs text-muted-foreground">Connect to import your profile, every repo, languages and tech stack. It uses the GitHub CLI; no token is stored here.</p>
          {waiting && (
            <p className="mt-2 text-xs">Enter <code className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-sm font-semibold tracking-widest">{st.code}</code> at <a className="underline" href={st.url ?? "https://github.com/login/device"} target="_blank" rel="noreferrer">github.com/login/device</a>. Waiting for you to approve…</p>
          )}
          {!st.installed && <p className="mt-2 text-xs text-bad">{st.hint} <a className="underline" href="https://cli.github.com" target="_blank" rel="noreferrer">cli.github.com</a></p>}
          {err && <p className="mt-2 text-xs text-bad">{err}</p>}
        </div>
        <Button onClick={connect} disabled={busy || !st.installed}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}Connect GitHub</Button>
      </div>
    );
  }

  const stat = (label: string, value: React.ReactNode) => (
    <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-0.5 truncate text-lg font-semibold tracking-tight">{value}</div></div>
  );
  return (
    <div className="px-4 py-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {st.avatar ? <img src={st.avatar} alt="" className="size-14 rounded-full border border-border" /> : <Mark name="GitHub" className="size-14 rounded-full" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">{st.name || st.login}</h3>
            <StatusChip state="done">Connected</StatusChip>
          </div>
          <p className="text-[13px] text-muted-foreground">@{st.login}{st.location ? ` · ${st.location}` : ""}{st.company ? ` · ${st.company}` : ""}</p>
          {st.bio && <p className="mt-1 max-w-xl text-[13px]">{st.bio}</p>}
          {st.blog && <a href={st.blog} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand hover:underline">{st.blog.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run("sync", "GitHub sync")}><RefreshCw className="size-3.5" />Sync repos &amp; stack</Button>
          <Button size="sm" variant="outline" onClick={() => run("commits_all", "Fetching commits")}><GitCommitHorizontal className="size-3.5" />Fetch commits</Button>
          {st.url && <a href={st.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Open profile</Button></a>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-6">
        {stat("Repos stored", d.repos.length)}
        {stat("Public repos", st.public_repos ?? "–")}
        {stat("Followers", st.followers ?? "–")}
        {stat("Following", st.following ?? "–")}
        {stat("Last synced", ago(d.synced))}
        {stat("Member since", st.since ? st.since.slice(0, 4) : "–")}
      </div>
    </div>
  );
}

type Row = { name: string; note: string; state: "done" | "backlog"; label: string; action?: React.ReactNode; soon?: boolean };

function IntegrationRow({ r }: { r: Row }) {
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", r.soon && "opacity-55")}>
      <Mark name={r.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="text-[13px] font-medium">{r.name}</span><StatusChip state={r.state}>{r.label}</StatusChip></div>
        <p className="truncate text-xs text-muted-foreground">{r.note}</p>
      </div>
      {r.action ?? (r.soon ? <Button size="sm" variant="outline" disabled>Connect</Button> : null)}
    </li>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return <div className="flex items-center gap-2 border-y border-border bg-muted/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{children}{count !== undefined && <span className="font-mono normal-case tracking-normal text-muted-foreground/60">{count}</span>}</div>;
}

function List({ d, run, setTab }: Pick<ViewProps, "d" | "run"> & { setTab: (t: Tab) => void }) {
  const checked = Object.values(d.links).map((l) => l.checked).sort().pop();
  const builtIn: Row[] = [
    { name: "Links", note: `Checks every profile link and each pinned project's site and repo. ${checked ? `Last run ${checked}.` : "Not run yet."}`, state: "done", label: "Ready",
      action: <Button size="sm" variant="outline" onClick={() => run("check_links", "Link check")}><RefreshCw className="size-3.5" />Check all links</Button> },
    { name: "MCP", note: "How Claude Code and other agents read and write your profile.", state: "done", label: "Built in",
      action: <Button size="sm" variant="outline" onClick={() => setTab("mcp")}>View status</Button> },
  ];
  const soon: Row[] = [
    { name: "LinkedIn", note: "Import roles and education from the official data export (LinkedIn has no public API).", state: "backlog", label: "Soon", soon: true },
    { name: "Google Drive", note: "Keep your resume PDF in sync with a Drive file.", state: "backlog", label: "Soon", soon: true },
    { name: "Notion", note: "Pull project write-ups and notes into your profile.", state: "backlog", label: "Soon", soon: true },
    { name: "GitLab", note: "Import repos and languages from GitLab as well as GitHub.", state: "backlog", label: "Soon", soon: true },
    { name: "Vercel", note: "Read deployment status and live URLs for your projects.", state: "backlog", label: "Soon", soon: true },
    { name: "Cal.com", note: "Show availability and let agents add your booking link.", state: "backlog", label: "Soon", soon: true },
  ];
  return (
    <div>
      <GithubBlock d={d} run={run} />
      <SectionTitle count={builtIn.length}>Built in</SectionTitle>
      <ul className="divide-y divide-border">{builtIn.map((r) => <IntegrationRow key={r.name} r={r} />)}</ul>
      <SectionTitle count={soon.length}>Coming soon</SectionTitle>
      <ul className="divide-y divide-border border-b border-border">{soon.map((r) => <IntegrationRow key={r.name} r={r} />)}</ul>
      <div className="px-4 pb-8 pt-6">
        <h3 className="mb-1 text-sm font-medium">Prompts for your agent</h3>
        <p className="mb-3 text-xs text-muted-foreground">Paste into any agent connected to hq. Whatever it stores is indexed into the graph immediately.</p>
        <PromptList />
      </div>
    </div>
  );
}

const Row = ({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) => (
  <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 text-sm last:border-0">
    <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
    <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
    {onCopy && <Button variant="ghost" size="sm" onClick={onCopy}><Copy className="size-3.5" />Copy</Button>}
  </div>
);

function McpPanel() {
  const [m, setM] = useState<Mcp | null>(null);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setM(await api<Mcp>("mcp_status")); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api<{ connected: boolean; lines: string[] }>("setup_agent");
      toast[r.connected ? "success" : "info"](r.connected ? "Connected to Claude Code. Start a new chat to load the tools." : r.lines[r.lines.length - 1] ?? "Claude Code not found");
      await load();
    } catch (e) { toast.error((e as Error).message); }
    setConnecting(false);
  };

  if (!m) return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Checking MCP…</div>;
  const cc = m.claude;
  const ccState = !cc.installed ? "backlog" : !cc.registered ? "progress" : cc.status?.includes("Connected") ? "done" : "progress";
  const ccLabel = !cc.installed ? "Claude Code not found" : !cc.registered ? "Not registered" : cc.status?.replace(/\(.*\)/, "").replace(/^[^A-Za-z]+/, "").trim() || "Registered";
  const config = JSON.stringify({ mcpServers: { hq: { command: m.server.command, args: m.server.args } } }, null, 2);
  const counts = { read: 0, write: 0, network: 0 };
  m.tools.forEach((t) => counts[t.kind]++);

  return (
    <div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Server</p>
          <div className="mt-1.5"><StatusChip state={m.server.responding ? "done" : "progress"}>{m.server.responding ? "Responding" : "Not responding"}</StatusChip></div>
          <p className="mt-2 text-xs text-muted-foreground">hq {m.server.version} · {m.tools.length} tools</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Claude Code</p>
          <div className="mt-1.5"><StatusChip state={ccState}>{ccLabel}</StatusChip></div>
          <p className="mt-2 truncate text-xs text-muted-foreground">{cc.scope ?? (cc.installed ? "Use Connect to register hq" : "Install Claude Code or use the config below")}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Tools</p>
          <p className="mt-1.5 text-sm">{counts.read} read · {counts.write} write · {counts.network} network</p>
          <p className="mt-2 text-xs text-muted-foreground">Every write is validated and undoable</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-4">
        <Button onClick={connect} disabled={connecting}>{connecting ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}{cc.registered ? "Reconnect Claude Code" : "Connect Claude Code"}</Button>
        <Button variant="outline" onClick={load} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Refresh</Button>
      </div>

      <div className="mx-4 mb-6 overflow-hidden rounded-xl border border-border">
        <Row label="Command (stdio)" value={`${m.server.command} ${m.server.args.join(" ")}`} onCopy={() => copy(config, "MCP config")} />
        <Row label="URL (HTTP)" value={m.server.url} onCopy={() => copy(m.server.url, "MCP URL")} />
        <Row label="Data file" value={m.server.data} onCopy={() => copy(m.server.data, "Path")} />
      </div>

      <DataTable title="Tools" noun="tools" rows={m.tools} rowKey={(t) => t.name} searchText={(t) => `${t.name} ${t.desc}`}
        groups={{ by: (t) => ({ read: "Read", write: "Write", network: "Network" })[t.kind], order: ["Read", "Write", "Network"], hint: { Read: "look things up", Write: "store facts (undoable)", Network: "GitHub and links" } }}
        columns={[
          { key: "name", header: "Tool", className: "w-56", cell: (t) => <code className="font-mono text-xs font-medium">{t.name}</code> },
          { key: "desc", header: "What it does", className: "w-full max-w-0", cell: (t) => <span className="block truncate text-muted-foreground" title={t.desc}>{t.desc}</span> },
        ]} />
    </div>
  );
}

/** Integrations workspace: connected services, MCP status and tools, and app updates. */
export function Integrations({ d, run }: ViewProps) {
  const [tab, setTab] = useState<Tab>("integrations");
  return (
    <div>
      <Tabs tab={tab} set={setTab} />
      {tab === "integrations" && <List d={d} run={run} setTab={setTab} />}
      {tab === "mcp" && <McpPanel />}
      {tab === "updates" && <UpdatesPanel />}
    </div>
  );
}
