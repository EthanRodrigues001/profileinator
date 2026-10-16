"use client";
import { useState } from "react";
import { StatusIcon, linkState, type State } from "@/components/kit/status-icon";
import { Badge } from "@/components/ui/badge";
import { score } from "@/components/hq/score";
import type { Data } from "@/components/hq/use-hq";
import type { TabKind } from "./nav";

type Props = { d: Data; onOpen: (kind: TabKind, arg?: string) => void };

const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{title}</h4>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function Row({ name, sub, state }: { name: string; sub: string; state: State }) {
  return (
    <div className="flex items-center gap-3">
      <StatusIcon state={state} size={20} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

/** Right rail: link health grouped like an agent roster, or the profile context at a glance. */
export function RightPanel({ d, onOpen }: Props) {
  const [tab, setTab] = useState<"status" | "context">("status");
  const s = score(d);
  const sites = [
    ...d.me.links.map((l) => ({ name: l.label, url: l.url })),
    ...d.repos.filter((r) => r.pinned && r.homepage).map((r) => ({ name: r.name, url: r.homepage! })),
  ];
  const by = (f: (st?: string) => boolean) => sites.filter((x) => f(d.links[x.url]?.status));
  const live = by((st) => st === "ok");
  const attn = by((st) => st === "gated" || st === "dead" || st === "down");
  const unchecked = by((st) => !st);
  const missing = Object.entries(d.me.answers ?? {}).filter(([, v]) => v === null).map(([k]) => k);

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-border xl:flex">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        {(["status", "context"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-2.5 py-1 text-sm capitalize transition ${tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "status" ? "Health" : "Context"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "status" ? (
          <>
            <Group title="Live">
              {live.map((x) => <Row key={x.url} name={x.name} sub={`${host(x.url)} · ${d.links[x.url].ms}ms`} state="done" />)}
              {!live.length && <p className="text-xs text-muted-foreground">Run a link check to see live sites.</p>}
            </Group>
            {attn.length > 0 && (
              <Group title="Needs attention">
                {attn.map((x) => <Row key={x.url} name={x.name} sub={d.links[x.url].status === "gated" ? "Blocks bots, check by hand" : `Broken (${d.links[x.url].code || "no response"})`} state={linkState(d.links[x.url].status)} />)}
              </Group>
            )}
            {unchecked.length > 0 && (
              <Group title="Unchecked">
                {unchecked.slice(0, 5).map((x) => <Row key={x.url} name={x.name} sub={host(x.url)} state="backlog" />)}
              </Group>
            )}
          </>
        ) : (
          <>
            <Group title="Target">
              <p className="text-sm text-foreground/90">{d.me.target || "Not set"}</p>
            </Group>
            <Group title="Strong skills">
              <div className="flex flex-wrap gap-1.5">{d.me.skills.strong.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}</div>
            </Group>
            <Group title="Missing answers">
              {missing.length ? (
                <button onClick={() => onOpen("context")} className="flex flex-wrap gap-1.5 text-left">
                  {missing.map((k) => <Badge key={k} variant="outline" className="text-warn">{k}</Badge>)}
                </button>
              ) : <p className="text-xs text-muted-foreground">All answered.</p>}
            </Group>
          </>
        )}
        <div className="mt-2 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs">
          <div><div className="text-muted-foreground">Score</div><div className="mt-0.5 font-mono text-base">{s.pct}</div></div>
          <div><div className="text-muted-foreground">To do</div><div className="mt-0.5 font-mono text-base">{s.todos.length}</div></div>
        </div>
      </div>
    </aside>
  );
}
