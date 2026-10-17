import { LANG_COLOR } from "@/lib/hq";
import { Tip } from "./tip";

type Slice = { name: string; pct: number; color: string; other?: boolean };

/** Languages as one segmented bar (small slices fold into a hatched "Other") with a percentage legend. */
export function LangBar({ langs, max = 5 }: { langs: Record<string, number>; max?: number }) {
  const total = Object.values(langs).reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-xs text-muted-foreground">No language data.</p>;
  const all = Object.entries(langs).sort((a, b) => b[1] - a[1]);
  const big = all.filter(([, v], i) => i < max && v / total >= 0.01);
  const rest = all.filter((x) => !big.includes(x)).reduce((a, [, v]) => a + v, 0);
  const slices: Slice[] = big.map(([name, v]) => ({ name, pct: (v / total) * 100, color: LANG_COLOR[name] ?? "#71717a" }));
  if (rest > 0) slices.push({ name: "Other", pct: (rest / total) * 100, color: "#52525b", other: true });
  const fmt = (p: number) => (p < 1 ? "<1%" : `${Math.round(p)}%`);
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {slices.map((s) => (
          <div key={s.name} className="h-full" style={{ width: `${Math.max(s.pct, 1.5)}%`, minWidth: 6 }}>
            <Tip content={`${s.name} ${s.pct.toFixed(1)}%`} className="block h-full w-full">
              <span className="block h-full w-full rounded-[3px]" style={{
                background: s.other ? `repeating-linear-gradient(135deg, ${s.color} 0 2px, #0000 2px 4px), #27272a` : s.color,
              }} />
            </Tip>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-[13px]">
            <i className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="tabular-nums text-muted-foreground">{fmt(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
