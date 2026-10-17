"use client";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Input } from "@/components/ui/input";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, Info, ListFilter, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Tip } from "./tip";

/** Container-width breakpoints: the column is hidden when the table area is narrower than this. */
const HIDE = {
  md: "hidden @md:table-cell", lg: "hidden @lg:table-cell", xl: "hidden @xl:table-cell",
  "2xl": "hidden @2xl:table-cell", "3xl": "hidden @3xl:table-cell", "4xl": "hidden @4xl:table-cell",
} as const;

export type Column<T> = {
  key: string;
  header: string;
  /** Native tooltip on the header explaining what the column means. */
  hint?: string;
  cell: (row: T) => React.ReactNode;
  /** Return a sortable value to make the header clickable. */
  sort?: (row: T) => string | number;
  className?: string;
  align?: "right";
  /** Drop the column when the table area is narrower than this, so rows never overflow. */
  hide?: keyof typeof HIDE;
  /** Hidden until switched on in the Columns menu. */
  defaultHidden?: boolean;
};

export type FilterDef<T> = { key: string; label: string; options: string[]; match: (row: T, value: string) => boolean };

/** Group rows under ruled headers: label, count, a one-line hint. `order` fixes the sequence; unlisted groups follow. */
export type Groups<T> = {
  by: (row: T) => string;
  order: string[];
  hint?: Record<string, string>;
  /** Names of groups that start folded. Evaluated once from the initial rows. */
  collapsedByDefault?: (rows: T[]) => string[];
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Heading on the left of the toolbar, e.g. "Projects". Omit with `toolbar={false}` for a bare table. */
  title?: string;
  noun?: string;
  searchText?: (row: T) => string;
  filters?: FilterDef<T>[];
  groups?: Groups<T>;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  toolbar?: boolean;
  /** Comfortable rows (56px) instead of dense ones (36px). */
  roomy?: boolean;
  empty?: string;
  /** Buttons shown in the toolbar, to the left of the search box. */
  actions?: React.ReactNode;
  /** Row key to show as selected (for pages that drive the inspector rail). */
  selectedKey?: string;
};

/**
 * Dense data table: title and count, Filter and Columns menus, search, sticky muted header, hairline rows,
 * grouped sections with hints, sortable columns. Generic over the row type.
 */
export function DataTable<T>({ rows, columns, rowKey, title, noun = "rows", searchText, filters = [], groups, onRowClick, selectable, toolbar = true, roomy, empty = "No matches.", actions, selectedKey }: Props<T>) {
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<"filter" | "columns" | null>(null);
  const [active, setActive] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groups?.collapsedByDefault?.(rows) ?? []));
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const cols = columns.filter((c) => !hidden.has(c.key));
  const view = useMemo(() => {
    let r = rows.filter((x) => (!q || !searchText || searchText(x).toLowerCase().includes(q.toLowerCase())) && filters.every((f) => !active[f.key] || f.match(x, active[f.key])));
    const col = columns.find((c) => c.key === sort?.key);
    if (col?.sort && sort) {
      const f = col.sort;
      r = [...r].sort((a, b) => (f(a) > f(b) ? 1 : f(a) < f(b) ? -1 : 0) * sort.dir);
    }
    return r;
  }, [rows, q, active, sort, columns, filters, searchText]);

  const sections = useMemo(() => {
    if (!groups) return [{ name: "", rows: view }];
    const m = new Map<string, T[]>();
    view.forEach((r) => { const g = groups.by(r); m.set(g, [...(m.get(g) ?? []), r]); });
    const names = [...groups.order.filter((g) => m.has(g)), ...[...m.keys()].filter((g) => !groups.order.includes(g))];
    return names.map((name) => ({ name, rows: m.get(name)! }));
  }, [view, groups]);

  const nActive = Object.values(active).filter(Boolean).length;
  const span = cols.length + (selectable ? 1 : 0);
  const allOn = view.length > 0 && view.every((r) => sel.has(rowKey(r)));
  const btn = "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition hover:bg-accent hover:text-foreground";

  return (
    <div className="@container min-w-0">
      {toolbar && (
        <div className="relative flex flex-wrap items-center gap-1 px-4 py-3">
          {title && <h2 className="mr-1 text-sm font-medium">{title}</h2>}
          <span className="mr-3 text-[13px] text-muted-foreground">{view.length} {noun}</span>
          {filters.length > 0 && (
            <button onClick={() => setPanel((p) => (p === "filter" ? null : "filter"))} className={cn(btn, panel === "filter" && "bg-accent text-foreground")}>
              <ListFilter className="size-3.5" />Filter{nActive > 0 && <span className="ml-0.5 rounded-sm bg-brand px-1 text-[10px] font-semibold text-black">{nActive}</span>}
            </button>
          )}
          <button onClick={() => setPanel((p) => (p === "columns" ? null : "columns"))} className={cn(btn, panel === "columns" && "bg-accent text-foreground")}><Columns3 className="size-3.5" />Columns</button>
          {(q || nActive > 0 || sort) && (
            <button onClick={() => { setQ(""); setActive({}); setSort(null); }} className={btn}><X className="size-3.5" />Clear</button>
          )}
          {(searchText || actions) && (
            <div className="ml-auto flex w-full items-center gap-2 @md:w-auto">
              {actions}
              {searchText && (
                <div className="relative w-full @md:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${noun}…`} className="h-8 pl-8 text-[13px] md:text-[13px]" />
                </div>
              )}
            </div>
          )}

          {panel === "columns" && (
            <div className="absolute left-4 top-12 z-20 w-52 rounded-lg border border-border bg-popover p-1.5 shadow-2xl">
              {columns.filter((c) => c.header).map((c) => (
                <button key={c.key} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent">
                  <Checkbox checked={!hidden.has(c.key)} className="pointer-events-none" />{c.header}
                </button>
              ))}
            </div>
          )}
          {panel === "filter" && (
            <div className="absolute left-4 top-12 z-20 flex max-w-xl flex-wrap gap-x-6 gap-y-3 rounded-lg border border-border bg-popover p-3.5 shadow-2xl">
              {filters.map((f) => (
                <div key={f.key}>
                  <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {f.options.map((o) => (
                      <button key={o} onClick={() => setActive((a) => ({ ...a, [f.key]: a[f.key] === o ? "" : o }))}
                        className={cn("h-6 rounded-md border px-2 text-xs transition", active[f.key] === o ? "border-brand/50 bg-brand/10 text-brand" : "border-border text-muted-foreground hover:text-foreground")}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border text-left">
            {selectable && <th className="w-10 pl-4"><Checkbox checked={allOn} onCheckedChange={(v) => setSel(v ? new Set(view.map(rowKey)) : new Set())} aria-label="Select all" /></th>}
            {cols.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th key={c.key} className={cn("h-9 overflow-hidden whitespace-nowrap px-3 align-middle text-xs font-normal text-muted-foreground first:pl-4 last:pr-4", c.align === "right" && "text-right", c.hide && HIDE[c.hide], c.className)}>
                  {/* One flex row so label, sort arrow and hint icon share a baseline. The label truncates instead of spilling into the next column. */}
                  <div className={cn("flex min-w-0 items-center gap-1.5", c.align === "right" && "justify-end")}>
                    {c.sort ? (
                      <button onClick={() => setSort(on && sort!.dir === 1 ? { key: c.key, dir: -1 } : on ? null : { key: c.key, dir: 1 })}
                        className={cn("inline-flex min-w-0 items-center gap-1 transition hover:text-foreground", on && "text-foreground")}>
                        <span className="truncate">{c.header}</span>{on && (sort!.dir === 1 ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)}
                      </button>
                    ) : <span className="truncate">{c.header}</span>}
                    {c.hint && <Tip content={c.hint} side="bottom"><Info className="size-3 shrink-0 text-muted-foreground/60" /></Tip>}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => {
            const shut = collapsed.has(s.name);
            return (
              <Fragment key={s.name || "all"}>
                {groups && (
                  <tr className="border-b border-border/60 bg-card/20">
                    <td colSpan={span} className="p-0">
                      <button onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(s.name)) n.delete(s.name); else n.add(s.name); return n; })}
                        className="flex h-9 w-full items-center gap-2 px-4 text-left">
                        {shut ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">{s.rows.length}</span>
                        {groups.hint?.[s.name] && <span className="ml-1 text-xs text-muted-foreground/70">{groups.hint[s.name]}</span>}
                      </button>
                    </td>
                  </tr>
                )}
                {!shut && s.rows.map((r) => {
                  const id = rowKey(r);
                  return (
                    <tr key={id} onClick={() => onRowClick?.(r)} className={cn("border-b border-border/50 transition-colors hover:bg-accent/30", onRowClick && "cursor-pointer", (sel.has(id) || id === selectedKey) && "bg-accent/40")}>
                      {selectable && (
                        <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={sel.has(id)} onCheckedChange={(v) => setSel((x) => { const n = new Set(x); if (v) n.add(id); else n.delete(id); return n; })} aria-label="Select row" />
                        </td>
                      )}
                      {cols.map((c) => <td key={c.key} className={cn("whitespace-nowrap px-3 first:pl-4 last:pr-4", roomy ? "h-14" : "h-9", c.align === "right" && "text-right", c.hide && HIDE[c.hide], c.className)}>{c.cell(r)}</td>)}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
          {!view.length && <tr><td colSpan={span} className="p-4"><EmptyState compact icon={SearchX} title={empty} /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
