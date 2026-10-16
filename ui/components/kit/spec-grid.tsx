import { cn } from "@/lib/utils";

export type Spec = {
  label: string;
  value: React.ReactNode;
  /** Link target. Renders the value with the underlined mono style. */
  href?: string;
  /** Columns spanned on the wide grid (1-4). */
  span?: 1 | 2 | 3 | 4;
  /** Render values as a stacked list (e.g. a stack of packages). */
  list?: string[];
};

const SPAN = { 1: "", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4" } as const;

/**
 * Spec sheet: hairline-bordered cells, small mono uppercase labels, mono values.
 * The container is `bg-border` with `gap-px` so every cell shares one 1px rule and nothing double-borders.
 */
export function SpecGrid({ items, cols = 4, className }: { items: Spec[]; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border", cols === 4 ? "md:grid-cols-4" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2", className)}>
      {items.map((s) => (
        <div key={s.label} className={cn("bg-background px-5 py-4", SPAN[s.span ?? 1])}>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
          <div className="mt-2 font-mono text-sm">
            {s.list ? (
              <ul className="space-y-1.5">{s.list.map((x) => <li key={x}>{x}</li>)}</ul>
            ) : s.href ? (
              <a href={s.href} target="_blank" rel="noreferrer" className="underline decoration-border decoration-2 underline-offset-4 transition hover:decoration-brand">{s.value}</a>
            ) : (
              s.value || <span className="text-muted-foreground/50">–</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
