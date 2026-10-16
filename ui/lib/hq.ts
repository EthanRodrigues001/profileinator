export type Link = { id: string; label: string; url: string; resume?: boolean; note?: string };
/** Dates are YYYY-MM, YYYY or "Present". */
export type Experience = {
  role: string; org: string; type: "Full-time" | "Part-time" | "Internship" | "Freelance" | "Contract" | "Volunteer";
  mode?: "On-site" | "Remote" | "Hybrid"; location?: string; start: string; end: string;
  highlights?: string[]; stack?: string[]; learned?: string[]; public?: boolean; visibility?: "Public" | "Private"; note?: string;
};
export type Education = {
  level: "Degree" | "Diploma" | "Higher secondary" | "Secondary" | "Certification";
  degree: string; field?: string; school: string; start: string; end: string; grade?: string;
  courses?: string[]; activities?: { role: string; org?: string; note?: string }[]; highlights?: string[]; status?: "Ongoing" | "Completed"; semester?: string; note?: string;
};
export type Achievement = { title: string; kind: "Hackathon" | "Competition" | "Course" | "Certification" | "Award" | "Event"; date: string; note?: string; link?: string };
export type TechEntry = { name: string; category: string; tier: "Core" | "Regular" | "Working" | "Tried" | "Past"; projects?: number; first_seen?: string; last_used?: string; recent?: string[]; note?: string };
export type ClaimGap = { name: string; where: string; evidence: string; action?: string };
export type Positioning = { direction?: string; headlines?: { label: string; text: string }[]; summaries?: { label: string; text: string }[]; avoid?: string[]; skill_order?: string[] };
export type Me = {
  identity: Record<string, string>;
  target?: string;
  links: Link[];
  education: Education[];
  experience: Experience[];
  skills: { strong: string[]; working: string[]; no_evidence: string[] };
  answers: Record<string, unknown>;
  achievements?: (string | Achievement)[];
  stack?: TechEntry[];
  claim_gaps?: ClaimGap[];
  positioning?: Positioning;
};
export type Repo = {
  name: string; pinned: boolean; private: boolean; fork: boolean; stars: number; pushed: string;
  primary: string | null; desc: string | null; tagline?: string; summary?: string; category?: string; visibility?: string; status?: string; when?: string; local_path?: string; note?: string; stack?: string[]; bullets?: string[]; created?: string; url?: string; topics?: string[]; homepage: string | null; live?: string;
  langs: Record<string, number>;
};
export type Commit = {
  sha: string; short: string; msg: string; date: string; author: string; name?: string;
  add: number; del: number; files: number | null; parents: string[]; repo?: string;
};
export type LinkState = { code: number; status: "ok" | "dead" | "down" | "gated"; ms: number; checked: string };
export type LogEntry = { ts: number; date: string; kind: string; text: string };
export type Integration = { id: string; status: string; note: string };

export async function api<T = unknown>(op: string, args: object = {}): Promise<T> {
  const r = await fetch(`/api/${op}`, { method: "POST", headers: { "x-hq": "1" }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.err) throw new Error(j.err);
  return j.ok as T;
}

export const LANG_COLOR: Record<string, string> = {
  TypeScript: "#3b82f6", JavaScript: "#eab308", Rust: "#f97316", Python: "#22c55e", CSS: "#a855f7",
  HTML: "#ef4444", EJS: "#84cc16", Java: "#d97706", Other: "#52525b",
};

export const ago = (iso?: string | null) => {
  if (!iso) return "–";
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  return d < 1 ? "today" : d < 60 ? `${Math.round(d)}d` : d < 700 ? `${Math.round(d / 30)}mo` : `${Math.round(d / 365)}y`;
};
