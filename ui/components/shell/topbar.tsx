"use client";
import { ChevronRight, PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  workspace: string;
  page: string;
  busy: string | null;
  /** The search control; it owns Ctrl K. */
  search: React.ReactNode;
  onToggleSidebar: () => void;
  onSync: () => void;
  /** Inspector rail: undefined when the page has none. */
  rail?: { open: boolean; toggle: () => void };
};

/** Breadcrumb header with the global search and the sync action. */
export function Topbar({ workspace, page, busy, search, onToggleSidebar, onSync, rail }: Props) {
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
      <button onClick={onToggleSidebar} aria-label="Toggle sidebar" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground">
        <PanelLeft className="size-4" />
      </button>
      <nav className="flex items-center gap-2 text-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="size-5 rounded-md" />
        <span className="text-muted-foreground">Profileinator</span>
        <ChevronRight className="size-3 text-muted-foreground/50" />
        <span className="text-muted-foreground">{workspace}</span>
        <ChevronRight className="size-3 text-muted-foreground/50" />
        <span className="font-medium">{page}</span>
      </nav>

      <div className="mx-auto flex w-full max-w-md">{search}</div>

      <Button size="sm" variant="outline" disabled={!!busy} onClick={onSync} className="gap-1.5">
        <GithubMark className={`size-3.5 ${busy === "GitHub sync" ? "animate-pulse" : ""}`} />
        {busy === "GitHub sync" ? "Syncing…" : busy ? `${busy}…` : "Sync"}
      </Button>
      {rail && (
        <button onClick={rail.toggle} aria-label={rail.open ? "Hide inspector" : "Show inspector"} title={rail.open ? "Hide inspector" : "Show inspector"}
          className={`hidden rounded-md p-1.5 transition hover:bg-accent hover:text-foreground xl:block ${rail.open ? "text-foreground" : "text-muted-foreground"}`}>
          <PanelRight className="size-4" />
        </button>
      )}
    </header>
  );
}

/** The GitHub mark (lucide dropped brand icons). */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
