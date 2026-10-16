"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Amber ramp: index 0 is an empty day, 4 the busiest. Shared by the cells and the legend. */
const LEVEL = ["bg-white/[0.05]", "bg-amber-400/25", "bg-amber-400/45", "bg-amber-400/70", "bg-amber-400"];

type Props = {
  /** YYYY-MM-DD (local time) -> number of commits that day. */
  counts: Record<string, number>;
  weeks?: number;
  /** Cell edge in px. */
  size?: number;
  gap?: number;
  /** Noun for the footer total, e.g. "commits". */
  unit?: string;
  className?: string;
};

/**
 * Contribution graph in the style of Kibo UI: fixed-size cells in week columns (Sunday first), month labels along the
 * top, Mon/Wed/Fri labels on the left, and a footer with the total and a Less/More legend.
 */
export function ActivityGrid({ counts, weeks = 26, size = 10, gap = 3, unit = "commits", className }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + d)),
  );
  const max = Math.max(1, ...Object.values(counts));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const total = cols.flat().reduce((a, d) => a + (d <= today ? counts[iso(d)] ?? 0 : 0), 0);

  // Month label sits on the first column whose Monday starts a new month.
  let prev = -1;
  const months = cols.map((c) => {
    const m = c[1].getMonth();
    const show = m !== prev;
    prev = m;
    return show ? c[1].toLocaleString("en", { month: "short" }) : "";
  });

  const cell = { width: size, height: size };
  return (
    <div className={cn("inline-block max-w-full overflow-x-auto", className)}>
      <div className="flex" style={{ gap }}>
        <div className="flex flex-col pt-[18px] text-[10px] leading-none text-muted-foreground" style={{ gap, paddingRight: 4 }}>
          {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => <span key={i} className="flex items-center" style={{ height: size }}>{l}</span>)}
        </div>
        <div>
          <div className="flex text-[10px] leading-none text-muted-foreground" style={{ gap, height: 18 }}>
            {months.map((m, i) => <span key={i} className="relative" style={{ width: size }}><span className="absolute left-0 top-0 whitespace-nowrap">{m}</span></span>)}
          </div>
          <div className="flex" style={{ gap }}>
            {cols.map((c, w) => (
              <div key={w} className="flex flex-col" style={{ gap }}>
                {c.map((d) => {
                  const n = counts[iso(d)] ?? 0;
                  return (
                    <i key={iso(d)} style={cell}
                      onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, text: `${n} ${n === 1 ? unit.replace(/s$/, "") : unit} on ${d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}` }); }}
                      onMouseLeave={() => setTip(null)}
                      className={cn("rounded-[3px] transition-transform hover:scale-125", d > today ? "opacity-0" : LEVEL[level(n)])} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {tip && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-xl" style={{ left: tip.x, top: tip.y - 6 }}>{tip.text}</div>
      )}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{total.toLocaleString()} {unit} in the last {weeks} weeks</span>
        <span className="flex items-center gap-1.5">
          Less
          <span className="flex" style={{ gap: 2 }}>{LEVEL.map((l, i) => <i key={i} className={cn("rounded-[2px]", l)} style={{ width: size - 2, height: size - 2 }} />)}</span>
          More
        </span>
      </div>
    </div>
  );
}
