"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Inbox } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { toast } from "sonner";
import { api } from "@/lib/hq";
import type { Data } from "@/components/hq/use-hq";
import type { TabKind } from "@/components/shell/nav";

/** Props every rail panel receives. */
export type PanelProps = {
  d: Data;
  go: (kind: TabKind, arg?: string) => void;
  run: (op: string, label: string, args?: object) => Promise<void>;
  reload: () => Promise<void>;
};

export function Section({ title, right, count, children, className }: { title?: string; right?: React.ReactNode; count?: number | string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border-b border-dashed border-border px-4 py-4 last:border-b-0 ${className ?? ""}`}>
      {title && (
        <div className="mb-3 flex items-center gap-2 text-[14px] font-medium">
          <span>{title}</span>
          {count !== undefined && count !== "" && <Pill>{count}</Pill>}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{right}</span>
        </div>
      )}
      {children}
    </section>
  );
}

/** Rows of label / value pairs separated by dashed rules. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/70 py-1.5 text-[13px] last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

const TONES = {
  neutral: "border-border bg-muted/40 text-muted-foreground",
  ok: "border-ok/25 bg-ok/10 text-ok",
  warn: "border-warn/25 bg-warn/10 text-warn",
  bad: "border-bad/25 bg-bad/10 text-bad",
  brand: "border-brand/25 bg-brand/10 text-brand",
};
export type Tone = keyof typeof TONES;

/** Small rounded label: counts, statuses. */
export function Pill({ children, tone = "neutral", icon }: { children: React.ReactNode; tone?: Tone; icon?: React.ReactNode }) {
  return <span className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${TONES[tone]}`}>{icon}{children}</span>;
}

/** Row of 2 to 4 big numbers in one bordered strip, split by thin rules. */
export function Stats({ items }: { items: { value: React.ReactNode; label: string }[] }) {
  return (
    <div className="grid rounded-xl border border-border" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((x, i) => (
        <div key={x.label} className={`px-2 py-2.5 text-center ${i ? "border-l border-border" : ""}`}>
          <div className="text-[15px] font-semibold tabular-nums leading-tight">{x.value}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{x.label}</div>
        </div>
      ))}
    </div>
  );
}

const SEG: Record<Tone, string> = { neutral: "bg-muted-foreground/40", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", brand: "bg-brand" };

/** Segmented tick bar with a legend, like a status overview. */
export function SegBar({ parts }: { parts: { label: string; n: number; tone: Tone }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  const TICKS = 48;
  const ticks: Tone[] = [];
  parts.forEach((p) => { const k = total ? Math.round((p.n / total) * TICKS) : 0; for (let i = 0; i < k; i++) ticks.push(p.tone); });
  while (ticks.length < TICKS) ticks.push("neutral");
  return (
    <div>
      <div className="flex h-6 items-stretch gap-[2px]">{ticks.slice(0, TICKS).map((t, i) => <span key={i} className={`w-full rounded-[2px] ${total ? SEG[t] : "bg-muted"}`} />)}</div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><i className={`h-3 w-[3px] rounded-full ${SEG[p.tone]}`} />{p.n} {p.label}</span>)}
      </div>
    </div>
  );
}

/** Vertical timeline: time, dot on a rail, text. */
export function Timeline({ items }: { items: { time: string; text: React.ReactNode; aside?: React.ReactNode }[] }) {
  return (
    <ul className="relative ml-1 border-l border-border">
      {items.map((x, i) => (
        <li key={i} className="relative flex items-baseline gap-2 py-1.5 pl-4 text-[13px]">
          <i className="absolute -left-[3px] top-[13px] size-[5px] rounded-full bg-muted-foreground/60" />
          <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{x.time}</span>
          <span className="min-w-0 flex-1">{x.text}</span>
          {x.aside && <span className="shrink-0">{x.aside}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Dashed-rule list. */
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-dashed divide-border/70">{children}</ul>;
}

export function Empty({ children, title }: { children: React.ReactNode; title?: string }) {
  return <div className="p-4"><EmptyState compact icon={Inbox} title={title ?? "Nothing here yet"} hint={children} /></div>;
}

export function CopyButton({ text, label = "Copy", done = "Copied" }: { text: string | (() => string | Promise<string>); label?: string; done?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(typeof text === "string" ? text : await text()); setOk(true); toast.success(done); setTimeout(() => setOk(false), 1400); }}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs transition hover:border-brand/40 hover:bg-card">
      {ok ? <Check className="size-3" /> : <Copy className="size-3" />}{label}
    </button>
  );
}

export type UsageRow = { key: string; label: string; n: number; last: number };

/** What agents have read, from the usage ledger. Reloaded on demand. */
export function useUsage() {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const load = useCallback(() => api<UsageRow[]>("usage", { limit: 200 }).then(setRows).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  return { rows, reload: load };
}

export const agoTs = (ts?: number | null) => {
  if (!ts) return "never";
  const d = (Date.now() / 1000 - ts) / 86400;
  return d < 1 / 24 ? "just now" : d < 1 ? `${Math.round(d * 24)}h ago` : d < 60 ? `${Math.round(d)}d ago` : `${Math.round(d / 30)}mo ago`;
};

/** "Agents read this 12 times, last 2d ago" for a graph node id or path key. */
export function AgentReads({ keys, rows }: { keys: string[]; rows: UsageRow[] | null }) {
  const hit = (rows ?? []).filter((r) => keys.includes(r.key));
  const n = hit.reduce((a, r) => a + r.n, 0);
  const last = Math.max(0, ...hit.map((r) => r.last));
  return <Field label="Agent reads">{n ? `${n} · ${agoTs(last)}` : "none yet"}</Field>;
}
