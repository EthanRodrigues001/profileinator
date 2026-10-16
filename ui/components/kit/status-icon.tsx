import { cn } from "@/lib/utils";

/**
 * The one set of state icons used across the app.
 * backlog: dashed ring (not started / unchecked) · todo: empty ring (open) · progress: half filled (needs attention)
 * review: three-quarter pie (almost there) · done: check (healthy / complete) · failed: cross (broken).
 */
export type State = "backlog" | "todo" | "progress" | "review" | "done" | "failed";

const COLOR: Record<State, string> = {
  backlog: "#71717a",
  todo: "#a1a1aa",
  progress: "#e5a93d",
  review: "#a78bfa",
  done: "#4cc38a",
  failed: "#ef6b6b",
};

export const STATE_LABEL: Record<State, string> = {
  backlog: "Not checked", todo: "Open", progress: "Needs attention", review: "Almost there", done: "Done", failed: "Broken",
};

export function StatusIcon({ state, size = 14, className }: { state: State; size?: number; className?: string }) {
  const c = COLOR[state];
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" className={cn("shrink-0", className)} aria-label={STATE_LABEL[state]} role="img">
      {state === "backlog" && <circle cx="8" cy="8" r="6.2" stroke={c} strokeWidth="1.8" strokeDasharray="1.9 1.9" />}
      {state === "todo" && <circle cx="8" cy="8" r="6.2" stroke={c} strokeWidth="1.8" />}
      {state === "progress" && (
        <>
          <circle cx="8" cy="8" r="6.2" stroke={c} strokeWidth="1.8" />
          <path d="M8 4.6 A3.4 3.4 0 0 1 8 11.4 Z" fill={c} />
        </>
      )}
      {state === "review" && (
        <>
          <circle cx="8" cy="8" r="6.2" stroke={c} strokeWidth="1.8" />
          <path d="M8 8 L8 4.6 A3.4 3.4 0 1 1 4.6 8 Z" fill={c} />
        </>
      )}
      {state === "done" && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M4.9 8.2 L7.1 10.3 L11.2 5.9" stroke="#0e1512" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {state === "failed" && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M5.6 5.6 L10.4 10.4 M10.4 5.6 L5.6 10.4" stroke="#1c0e0e" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** Link-check result -> state. Unchecked links are backlog; gated sites need a manual look. */
export const linkState = (status?: string): State =>
  status === "ok" ? "done" : status === "gated" ? "progress" : status === "dead" || status === "down" ? "failed" : "backlog";

/** Live-site result for a project -> state. No site at all is simply open. */
export const stageState = (live?: string | null): State =>
  live === "ok" ? "done" : live === "gated" ? "progress" : live === "dead" || live === "down" ? "failed" : "todo";

/** Resume readiness 0-5 -> state. */
export const readyState = (n: number): State => (n >= 5 ? "done" : n >= 3 ? "review" : n >= 1 ? "progress" : "todo");

export const STAGE_LABEL: Record<string, string> = { ok: "Live", gated: "Gated", dead: "Broken", down: "Down" };
