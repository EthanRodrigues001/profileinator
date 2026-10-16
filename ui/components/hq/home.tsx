"use client";
import { useState } from "react";
import { ArrowUp, Brain, FileText, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Initials, StageChip } from "@/components/kit/cells";
import { DataTable } from "@/components/kit/data-table";
import { LANG_COLOR, ago, api } from "@/lib/hq";
import type { TabKind } from "@/components/shell/nav";
import { Orbit } from "./orbit";
import { Activity, Languages, type ViewProps } from "./views";

const Label = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
    <span>{children}</span>
    <span className="normal-case tracking-normal">{right}</span>
  </div>
);

/** Home: orbit hero, a command box that searches everything hq knows, quick actions, pinned table, activity. */
export function Home({ d, run, go }: ViewProps) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<string[] | null>(null);
  const pinned = d.repos.filter((r) => r.pinned);
  const open = (k: TabKind, a?: string) => go(k, a);

  const search = async () => {
    if (!q.trim()) return;
    try { setHits(await api<string[]>("search", { q })); } catch (e) { toast.error((e as Error).message); }
  };
  const copy = async (op: string, args: object, label: string) => {
    await navigator.clipboard.writeText(await api<string>(op, args));
    toast.success(`${label} copied`);
  };
  const chips = [
    { icon: RefreshCw, label: "Sync GitHub", on: () => run("sync", "GitHub sync") },
    { icon: Link2, label: "Check all links", on: () => run("check_links", "Link check") },
    { icon: Brain, label: "Copy brief for an AI chat", on: () => copy("brief", {}, "Brief") },
    { icon: FileText, label: "Copy resume (markdown)", on: () => copy("export", { what: "resume" }, "Resume") },
  ];

  return (
    <div className="pb-16 pt-6">
      <Orbit items={pinned.map((r) => ({ name: r.name, color: LANG_COLOR[r.primary ?? ""] ?? "#71717a" }))} onOpen={(n) => open("project", n)} />

      <div className="mx-auto mt-2 max-w-3xl rounded-2xl border border-border bg-card/70 p-4 shadow-lg backdrop-blur">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) setHits(null); }}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder={`Ask about ${d.me.identity.name?.split(" ")[0] ?? "you"}: search skills, projects, notes…`}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <i className="size-4 rounded-full bg-gradient-to-br from-amber-200 to-orange-500" />
          Searches everything stored in your profile
          <span className="ml-auto">↵ to search</span>
          <button onClick={search} aria-label="Search" className="grid size-8 place-items-center rounded-lg bg-foreground text-background transition hover:opacity-90"><ArrowUp className="size-4" /></button>
        </div>
        {hits && (
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto border-t border-border pt-3 font-mono text-xs text-muted-foreground">
            {hits.length ? hits.map((h, i) => <div key={i} className="truncate">{h}</div>) : "No matches."}
          </div>
        )}
      </div>

      <div className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
        {chips.map((c) => (
          <button key={c.label} onClick={c.on}
            className="flex items-center gap-2 rounded-full border border-border bg-card/40 px-4 py-2 text-sm text-foreground/90 transition hover:border-brand/40 hover:bg-card">
            <c.icon className="size-3.5 text-muted-foreground" />{c.label}
          </button>
        ))}
      </div>

      <section className="mt-12">
        <div className="px-4"><Label right={<button onClick={() => open("repos")} className="hover:text-foreground">View all</button>}>Pinned projects</Label></div>
        <DataTable toolbar={false} noun="projects" rows={pinned} rowKey={(r) => r.name} onRowClick={(r) => open("project", r.name)}
          empty="Nothing pinned. Open Projects and star some."
          columns={[
            { key: "n", header: "Project", className: "w-64", cell: (r) => <div className="flex items-center gap-2.5"><Initials text={r.name} /><span className="font-medium">{r.name}</span></div> },
            { key: "s", header: "Stack", cell: (r) => <span className="text-muted-foreground">{(r.stack?.length ? r.stack : Object.entries(r.langs ?? {}).sort((a, b) => b[1] - a[1]).map(([k]) => k)).slice(0, 3).join(" · ") || r.primary}</span> },
            { key: "l", header: "Site", cell: (r) => <StageChip live={r.live} /> },
            { key: "u", header: "Updated", align: "right", cell: (r) => <span className="text-muted-foreground">{ago(r.pushed)}</span> },
          ]} />
      </section>

      <section className="mt-10 grid gap-8 px-6 md:grid-cols-2">
        <div>
          <Label>Languages</Label>
          <Languages repos={d.repos} />
          <div className="mt-8"><Label>Push activity</Label><Activity repos={d.repos} /></div>
        </div>
        <div>
          <Label right={<button onClick={() => open("activity")} className="hover:text-foreground">View all</button>}>Recent activity</Label>
          <div className="space-y-3">
            {[...d.log].reverse().slice(0, 6).map((l, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground/70">{l.date.slice(5)}</span>
                <span className="text-foreground/90">{l.kind === "change" ? <span className="text-muted-foreground">{l.text}</span> : l.text}</span>
              </div>
            ))}
            {!d.log.length && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
