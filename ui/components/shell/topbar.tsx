"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, PanelLeft, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LANG_COLOR, type Repo } from "@/lib/hq";

type Props = {
  workspace: string;
  page: string;
  repos: Repo[];
  busy: string | null;
  onToggleSidebar: () => void;
  onOpenProject: (name: string) => void;
  onSync: () => void;
};

/** Breadcrumb header with a Ctrl+K project search and the sync action. */
export function Topbar({ workspace, page, repos, busy, onToggleSidebar, onOpenProject, onSync }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape") input.current?.blur();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const hits = useMemo(
    () => (q ? repos.filter((r) => (r.name + (r.desc ?? "") + (r.tagline ?? "")).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []),
    [q, repos],
  );

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
      <button onClick={onToggleSidebar} aria-label="Toggle sidebar" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground">
        <PanelLeft className="size-4" />
      </button>
      <nav className="flex items-center gap-2 text-sm">
        <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-amber-300 to-orange-600 text-[10px] font-bold text-black">P</span>
        <span className="text-muted-foreground">Profileinator</span>
        <ChevronRight className="size-3 text-muted-foreground/50" />
        <span className="text-muted-foreground">{workspace}</span>
        <ChevronRight className="size-3 text-muted-foreground/50" />
        <span className="font-medium">{page}</span>
      </nav>

      <div className="relative mx-auto w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search projects"
          className="h-8 w-full rounded-lg border border-border bg-card/60 pl-9 pr-14 text-sm outline-none transition placeholder:text-muted-foreground focus:border-brand/40"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl K</kbd>
        {open && hits.length > 0 && (
          <div className="absolute left-0 right-0 top-10 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl">
            {hits.map((r) => (
              <button key={r.name} onMouseDown={() => { onOpenProject(r.name); setQ(""); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent">
                <i className="size-2 rounded-full" style={{ background: LANG_COLOR[r.primary ?? ""] ?? "#71717a" }} />
                <span className="font-medium">{r.name}</span>
                <span className="truncate text-xs text-muted-foreground">{r.tagline || r.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Button size="sm" variant="outline" disabled={!!busy} onClick={onSync} className="gap-1.5">
        <RefreshCw className={`size-3.5 ${busy === "GitHub sync" ? "animate-spin" : ""}`} />
        {busy ? `${busy}…` : "Sync GitHub"}
      </Button>
    </header>
  );
}
