import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIcon, STAGE_LABEL, stageState, type State } from "./status-icon";

/** Two-letter avatar chip: tinted square with initials, hue derived from the text so it stays stable. */
export function Initials({ text, className }: { text: string; className?: string }) {
  const h = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const letters = text.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-semibold tracking-wide", className)}
      style={{ background: `oklch(0.3 0.05 ${h} / 60%)`, color: `oklch(0.82 0.08 ${h})` }}>
      {letters}
    </span>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand";
const TONE: Record<Tone, string> = {
  neutral: "bg-white/5 text-muted-foreground",
  ok: "bg-emerald-400/10 text-emerald-300",
  warn: "bg-amber-400/10 text-amber-300",
  bad: "bg-red-400/10 text-red-300",
  info: "bg-sky-400/10 text-sky-300",
  brand: "bg-brand/10 text-brand",
};

/** Small status chip for table cells: optional leading dot, 11px label. */
export function Chip({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] font-medium", TONE[tone], className)}>
      {dot && <i className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Compact outlined action for the last column, e.g. "Open" or "Check". Stops row clicks from firing. */
export function RowAction({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn("h-7 rounded-md border border-border bg-card/60 px-2.5 text-xs font-medium transition hover:border-brand/40 hover:bg-card", className)}>
      {children}
    </button>
  );
}

/** Muted trailing text, e.g. "Not today" next to an action. */
export const Quiet = ({ children }: { children: React.ReactNode }) => <span className="text-xs text-muted-foreground">{children}</span>;

/** Chip led by a state icon, e.g. done / "Live". Neutral surface so the icon carries the colour. */
export function StatusChip({ state, children, className }: { state: State; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card/60 pl-1.5 pr-2.5 text-xs font-medium", className)}>
      <StatusIcon state={state} size={14} />
      {children}
    </span>
  );
}

/** Stage of a project: Live, Gated, Broken, Down, "Repo only" (on GitHub, no site) or "Local only" (not on GitHub). */
export function StageChip({ live, local, className }: { live?: string | null; local?: boolean; className?: string }) {
  if (local && !live) {
    return <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-border bg-card/60 pl-1.5 pr-2.5 text-xs font-medium", className)}><HardDrive className="size-3.5 text-muted-foreground" />Local only</span>;
  }
  return <StatusChip state={stageState(live)} className={className}>{live ? STAGE_LABEL[live] ?? live : "Repo only"}</StatusChip>;
}
