"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUp, Check, ChevronRight, Copy, HardDrive, Home, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/hq";
import { cn } from "@/lib/utils";
import type { ViewProps } from "./views";

type GNode = { id: string; kind: string; label: string; deg: number; local?: boolean };
type Export = { nodes: GNode[]; edges: { a: string; b: string; rel: string; how: string }[] };
type Link = { rel: string; dir: "in" | "out"; how: string; id: string; label: string; kind: string };
type Explain = { id: string; kind: string; label: string; text: string; src: string; facts: { k: string; v: string }[]; links: Link[] };
type Ask = { mode: string; seeds: string[]; neighbors: string[]; text: string };

const COLOR: Record<string, string> = {
  person: "#f59e0b", tech: "#60a5fa", project: "#4ade80", experience: "#f472b6", education: "#a78bfa", org: "#94a3b8", achievement: "#facc15",
  claim: "#f87171", answer: "#2dd4bf", link: "#38bdf8", area: "#64748b", decision: "#fb923c", avoid: "#ef4444", goal: "#fde68a",
};
const KIND: Record<string, string> = {
  tech: "Skills & tools", project: "Projects", experience: "Roles", education: "Education", achievement: "Achievements", claim: "Gaps",
  org: "Organisations", area: "Areas", decision: "Decisions", avoid: "Avoid", link: "Links", answer: "Answers", person: "You", goal: "Target",
};
const SINGULAR: Record<string, string> = { tech: "skill", project: "project", experience: "role", education: "education", achievement: "achievement", claim: "gap", org: "organisation", area: "area", decision: "decision", avoid: "avoid", link: "link", answer: "answer", person: "you", goal: "target" };
const BROWSE = ["tech", "project", "experience", "education", "achievement", "claim", "org", "decision"];

/** How a relationship reads from the focused node's side. */
const PHRASE: Record<string, { in: string; out: string }> = {
  USED: { in: "Used in", out: "Technologies used" }, USES: { in: "Used by", out: "Built with" }, IN_AREA: { in: "Contains", out: "Area" },
  EVIDENCED_BY: { in: "Evidence for", out: "Evidence" }, HAS_LINK: { in: "Linked from", out: "Links" }, HAD_ROLE: { in: "Held by", out: "Roles" },
  HELD: { in: "Held by", out: "Roles" }, STUDIED: { in: "Studied by", out: "Education" }, EARNED: { in: "Earned by", out: "Achievements" },
  AT: { in: "People and roles here", out: "At" }, IN: { in: "Contains", out: "Part of" }, PART_OF: { in: "Contains", out: "Part of" },
  ABOUT: { in: "Notes about this", out: "About" }, ANSWERS: { in: "Answered by", out: "Answers" }, AVOIDS: { in: "Avoided by", out: "Avoid" },
  SHOULD_NOT_CLAIM: { in: "Don't claim", out: "Don't claim" }, MENTIONS: { in: "Mentioned in", out: "Mentions" }, WRITTEN_IN: { in: "Languages of", out: "Written in" },
  LISTS: { in: "Listed by", out: "Lists" }, SAME_AS: { in: "Same as", out: "Same as" }, TARGETS: { in: "Targeted by", out: "Target" }, DECIDED: { in: "Decided by", out: "Decisions" },
};
const phrase = (l: Link) => PHRASE[l.rel]?.[l.dir] ?? l.rel.toLowerCase().replace(/_/g, " ");

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Flow map: what points at the focused item on the left, what it leads to on the right. Static, so it reads instead of wobbling. */
function EgoMap({ focus, links, onPick }: { focus: GNode; links: Link[]; onPick: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const MAX = 8;
  const order = (a: Link, b: Link) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label);
  const left = links.filter((l) => l.dir === "in").sort(order);
  const right = links.filter((l) => l.dir === "out").sort(order);
  const rows = Math.max(1, Math.min(MAX, Math.max(left.length, right.length)));
  const W = 640, ROW = 30, H = 44 + rows * ROW, cy = H / 2 + 6;
  const w = Math.min(190, 32 + focus.label.length * 7.2);
  const col = (ls: Link[], x: number, side: "l" | "r") => {
    const shown = ls.slice(0, MAX);
    const y0 = cy - ((shown.length - 1) * ROW) / 2;
    return shown.map((l, i) => {
      const y = y0 + i * ROW;
      const on = hover === l.id;
      const x2 = side === "l" ? W / 2 - w / 2 : W / 2 + w / 2;
      const d = side === "l" ? `M ${x} ${y} C ${x + 70} ${y}, ${x2 - 70} ${cy}, ${x2} ${cy}` : `M ${x2} ${cy} C ${x2 + 70} ${cy}, ${x - 70} ${y}, ${x} ${y}`;
      return (
        <g key={l.id + l.rel} className="cursor-pointer" onClick={() => onPick(l.id)} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)}>
          <path d={d} fill="none" strokeWidth={on ? 1.6 : 1} strokeDasharray={l.how === "derived" ? "3 4" : undefined} stroke={on ? COLOR[l.kind] : "currentColor"} className={on ? "" : "text-border"} />
          <circle cx={x} cy={y} r={on ? 5.5 : 4.5} fill={COLOR[l.kind] ?? "#71717a"} />
          <text x={x + (side === "l" ? -11 : 11)} y={y + 4} textAnchor={side === "l" ? "end" : "start"} fontSize="12" className={on ? "fill-foreground" : "fill-muted-foreground"}>{trunc(l.label, 26)}</text>
          <rect x={side === "l" ? x - 190 : x} y={y - ROW / 2} width={190} height={ROW} fill="transparent" />
        </g>
      );
    });
  };
  const extraL = left.length - MAX, extraR = right.length - MAX;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-2xl" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={`Connections of ${focus.label}`}>
      <text x={150} y={16} textAnchor="middle" fontSize="10.5" className="fill-muted-foreground/70">FOUND IN</text>
      <text x={W - 150} y={16} textAnchor="middle" fontSize="10.5" className="fill-muted-foreground/70">LEADS TO</text>
      {col(left, 150, "l")}
      {col(right, W - 150, "r")}
      <rect x={W / 2 - w / 2} y={cy - 15} width={w} height={30} rx={15} fill={COLOR[focus.kind] ?? "#f59e0b"} fillOpacity={0.16} stroke={COLOR[focus.kind] ?? "#f59e0b"} strokeOpacity={0.6} />
      <text x={W / 2} y={cy + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" className="fill-foreground">{trunc(focus.label, 24)}</text>
      {extraL > 0 && <text x={150} y={H - 6} textAnchor="middle" fontSize="11" className="fill-muted-foreground">+{extraL} more below</text>}
      {extraR > 0 && <text x={W - 150} y={H - 6} textAnchor="middle" fontSize="11" className="fill-muted-foreground">+{extraR} more below</text>}
    </svg>
  );
}

/**
 * Evidence map. Pick any skill, project, role or achievement and see exactly what connects to it: what proves a skill, what a
 * project was built with, where a role used what. It is the same graph agents walk when they answer questions about you.
 */
export function GraphView({ go }: ViewProps) {
  const [data, setData] = useState<Export | null>(null);
  const [trail, setTrail] = useState<string[]>(["person:me"]);
  const focus = trail[trail.length - 1];
  const [info, setInfo] = useState<Explain | null>(null);
  const [kind, setKind] = useState<string>("all");
  const [find, setFind] = useState("");
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // requests from the global search: jump to a node, or run a question
  useEffect(() => {
    const apply = (m: { focus?: string; ask?: string }) => {
      if (m.focus) jump(m.focus);
      if (m.ask) { setQ(m.ask); ask(m.ask); }
    };
    try { const raw = sessionStorage.getItem("hq-graph-msg"); if (raw) { sessionStorage.removeItem("hq-graph-msg"); apply(JSON.parse(raw)); } } catch { /* storage blocked */ }
    const h = (e: Event) => { try { sessionStorage.removeItem("hq-graph-msg"); } catch { /* storage blocked */ } apply((e as CustomEvent).detail); };
    window.addEventListener("hq:graph", h);
    return () => window.removeEventListener("hq:graph", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api<Export>("graph_export").then(setData).catch((e) => toast.error((e as Error).message)); }, []);
  useEffect(() => {
    let dead = false;
    api<Explain>("graph_explain", { node: focus, json: true }).then((x) => { if (!dead) setInfo(x); }).catch(() => { if (!dead) setInfo(null); });
    return () => { dead = true; };
  }, [focus]);

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; data?.nodes.forEach((n) => { c[n.kind] = (c[n.kind] ?? 0) + 1; }); return c; }, [data]);
  const list = useMemo(() => {
    const f = find.trim().toLowerCase();
    return (data?.nodes ?? []).filter((n) => (kind === "all" ? BROWSE.includes(n.kind) : n.kind === kind) && (!f || n.label.toLowerCase().includes(f))).sort((a, b) => b.deg - a.deg || a.label.localeCompare(b.label));
  }, [data, kind, find]);

  // example questions built from what is actually in the profile
  const suggestions = useMemo(() => {
    const top = (k: string) => [...(data?.nodes ?? [])].filter((n) => n.kind === k).sort((a, b) => b.deg - a.deg)[0];
    const s: string[] = [];
    const tech = top("tech"), project = top("project"), role = top("experience");
    if (tech) s.push(`what backs up ${tech.label}?`);
    if (project) s.push(`tell me about ${project.label}`);
    if (role) s.push(`what did I do as ${role.label.split(" @ ")[0]}?`);
    if (counts.claim) s.push("what should I not claim");
    return s;
  }, [data, counts]);

  const node = byId.get(focus) ?? { id: focus, kind: info?.kind ?? "person", label: info?.label ?? "You", deg: 0 };
  const groups = useMemo(() => {
    const g = new Map<string, Link[]>();
    for (const l of info?.links ?? []) { const k = phrase(l); g.set(k, [...(g.get(k) ?? []), l]); }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [info]);

  const ask = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try { setAsked(await api<Ask>("ask", { q: text, json: true })); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }, []);
  /** From the browse list or an answer: start a fresh trail from you. From the map or a connection: extend the trail. */
  const jump = (id: string) => { setTrail(id === "person:me" ? ["person:me"] : ["person:me", id]); setAsked(null); };
  const pick = (id: string) => {
    setAsked(null);
    setTrail((tr) => { const i = tr.indexOf(id); return i >= 0 ? tr.slice(0, i + 1) : [...tr, id].slice(-8); });
  };
  const back = () => setTrail((tr) => (tr.length > 1 ? tr.slice(0, -1) : tr));

  const evidence = () => {
    if (!info) return;
    const lines = [`${info.label} (${SINGULAR[info.kind] ?? info.kind})`, ...info.facts.map((f) => `- ${f.k}: ${f.v}`), "", ...groups.flatMap(([h, ls]) => [`${h}:`, ...ls.map((l) => `- ${l.label}`)])];
    navigator.clipboard.writeText(lines.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success("Evidence copied"); });
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[32rem]">
      {/* browse */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="space-y-2.5 border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find anything…" className="h-8 pl-8 text-[13px] md:text-[13px]" />
          </div>
          <div className="flex flex-wrap gap-1">
            {["all", ...BROWSE.filter((k) => counts[k])].map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn("h-6 rounded-md border px-2 text-[11px] transition", kind === k ? "border-brand/50 bg-brand/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                {k === "all" ? "All" : KIND[k]}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {list.map((n) => (
            <li key={n.id}>
              <button onClick={() => jump(n.id)} className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition", focus === n.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
                <i className="size-2 shrink-0 rounded-full" style={{ background: COLOR[n.kind] }} />
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                {n.local && <span title="Local only, not on GitHub"><HardDrive className="size-3 text-muted-foreground/70" /></span>}
                <span className="font-mono text-[11px] text-muted-foreground/70">{n.deg}</span>
              </button>
            </li>
          ))}
          {data && !list.length && <li className="px-3 py-4 text-xs text-muted-foreground">Nothing matches.</li>}
        </ul>
      </aside>

      {/* focus */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-6 py-3">
          <nav aria-label="Trail" className="mb-2.5 flex items-center gap-1 text-xs">
            <button onClick={() => jump("person:me")} title="Back to you" className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition hover:bg-accent", focus === "person:me" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}><Home className="size-3.5" />{byId.get("person:me")?.label ?? "You"}</button>
            {trail.slice(1).map((id, i) => {
              const n = byId.get(id);
              const last = i === trail.length - 2;
              return (
                <span key={id} className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
                  <button onClick={() => pick(id)} disabled={last} className={cn("h-6 max-w-40 truncate rounded-md px-1.5 transition", last ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{n?.label ?? id}</button>
                </span>
              );
            })}
            {trail.length > 1 && <button onClick={back} className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"><ArrowLeft className="size-3.5" />Back</button>}
          </nav>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder="Ask your profile: what backs up my backend experience?" className="h-9 pr-10 text-[13px] md:text-[13px]" />
              <button onClick={() => ask(q)} disabled={busy || !q.trim()} aria-label="Ask" className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md bg-foreground text-background transition hover:opacity-90 disabled:opacity-40"><ArrowUp className="size-3.5" /></button>
            </div>
          </div>
          {!asked && <div className="mt-2 flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => { setQ(s); ask(s); }} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:text-foreground">{s}</button>)}</div>}
          {asked && (
            <div className="mt-3 rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
                <span>{asked.seeds.length ? `${asked.seeds.length} best match${asked.seeds.length === 1 ? "" : "es"}` : "Nothing stored matches. It is probably not in your profile."}</span>
                <button onClick={() => setAsked(null)} className="hover:text-foreground">Close</button>
              </div>
              <ul className="divide-y divide-border">
                {asked.seeds.slice(0, 6).map((id) => { const n = byId.get(id); return n ? (
                  <li key={id}><button onClick={() => jump(id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-muted/30"><i className="size-2 rounded-full" style={{ background: COLOR[n.kind] }} /><span className="flex-1 truncate">{n.label}</span><span className="text-[11px] text-muted-foreground">{SINGULAR[n.kind] ?? n.kind}</span></button></li>
                ) : null; })}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 pb-10 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><i className="size-2 rounded-full" style={{ background: COLOR[node.kind] }} />{SINGULAR[node.kind] ?? node.kind}{info?.src && <span className="font-mono text-[11px] text-muted-foreground/70">· {info.src}</span>}</div>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{node.label}{byId.get(node.id)?.local && <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-xs font-medium text-muted-foreground"><HardDrive className="size-3.5" />Local only</span>}</h1>
              {info?.text && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{info.text.trim()}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={evidence}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}Copy as evidence</Button>
          </div>

          {focus === "person:me" && <p className="mt-4 text-[13px] text-muted-foreground">Everything in your profile connects through you. Pick a skill or project on the left to see what backs it up.</p>}

          {info && (info.links.length > 0 || info.facts.length > 0) && (
            <div className="mt-5 divide-y divide-border border-y border-border">
              {info.links.length > 0 && <EgoMap focus={node} links={info.links} onPick={pick} />}
              {info.facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3 py-3.5 sm:grid-cols-3 lg:grid-cols-4">
                  {info.facts.map((f) => (
                    <div key={f.k} className="min-w-0">
                      <dt className="text-[11px] text-muted-foreground">{f.k.replace(/_/g, " ")}</dt>
                      <dd className="mt-0.5 line-clamp-3 break-words text-[13px]">{f.v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          <div className="mt-6 space-y-6">
            {groups.map(([head, ls]) => (
              <div key={head}>
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{head}<span className="font-mono normal-case tracking-normal text-muted-foreground/60">{ls.length}</span></div>
                <ul className="divide-y divide-border border-y border-border">
                  {ls.map((l) => (
                    <li key={l.id + l.rel}>
                      <button onClick={() => pick(l.id)} className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 px-3 py-2 text-left text-[13px] transition hover:bg-muted/30">
                        <i className="size-2 shrink-0 rounded-full" style={{ background: COLOR[l.kind] }} />
                        <span className="min-w-0 flex-1 truncate">{l.label}</span>
                        {byId.get(l.id)?.local && <span title="Local only, not on GitHub"><HardDrive className="size-3 text-muted-foreground/70" /></span>}
                        <span className="text-[11px] text-muted-foreground">{SINGULAR[l.kind] ?? l.kind}</span>
                        {l.how === "derived" && <span className="text-[11px] text-muted-foreground/70" title="Inferred by matching names, not written in your data">inferred</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {info && !info.links.length && <p className="text-sm text-muted-foreground">Nothing is connected to this yet.</p>}
          </div>
          <button onClick={() => go("context")} className="mt-8 text-xs text-muted-foreground underline">Edit the underlying facts in Context</button>
        </div>
      </section>
    </div>
  );
}
