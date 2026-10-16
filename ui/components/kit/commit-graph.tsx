"use client";
import { useMemo } from "react";
import type { Commit } from "@/lib/hq";
import { cn } from "@/lib/utils";
import { Initials } from "./cells";

const LANE_W = 16;
const ROW_H = 52;
const COLORS = ["#4ade80", "#f472b6", "#fbbf24", "#60a5fa", "#a78bfa", "#2dd4bf", "#fb923c"];
const colorOf = (lane: number) => COLORS[lane % COLORS.length];
const x = (lane: number) => 14 + lane * LANE_W;

type Row = { c: Commit; col: number; top: (string | null)[]; bottom: (string | null)[] };

/**
 * Assign every commit a lane. `lanes[i]` holds the sha lane i is waiting for. A commit takes the lane that expects
 * it (or a free one if it is a new branch head), frees any other lane converging on it, then hands its first parent
 * the same lane and each extra (merge) parent a lane of its own.
 */
export function layout(commits: Commit[]): { rows: Row[]; lanes: number } {
  let lanes: (string | null)[] = [];
  const rows: Row[] = [];
  let width = 1;
  for (const c of commits) {
    const top = [...lanes];
    let col = lanes.indexOf(c.sha);
    if (col === -1) {
      col = lanes.indexOf(null);
      if (col === -1) col = lanes.length;
      lanes[col] = c.sha;
    }
    lanes = lanes.map((s, i) => (s === c.sha && i !== col ? null : s));
    const [first, ...merges] = c.parents;
    lanes[col] = first ?? null;
    for (const p of merges) {
      if (lanes.includes(p)) continue;
      let j = lanes.indexOf(null);
      if (j === -1) j = lanes.length;
      lanes[j] = p;
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    rows.push({ c, col, top, bottom: [...lanes] });
    width = Math.max(width, top.length, lanes.length, col + 1);
  }
  return { rows, lanes: width };
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (y1 + y2) / 2;
  return `M${x1} ${y1} C${x1} ${m} ${x2} ${m} ${x2} ${y2}`;
};

function Lines({ row, width }: { row: Row; width: number }) {
  const { c, col, top, bottom } = row;
  const mid = ROW_H / 2;
  const paths: React.ReactNode[] = [];
  top.forEach((s, i) => {
    if (!s) return;
    if (s === c.sha) paths.push(<path key={`t${i}`} d={i === col ? `M${x(i)} 0 V${mid}` : curve(x(i), 0, x(col), mid)} stroke={colorOf(i)} />);
    else paths.push(<path key={`p${i}`} d={`M${x(i)} 0 V${ROW_H}`} stroke={colorOf(i)} />);
  });
  c.parents.forEach((p, k) => {
    const j = bottom.indexOf(p);
    if (j === -1) return;
    paths.push(<path key={`b${k}`} d={j === col ? `M${x(col)} ${mid} V${ROW_H}` : curve(x(col), mid, x(j), ROW_H)} stroke={colorOf(j === col ? col : j)} />);
  });
  const merge = c.parents.length > 1;
  return (
    <svg width={width} height={ROW_H} className="absolute left-0 top-0" fill="none" strokeWidth="1.6" strokeLinecap="round">
      {paths}
      <circle cx={x(col)} cy={mid} r={merge ? 4 : 3.5} fill={merge ? "#111113" : colorOf(col)} stroke={colorOf(col)} strokeWidth={merge ? 2 : 0} />
    </svg>
  );
}

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayLabel = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
};

function Author({ c, className }: { c: Commit; className?: string }) {
  return (
    <span className={cn("shrink-0 items-center gap-2 rounded-md bg-white/5 py-0.5 pl-0.5 pr-2.5", className)}>
      <Initials text={c.name || c.author} className="size-5 text-[9px]" />{c.author}
    </span>
  );
}

/** Files changed and +/- lines; merge commits carry no diff of their own. */
function Diff({ c }: { c: Commit }) {
  return (
    <span className="hidden w-36 shrink-0 items-center justify-end gap-1.5 font-mono text-xs @xl:flex">
      {c.parents.length > 1 ? <span className="text-muted-foreground/60">merge</span> : (
        <>
          {c.files != null && <span className="text-muted-foreground">{c.files} {c.files === 1 ? "file" : "files"}</span>}
          <span className="text-emerald-400">+{c.add}</span><span className="text-red-400">−{c.del}</span>
        </>
      )}
    </span>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleString("en", { month: "short" })} ${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Commit history with the branch graph on the left: hash, message, author chip, date and files/+/- on the right.
 * Pass `graph={false}` for a flat feed (commits from several repos have no shared ancestry to draw).
 */
export function CommitGraph({ commits, graph = true, showRepo, groupDays, onOpen }: { commits: Commit[]; graph?: boolean; showRepo?: boolean; groupDays?: boolean; onOpen?: (c: Commit) => void }) {
  const { rows, lanes } = useMemo(() => (graph ? layout(commits) : { rows: commits.map((c) => ({ c, col: 0, top: [], bottom: [] })), lanes: 0 }), [commits, graph]);
  const gw = graph ? lanes * LANE_W + 20 : 0;

  return (
    <div className="@container">
      {rows.map((r, idx) => (
        <div key={r.c.sha + (r.c.repo ?? "")}>
          {groupDays && (idx === 0 || dayKey(rows[idx - 1].c.date) !== dayKey(r.c.date)) && (
            <div className="sticky top-0 z-[5] flex h-8 items-center gap-2 border-y border-border/60 bg-background/95 px-4 text-xs text-muted-foreground backdrop-blur">
              <span className="font-medium text-foreground/80">{dayLabel(r.c.date)}</span>
              <span>{rows.filter((x) => dayKey(x.c.date) === dayKey(r.c.date)).length} commits</span>
            </div>
          )}
        <div onClick={() => onOpen?.(r.c)}
          className={cn("relative flex items-center gap-4 pr-4 text-[13px] transition-colors hover:bg-accent/30", onOpen && "cursor-pointer")}
          style={{ height: ROW_H, paddingLeft: gw + 8 }}>
          {graph && <Lines row={r} width={gw} />}
          <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{r.c.short}</span>
          {graph ? (
            <>
              <span className="min-w-0 flex-1 truncate">{r.c.msg}</span>
              <Author c={r.c} className="hidden @2xl:flex" />
              <span className="hidden w-28 shrink-0 text-right font-mono text-xs text-muted-foreground @3xl:block">{when(r.c.date)}</span>
            </>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.c.msg}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {showRepo && <span className="max-w-[40%] truncate font-medium text-foreground/70">{r.c.repo}</span>}
                {showRepo && <span>·</span>}
                <span className="truncate">{r.c.author}</span>
                <span>·</span>
                <span className="shrink-0 font-mono">{when(r.c.date)}</span>
              </span>
            </span>
          )}
          <Diff c={r.c} />
        </div>
        </div>
      ))}
      {!rows.length && <div className="py-16 text-center text-sm text-muted-foreground">No commits loaded.</div>}
    </div>
  );
}
