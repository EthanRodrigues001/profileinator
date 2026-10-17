"use client";
import { useEffect, useMemo, useState } from "react";
import { Bot, History, FileText, Link2, type LucideIcon, Pencil, Pin, Plus, RefreshCw, Search, StickyNote, Terminal, Trash2, Undo2, User } from "lucide-react";
import { Dropdown } from "@/components/kit/dropdown";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type LogEntry } from "@/lib/hq";
import { useSelection } from "@/lib/selection";
import type { ViewProps } from "./views";

type Entry = LogEntry & { src?: "app" | "agent" | "cli" };

const ACTOR: Record<string, { label: string; icon: LucideIcon }> = {
  app: { label: "You", icon: User },
  agent: { label: "Agent", icon: Bot },
  cli: { label: "Terminal", icon: Terminal },
};

const pretty = (p: string) => p.replace(/^me\//, "").replace(/^projects\//, "").split("/").filter(Boolean).join(" › ");

/** Turn a stored log line ("set me/identity/headline") into a sentence and an icon. */
export function describe(e: Entry): { title: string; icon: LucideIcon } {
  const [op, ...rest] = e.text.trim().split(" ");
  const arg = rest.join(" ").trim();
  if (e.kind === "change") {
    switch (op) {
      case "sync": return { title: "Synced GitHub repos", icon: RefreshCw };
      case "set": return { title: `Updated ${pretty(arg)}`, icon: Pencil };
      case "append": return { title: `Added to ${pretty(arg)}`, icon: Plus };
      case "del": return { title: `Removed ${pretty(arg)}`, icon: Trash2 };
      case "pin": return { title: `Changed the pin on ${arg}`, icon: Pin };
      case "undo": return { title: "Undid a change", icon: Undo2 };
      case "check_links": return { title: "Checked links", icon: Link2 };
      default: return { title: e.text, icon: Pencil };
    }
  }
  if (e.kind === "file") return { title: e.text, icon: FileText };
  return { title: e.text, icon: StickyNote };
}

const dayLabel = (ts: number) => {
  const d = new Date(ts * 1000);
  const t = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  return same(d, t) ? "Today" : same(d, y) ? "Yesterday" : d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};
export const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Everything that changed in your profile, as a timeline: when, what, and who did it. */
export function ActivityLog({ d }: ViewProps) {
  const [log, setLog] = useState<Entry[]>(d.log as Entry[]);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const { sel, setSel } = useSelection();
  useEffect(() => { api<Entry[]>("log", { limit: 300 }).then(setLog); }, []);

  const days = useMemo(() => {
    const f = q.trim().toLowerCase();
    const rows = [...log].reverse().filter((e) => (who === "all" || (e.src ?? "app") === who) && (!f || describe(e).title.toLowerCase().includes(f) || e.text.toLowerCase().includes(f)));
    const g: { label: string; items: Entry[] }[] = [];
    for (const e of rows) {
      const l = dayLabel(e.ts);
      const last = g[g.length - 1];
      if (last && last.label === l) last.items.push(e); else g.push({ label: l, items: [e] });
    }
    return { g, n: rows.length };
  }, [log, q, who]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <h2 className="mr-2 text-sm font-medium">Activity <span className="ml-1 text-xs font-normal text-muted-foreground">{days.n}</span></h2>
        <div className="relative ml-auto w-full @md:w-60 sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity…" className="h-8 pl-8 text-[13px] md:text-[13px]" />
        </div>
        <Dropdown size="sm" className="w-32" value={who} onChange={setWho}
          options={[{ value: "all", label: "Everyone" }, { value: "app", label: "You" }, { value: "agent", label: "Agents" }, { value: "cli", label: "Terminal" }]} />
      </div>

      <div className="px-6 py-6">
        {days.g.map((day) => (
          <section key={day.label} className="mb-8 last:mb-0">
            <h3 className="mb-3 text-xs font-medium text-muted-foreground">{day.label}</h3>
            <ol className="relative ml-1 border-l border-border pl-6">
              {day.items.map((e, i) => {
                const { title, icon: Icon } = describe(e);
                const a = e.src ? ACTOR[e.src] : null;
                return (
                  <li key={`${e.ts}-${i}`} onClick={() => setSel({ kind: "log", ts: e.ts })} className={`relative -ml-2 flex cursor-pointer items-baseline gap-2.5 rounded-md py-2 pl-2 transition hover:bg-muted/30 ${sel?.kind === "log" && sel.ts === e.ts ? "bg-muted/40" : ""}`}>
                    <i className="absolute -left-[21px] top-[0.95rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground/50" />
                    <span className="w-11 shrink-0 font-mono text-[13px] text-muted-foreground">{clock(e.ts)}</span>
                    <span className="size-1 shrink-0 translate-y-[-3px] rounded-full bg-muted-foreground/40" />
                    <p className="min-w-0 flex-1 text-[14px] leading-6">
                      {title}
                      <Icon className="mx-2 inline size-4 -translate-y-px text-muted-foreground" />
                      {a && (
                        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card/50 pl-1 pr-2.5 align-middle text-xs">
                          <span className="grid size-4 place-items-center rounded-full bg-muted"><a.icon className="size-2.5" /></span>{a.label}
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {!days.g.length && (
          <EmptyState icon={History} title={log.length ? "No matching activity" : "No activity yet"} hint={log.length ? "Nothing fits this search or filter." : "Changes you or your agents make show up here."}>
            {log.length > 0 && (q || who !== "all") && <Button size="sm" variant="outline" onClick={() => { setQ(""); setWho("all"); }}>Clear filters</Button>}
          </EmptyState>
        )}
      </div>
    </div>
  );
}
