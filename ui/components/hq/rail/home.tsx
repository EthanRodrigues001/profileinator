"use client";
import { useEffect, useState } from "react";
import { Bot, Plug } from "lucide-react";
import { StatusIcon, linkState } from "@/components/kit/status-icon";
import { api, type LogEntry } from "@/lib/hq";
import { describe } from "../activity";
import { score } from "../score";
import { Empty, Field, Pill, Rows, SegBar, Section, Stats, Timeline, agoTs, useUsage, type PanelProps } from "./shared";
import type { TabKind } from "@/components/shell/nav";

const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const TODO_TAB: Record<string, TabKind> = { pinned: "repos" };

/** Since yesterday, and the next things worth doing. */
export function Today({ d, go }: PanelProps) {
  const since = Date.now() / 1000 - 86400;
  const recent = [...d.log].reverse().filter((e) => e.ts >= since).slice(0, 6) as LogEntry[];
  const todos = score(d).todos.slice(0, 4);
  return (
    <>
      <Section title="Since yesterday" count={recent.length}>
        {recent.length ? (
          <Timeline items={recent.map((e) => ({ time: agoTs(e.ts).replace(" ago", ""), text: describe(e).title, aside: e.src === "agent" ? <Pill tone="brand" icon={<Bot className="size-3" />}>Agent</Pill> : undefined }))} />
        ) : <p className="text-[13px] text-muted-foreground">No changes in the last day.</p>}
      </Section>
      <Section title="Do next">
        {todos.length ? (
          <ul className="space-y-2">
            {todos.map((t, i) => (
              <li key={i}><button onClick={() => go(TODO_TAB[t.tab] ?? (t.tab as TabKind))} className="flex w-full items-start gap-2 text-left text-[13px] hover:text-foreground">
                <StatusIcon state="todo" size={14} className="mt-0.5" /><span className="min-w-0 flex-1">{t.text}</span></button></li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">Nothing left to do.</p>}
      </Section>
    </>
  );
}

const PART_LABEL: Record<string, string> = { identity: "Identity", answers: "Application answers", links: "Links working", taglines: "Project taglines", pinned: "Pinned projects" };

/** Score breakdown and the live-link roster. */
export function Health({ d, go }: PanelProps) {
  const s = score(d);
  const sites = [
    ...d.me.links.map((l) => ({ name: l.label, url: l.url })),
    ...d.repos.filter((r) => r.pinned && r.homepage).map((r) => ({ name: r.name, url: r.homepage! })),
  ];
  return (
    <>
      <Section title="Profile score" right={<Pill tone={s.pct >= 80 ? "ok" : s.pct >= 50 ? "warn" : "bad"}>{s.pct}%</Pill>}>
        <Stats items={[{ value: `${s.pct}%`, label: "Score" }, { value: s.todos.length, label: "To do" }, { value: sites.length, label: "Links" }]} />
        <div className="mt-2"><Rows>
          {Object.entries(s.parts).map(([k, v]) => (
            <li key={k} className="py-2">
              <div className="mb-1.5 flex justify-between text-[13px]"><span className="text-muted-foreground">{PART_LABEL[k] ?? k}</span><span className="tabular-nums">{Math.round(v * 100)}%</span></div>
              <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(v * 100)}%` }} /></div>
            </li>
          ))}
        </Rows></div>
      </Section>
      <Section title="Links" count={sites.length} right={<button onClick={() => go("links")} className="hover:text-foreground">Open</button>}>
        <SegBar parts={[
          { label: "live", n: sites.filter((x) => linkState(d.links[x.url]?.status) === "done").length, tone: "ok" },
          { label: "unchecked", n: sites.filter((x) => !d.links[x.url]).length, tone: "neutral" },
          { label: "failing", n: sites.filter((x) => d.links[x.url] && linkState(d.links[x.url].status) === "failed").length, tone: "bad" },
        ]} />
        <ul className="mt-3 divide-y divide-dashed divide-border/70">
          {sites.slice(0, 12).map((x) => (
            <li key={x.url} className="flex items-center gap-2.5 py-2">
              <StatusIcon state={linkState(d.links[x.url]?.status)} size={16} />
              <div className="min-w-0"><div className="truncate text-[13px] font-medium">{x.name}</div><div className="truncate text-xs text-muted-foreground">{host(x.url)}{d.links[x.url] ? ` · ${d.links[x.url].ms}ms` : ""}</div></div>
            </li>
          ))}
          {!sites.length && <li className="text-[13px] text-muted-foreground">No links yet.</li>}
        </ul>
      </Section>
    </>
  );
}

type Mcp = { server: { responding: boolean; version: string; url: string }; claude: { installed: boolean; registered: boolean; status?: string }; tools: unknown[] };

/** Is the agent connected, what did it last change, what does it read most. */
export function Agent({ d, go }: PanelProps) {
  const [m, setM] = useState<Mcp | null>(null);
  const { rows } = useUsage();
  useEffect(() => { api<Mcp>("mcp_status").then(setM).catch(() => {}); }, []);
  const last = [...d.log].reverse().find((e) => e.src === "agent");
  const reads = (rows ?? []).filter((r) => !r.key.startsWith("path:") && !r.key.startsWith("search:")).slice(0, 8);
  return (
    <>
      <Section title="Connection" right={<button onClick={() => go("integrations")} className="hover:text-foreground">MCP</button>}>
        {m ? (
          <>
            <Field label="Server"><span className="inline-flex items-center gap-1.5"><Plug className="size-3" />{m.server.responding ? "Responding" : "Not responding"}</span></Field>
            <Field label="Claude Code">{m.claude.registered ? (m.claude.status?.replace(/\(.*\)/, "").replace(/^[^A-Za-z]+/, "").trim() || "Registered") : m.claude.installed ? "Not registered" : "Not found"}</Field>
            <Field label="Tools">{m.tools.length}</Field>
          </>
        ) : <p className="text-[13px] text-muted-foreground">Checking…</p>}
      </Section>
      <Section title="Last agent change">
        {last ? <p className="text-[13px]"><span className="inline-flex items-center gap-1.5"><Bot className="size-3.5 text-muted-foreground" /></span> {describe(last).title}<span className="ml-1 text-xs text-muted-foreground">{agoTs(last.ts)}</span></p>
          : <p className="text-[13px] text-muted-foreground">No agent has changed anything yet.</p>}
      </Section>
      <Section title="Most read by agents">
        {reads.length ? (
          <ul className="space-y-1.5">
            {reads.map((r) => <li key={r.key} className="flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate">{r.key.startsWith("ask:") ? `“${r.label}”` : r.label}</span><span className="shrink-0 font-mono text-xs text-muted-foreground">{r.n}×</span></li>)}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">Nothing read through MCP yet. When an agent calls ask, graph or brief, it shows here.</p>}
      </Section>
    </>
  );
}

export const HomeEmpty = () => <Empty>Nothing here.</Empty>;
