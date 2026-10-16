"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { ChevronDown, ChevronUp, Eye, EyeOff, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/hq";
import { cn } from "@/lib/utils";
import type { ViewProps } from "./views";

type GNode = SimulationNodeDatum & { id: string; kind: string; label: string; deg: number };
type GEdge = SimulationLinkDatum<GNode> & { rel: string; how: string; a: string; b: string };
type Export = { nodes: { id: string; kind: string; label: string; deg: number }[]; edges: { a: string; b: string; rel: string; how: string }[] };
type Ask = { mode: string; seeds: string[]; neighbors: string[]; text: string };
type Explain = { id: string; kind: string; label: string; text: string; src: string; facts: { k: string; v: string }[]; links: { rel: string; dir: string; how: string; id: string; label: string; kind: string }[] };
type Tip = { x: number; y: number; n: GNode } | null;

const COLOR: Record<string, string> = {
  person: "#f59e0b", tech: "#60a5fa", project: "#4ade80", experience: "#f472b6", education: "#a78bfa", org: "#94a3b8", achievement: "#facc15",
  claim: "#f87171", answer: "#2dd4bf", link: "#38bdf8", area: "#64748b", decision: "#fb923c", avoid: "#ef4444", goal: "#fde68a",
};
const KIND_NAME: Record<string, string> = { org: "organisation", area: "area / category", experience: "role", answer: "answer", claim: "claim gap" };
const radius = (n: GNode) => (n.kind === "person" ? 9 : 3 + Math.min(7, Math.sqrt(n.deg) * 1.35));
const SUGGEST = ["backend experience", "who did I mentor", "anything with Rust", "what should I not claim", "mobile apps I built"];

/**
 * The knowledge graph as a force-directed canvas. Types of node are pulled toward their own part of the canvas so the
 * structure reads at a glance. Pan by dragging the background, drag a node to move it, wheel to zoom, click for details.
 * Asking a question runs the same hybrid retrieval the MCP `ask` tool uses and lights up the matches.
 */
export function GraphView({ go }: ViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Simulation<GNode, GEdge> | null>(null);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const hover = useRef<string | null>(null);
  const live = useRef({ sel: null as string | null, asked: null as Ask | null, hidden: new Set<string>(), near: new Set<string>(), hub: false, derived: true });

  const [data, setData] = useState<Export | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [info, setInfo] = useState<Explain | null>(null);
  const [asked, setAsked] = useState<Ask | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hub, setHub] = useState(false);
  const [derived, setDerived] = useState(true);
  const [tip, setTip] = useState<Tip>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => { api<Export>("graph_export").then(setData); }, []);

  const kinds = useMemo(() => {
    const c: Record<string, number> = {};
    data?.nodes.forEach((n) => (c[n.kind] = (c[n.kind] ?? 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const draw = useCallback(() => {
    const c = canvas.current, b = box.current;
    if (!c || !b) return;
    const dpr = window.devicePixelRatio || 1;
    const w = b.clientWidth, h = b.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const ctx = c.getContext("2d")!;
    const { x, y, k } = view.current;
    const { sel, asked, hidden, near, hub, derived } = live.current;
    const lit = asked ? new Set([...asked.seeds, ...asked.neighbors]) : null;
    const seeds = new Set(asked?.seeds ?? []);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 + x), dpr * (h / 2 + y));
    const dim = (id: string) => (sel ? !near.has(id) : lit ? !lit.has(id) : false);

    for (const e of edgesRef.current) {
      const s = e.source as GNode, t = e.target as GNode;
      if (hidden.has(s.kind) || hidden.has(t.kind) || s.x == null || t.x == null) continue;
      const on = sel ? e.a === sel || e.b === sel : lit ? lit.has(e.a) && lit.has(e.b) : false;
      // links to you touch half the graph; they stay out of the way until selected
      if (!on && !hub && (s.kind === "person" || t.kind === "person")) continue;
      if (!on && !derived && e.how === "derived") continue;
      ctx.strokeStyle = on ? "rgba(251,191,36,.8)" : dim(e.a) || dim(e.b) ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.13)";
      ctx.lineWidth = (on ? 1.4 : 0.8) / k;
      ctx.setLineDash(e.how === "derived" ? [3 / k, 3 / k] : []);
      ctx.beginPath(); ctx.moveTo(s.x, s.y!); ctx.lineTo(t.x, t.y!); ctx.stroke();
      if (sel && on && k > 0.6) {
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(251,191,36,.9)";
        ctx.font = `${8.5 / k}px ui-monospace, monospace`;
        ctx.fillText(e.rel.toLowerCase().replace(/_/g, " "), (s.x + t.x) / 2 + 2 / k, (s.y! + t.y!) / 2 - 2 / k);
      }
    }
    ctx.setLineDash([]);
    for (const n of nodesRef.current) {
      if (hidden.has(n.kind) || n.x == null) continue;
      const r = radius(n);
      ctx.globalAlpha = dim(n.id) ? 0.14 : 1;
      ctx.fillStyle = COLOR[n.kind] ?? "#888";
      ctx.beginPath(); ctx.arc(n.x, n.y!, r, 0, Math.PI * 2); ctx.fill();
      if (seeds.has(n.id) || n.id === sel || n.id === hover.current) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 / k; ctx.beginPath(); ctx.arc(n.x, n.y!, r + 2.5 / k, 0, Math.PI * 2); ctx.stroke();
      }
      const label = n.id === sel || n.id === hover.current || seeds.has(n.id) || (!dim(n.id) && (n.deg >= 14 || k > 1.7 || (lit?.has(n.id) ?? false) || near.has(n.id)));
      if (label) {
        ctx.globalAlpha = dim(n.id) ? 0.3 : 1;
        ctx.fillStyle = "#e7e8ec";
        ctx.font = `${11 / k}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label, n.x + r + 3 / k, n.y! + 3.5 / k);
      }
    }
    ctx.globalAlpha = 1;
  }, []);

  // keep the draw loop's view of the state current
  useEffect(() => {
    const near = new Set<string>();
    if (sel) {
      near.add(sel);
      edgesRef.current.forEach((e) => { if (e.a === sel) near.add(e.b); if (e.b === sel) near.add(e.a); });
    }
    live.current = { sel, asked, hidden, near, hub, derived };
    draw();
  }, [sel, asked, hidden, hub, derived, draw]);

  /** Zoom and centre so every visible node is in frame. */
  const fit = useCallback(() => {
    const b = box.current;
    if (!b) return;
    const vis = nodesRef.current.filter((n) => !live.current.hidden.has(n.kind) && n.x != null);
    if (!vis.length) return;
    const xs = vis.map((n) => n.x!), ys = vis.map((n) => n.y!);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(3, Math.max(0.3, 0.9 * Math.min(b.clientWidth / (x1 - x0 + 70), b.clientHeight / (y1 - y0 + 70))));
    view.current = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
    draw();
  }, [draw]);

  // build the simulation: links pull, nodes repel, and each kind of node is nudged toward its own anchor on a ring
  useEffect(() => {
    if (!data) return;
    const nodes: GNode[] = data.nodes.map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges: GEdge[] = data.edges.filter((e) => byId.has(e.a) && byId.has(e.b)).map((e) => ({ ...e, source: e.a, target: e.b }));
    nodesRef.current = nodes; edgesRef.current = edges;
    const order = [...new Set(nodes.filter((n) => n.kind !== "person").map((n) => n.kind))];
    const anchor = (kind: string) => {
      const i = order.indexOf(kind);
      const a = (i / Math.max(1, order.length)) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * 230, y: Math.sin(a) * 230 };
    };
    const person = nodes.find((n) => n.kind === "person");
    if (person) { person.fx = 0; person.fy = 0; }
    const s = forceSimulation<GNode>(nodes)
      .force("link", forceLink<GNode, GEdge>(edges).id((n) => n.id).distance((l) => (l.rel === "IN_AREA" || l.rel === "IN" ? 26 : l.rel === "HELD" || l.rel === "HAS_LINK" ? 70 : 44)).strength((l) => ((l.source as GNode).kind === "person" || (l.target as GNode).kind === "person" ? 0.08 : 0.5)))
      .force("charge", forceManyBody<GNode>().strength(-34))
      .force("x", forceX<GNode>((n) => anchor(n.kind).x).strength((n) => (n.kind === "person" ? 0 : 0.07)))
      .force("y", forceY<GNode>((n) => anchor(n.kind).y).strength((n) => (n.kind === "person" ? 0 : 0.07)))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<GNode>((n) => radius(n) + 2.5))
      .stop();
    s.tick(320);          // settle off-screen so the graph appears already arranged
    fit();
    s.on("tick", draw);   // later motion only happens while a node is being dragged
    sim.current = s;
    return () => { s.stop(); };
  }, [data, draw, fit]);

  // pointer handling: pan, node drag, zoom, hover, select
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const world = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect(), { x, y, k } = view.current;
      return { x: (e.clientX - r.left - r.width / 2 - x) / k, y: (e.clientY - r.top - r.height / 2 - y) / k };
    };
    const at = (e: { clientX: number; clientY: number }) => {
      const p = world(e), k = view.current.k;
      let best: GNode | null = null, bd = Infinity;
      for (const n of nodesRef.current) {
        if (live.current.hidden.has(n.kind) || n.x == null) continue;
        const d = Math.hypot(n.x - p.x, n.y! - p.y);
        if (d < radius(n) + 4 / k && d < bd) { best = n; bd = d; }
      }
      return best;
    };
    let drag: { sx: number; sy: number; ox: number; oy: number; moved: boolean; node: GNode | null } | null = null;
    const down = (e: PointerEvent) => {
      drag = { sx: e.clientX, sy: e.clientY, ox: view.current.x, oy: view.current.y, moved: false, node: at(e) };
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.node && drag.moved) {
          const p = world(e);
          drag.node.fx = p.x; drag.node.fy = p.y;
          sim.current?.alphaTarget(0.25).restart();
        } else if (!drag.node) {
          view.current.x = drag.ox + dx; view.current.y = drag.oy + dy;
        }
        setTip(null);
      } else {
        const n = at(e);
        if (hover.current !== (n?.id ?? null)) {
          hover.current = n?.id ?? null;
          c.style.cursor = n ? "pointer" : "grab";
          const r = c.getBoundingClientRect();
          setTip(n ? { x: e.clientX - r.left, y: e.clientY - r.top, n } : null);
        }
      }
      draw();
    };
    const up = (e: PointerEvent) => {
      if (drag) {
        if (!drag.moved) setSel(at(e)?.id ?? null);
        if (drag.node && drag.moved) { drag.node.fx = null; drag.node.fy = null; sim.current?.alphaTarget(0); }
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), v = view.current;
      const k2 = Math.min(5, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const px = e.clientX - r.left - r.width / 2, py = e.clientY - r.top - r.height / 2;
      v.x = px - ((px - v.x) / v.k) * k2; v.y = py - ((py - v.y) / v.k) * k2; v.k = k2;
      draw();
    };
    const leave = () => { hover.current = null; setTip(null); draw(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setSel(null); setAsked(null); } };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("keydown", key);
    const ro = new ResizeObserver(draw); if (box.current) ro.observe(box.current);
    return () => {
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); ro.disconnect();
    };
  }, [draw, data]);

  useEffect(() => {
    if (!sel) { setInfo(null); return; }
    api<Explain>("graph_explain", { node: sel, json: true }).then(setInfo).catch(() => setInfo(null));
  }, [sel]);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true); setSel(null);
    try {
      const res = await api<Ask | string>("ask", { q: text, json: true, limit: 8, depth: 1 });
      // older servers answered a miss with a bare string; keep the view alive either way
      setAsked(typeof res === "string" ? { mode: "", seeds: [], neighbors: [], text: res } : { ...res, seeds: res.seeds ?? [], neighbors: res.neighbors ?? [] });
    } finally { setBusy(false); }
  };
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // turn "(id kind:key)" in the answer text into links that select the node
  const answer = (asked?.text ?? "").split(/(\(id [^)]+\))/g).map((part, i) => {
    const m = /^\(id ([^)]+)\)$/.exec(part);
    return m ? <button key={i} onClick={() => setSel(m[1])} className="text-brand hover:underline">{part}</button> : <span key={i}>{part}</span>;
  });

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-64 flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder="Ask your graph: backend experience, who did I mentor, anything with Rust…"
            className="h-9 w-full rounded-lg border border-border bg-card/40 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-brand/40" />
        </div>
        <Button size="sm" disabled={busy || !q.trim()} onClick={() => ask(q)}><Search className="size-3.5" />{busy ? "Thinking…" : "Ask"}</Button>
        <Button size="sm" variant="outline" onClick={fit}>Fit</Button>
        {(asked || sel) && <Button size="sm" variant="outline" onClick={() => { setAsked(null); setSel(null); setQ(""); }}><X className="size-3.5" />Clear</Button>}
        <div className="flex w-full flex-wrap gap-1.5 pt-1">
          {!asked && SUGGEST.map((s) => <button key={s} onClick={() => { setQ(s); ask(s); }} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition hover:border-brand/40 hover:text-foreground">{s}</button>)}
          {asked && <span className="text-xs text-muted-foreground">{asked.mode} · {asked.seeds.length} matches, {asked.neighbors.length} connected</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={box} className="relative min-w-0 flex-1 overflow-hidden">
          <canvas ref={canvas} className="absolute inset-0 size-full cursor-grab touch-none" />
          {!data && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Building graph…</div>}

          {tip && (
            <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-xl" style={{ left: Math.min(tip.x + 14, (box.current?.clientWidth ?? 600) - 190), top: tip.y + 14 }}>
              <div className="flex items-center gap-1.5 font-medium"><i className="size-2 rounded-full" style={{ background: COLOR[tip.n.kind] }} />{tip.n.label}</div>
              <div className="mt-0.5 text-muted-foreground">{KIND_NAME[tip.n.kind] ?? tip.n.kind} · {tip.n.deg} connection{tip.n.deg === 1 ? "" : "s"}</div>
            </div>
          )}

          {/* legend: collapsed to a pill so it never sits over the graph; open it to filter node types and link display */}
          <div className="absolute bottom-3 left-3 text-xs">
            {legendOpen ? (
              <div className="w-48 rounded-xl border border-border bg-background/90 p-2 backdrop-blur">
                <button onClick={() => setLegendOpen(false)} className="flex w-full items-center justify-between px-1.5 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground">
                  Node types <ChevronDown className="size-3.5" />
                </button>
                <ul className="max-h-44 overflow-y-auto">
                  {kinds.map(([k, n]) => (
                    <li key={k}>
                      <button onClick={() => toggle(k)} className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-[3px] text-left transition hover:bg-accent/40", hidden.has(k) && "opacity-40")}>
                        <i className="size-2.5 shrink-0 rounded-full" style={{ background: COLOR[k] ?? "#888" }} />
                        <span className="flex-1 truncate">{KIND_NAME[k] ?? k}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
                        {hidden.has(k) ? <EyeOff className="size-3 text-muted-foreground" /> : <Eye className="size-3 text-muted-foreground/50" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
                  <button onClick={() => setHub((v) => !v)} className="flex w-full items-center justify-between rounded-md px-1.5 py-[3px] transition hover:bg-accent/40"><span>Links to you</span><span className={cn("font-mono text-[10px]", hub ? "text-brand" : "text-muted-foreground")}>{hub ? "shown" : "hidden"}</span></button>
                  <button onClick={() => setDerived((v) => !v)} className="flex w-full items-center justify-between rounded-md px-1.5 py-[3px] transition hover:bg-accent/40"><span>Inferred (dashed)</span><span className={cn("font-mono text-[10px]", derived ? "text-brand" : "text-muted-foreground")}>{derived ? "shown" : "hidden"}</span></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setLegendOpen(true)} className="flex items-center gap-2 rounded-full border border-border bg-background/90 py-1 pl-2.5 pr-2 backdrop-blur transition hover:border-brand/40">
                <span className="flex -space-x-1">{kinds.slice(0, 5).map(([k]) => <i key={k} className="size-2.5 rounded-full ring-1 ring-background" style={{ background: COLOR[k] ?? "#888" }} />)}</span>
                Node types{hidden.size > 0 && <span className="font-mono text-[10px] text-brand">{hidden.size} hidden</span>}
                <ChevronUp className="size-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            {data ? `${data.nodes.length} nodes · ${data.edges.length} edges · every node connected` : ""}
          </div>
        </div>

        <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-border @4xl:block">
          {info ? (
            <div className="p-4">
              <div className="flex items-start gap-2">
                <i className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: COLOR[info.kind] ?? "#888" }} />
                <div className="min-w-0 flex-1"><h2 className="font-medium leading-snug">{info.label}</h2><Badge variant="outline" className="mt-1">{KIND_NAME[info.kind] ?? info.kind}</Badge></div>
                <button aria-label="Close" onClick={() => setSel(null)} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
              </div>
              {info.text.trim() && <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{info.text.length > 420 ? info.text.slice(0, 420) + "…" : info.text}</p>}
              {info.facts.length > 0 && (
                <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-[13px]">
                  {info.facts.map((f) => <div key={f.k} className="flex gap-3"><dt className="w-24 shrink-0 font-mono text-[11px] uppercase text-muted-foreground">{f.k.replace(/_/g, " ")}</dt><dd className="min-w-0 break-words">{f.v}</dd></div>)}
                </dl>
              )}
              {info.src && <p className="mt-3 font-mono text-[11px] text-muted-foreground">stored at {info.src}</p>}
              {info.kind === "project" && <Button className="mt-3" size="sm" variant="outline" onClick={() => go("project", info.label)}>Open project</Button>}
              <h3 className="mt-5 border-t border-border pt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Connections {info.links.length}</h3>
              <ul className="mt-2 space-y-1">
                {info.links.slice(0, 60).map((l, i) => (
                  <li key={i}>
                    <button onClick={() => setSel(l.id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition hover:bg-accent/40">
                      <i className="size-2 shrink-0 rounded-full" style={{ background: COLOR[l.kind] ?? "#888" }} />
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{l.dir === "out" ? "" : "← "}{l.rel}{l.how === "derived" ? " ·d" : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : asked ? (
            <div className="p-4"><h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Answer</h2><pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-foreground/90">{answer}</pre></div>
          ) : (
            <div className="space-y-3 p-4 text-[13px] leading-relaxed text-muted-foreground">
              <h2 className="font-medium text-foreground">Your knowledge graph</h2>
              <p>Everything in your profile as connected facts: roles, schools, projects, technologies, achievements, claims and decisions. It is rebuilt from your single profile file each time, so it never drifts.</p>
              <p>Click a node to read it and follow its connections, drag nodes to rearrange, and ask a question to light up the matches. The same retrieval is available to AI chats through the MCP tools <code>ask</code>, <code>graph_neighbors</code>, <code>graph_path</code> and <code>graph_explain</code>.</p>
              <p>Solid lines are stated in your data. Dashed lines were inferred by matching names. Press Esc to clear.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
