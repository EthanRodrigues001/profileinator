import type { Education, Experience } from "@/lib/hq";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TechBadge } from "./tech-badge";

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function Tile({ name }: { name: string }) {
  const h = hue(name);
  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-xl border text-sm font-semibold"
      style={{ background: `oklch(0.3 0.06 ${h} / 55%)`, borderColor: `oklch(0.7 0.12 ${h} / 30%)`, color: `oklch(0.85 0.1 ${h})` }}>
      {name.trim()[0]?.toUpperCase()}
    </div>
  );
}

const TYPE_TONE: Record<string, string> = {
  "Full-time": "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  "Part-time": "border-sky-400/25 bg-sky-400/10 text-sky-300",
  Internship: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  Freelance: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  Contract: "border-yellow-300/25 bg-yellow-300/10 text-yellow-200",
  Volunteer: "border-white/10 bg-white/5 text-zinc-300",
  "Open source": "border-pink-400/25 bg-pink-400/10 text-pink-300",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-07" -> "Jul 2025"; "2025" and "Present" pass through. */
export const fmtDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? `${MON[+m[2] - 1]} ${m[1]}` : v;
};
const months = (v: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? +m[1] * 12 + +m[2] - 1 : null;
};
/** "11 mo" / "1 yr 2 mo" when both ends have months. */
export const duration = (start: string, end: string) => {
  const a = months(start);
  const now = new Date();
  const b = end === "Present" ? now.getFullYear() * 12 + now.getMonth() : months(end);
  if (a === null || b === null || b < a) return "";
  const n = b - a + 1;
  return n < 12 ? `${n} mo` : `${Math.floor(n / 12)} yr${n % 12 ? ` ${n % 12} mo` : ""}`;
};
export const period = (s: string, e: string) => [fmtDate(s), fmtDate(e)].filter(Boolean).join(" – ");

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{children}</div>;
const Pills = ({ items, tech, tone }: { items: string[]; tech?: boolean; tone?: string }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((s) => tech ? <TechBadge key={s} name={s} /> : <Badge key={s} variant="secondary" className={cn("h-6 rounded-md px-2 text-xs font-medium", tone)}>{s}</Badge>)}
  </div>
);
const Bullets = ({ items }: { items: string[] }) => (
  <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">{items.map((b, i) => <li key={i} className="flex gap-3"><span className="mt-2.5 h-px w-3 shrink-0 bg-muted-foreground/60" />{b}</li>)}</ul>
);

/** One ruled entry: tile, title block and period on the first line; details underneath, indented to the title. */
function Entry({ first, tile, title, tag, sub, right, children }: { first: boolean; tile: string; title: React.ReactNode; tag?: React.ReactNode; sub: React.ReactNode; right: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={cn("py-6", !first && "border-t border-border", first && "pt-2")}>
      <div className="flex items-start gap-4">
        <Tile name={tile} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="font-medium leading-snug">{title}</h3>{tag}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{sub}</div>
        </div>
        <div className="hidden text-right sm:block">{right}</div>
      </div>
      {children && <div className="mt-5 space-y-5 pl-[60px]">{children}</div>}
    </div>
  );
}

/** Work history: type tag, place, period and duration; then work done, stack used and learnings. */
export function ExperienceList({ items }: { items: Experience[] }) {
  return (
    <div>
      {items.map((e, i) => (
        <Entry key={i} first={i === 0} tile={e.org} title={e.role}
          tag={<>{e.type && <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", TYPE_TONE[e.type] ?? TYPE_TONE.Volunteer)}>{e.type}</span>}{e.visibility === "Private" && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Private</span>}</>}
          sub={<>{e.org}{e.location && ` · ${e.location}`}{e.mode && ` · ${e.mode}`}</>}
          right={<><div className="font-mono text-xs">{period(e.start, e.end)}</div><div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{duration(e.start, e.end)}</div></>}>
          {e.note || e.highlights?.length || e.stack?.length || e.learned?.length ? (
            <>
              {e.note && <p className="text-sm leading-relaxed text-muted-foreground">{e.note}</p>}
              {e.highlights?.length ? <div><Label>Work done</Label><Bullets items={e.highlights} /></div> : null}
              {e.stack?.length ? <div><Label>Stack used</Label><Pills items={e.stack} tech /></div> : null}
              {e.learned?.length ? <div><Label>Learned</Label><Pills items={e.learned} tone="bg-emerald-400/10 text-emerald-300" /></div> : null}
            </>
          ) : undefined}
        </Entry>
      ))}
    </div>
  );
}

/** Education: credential and subject, school, period; then positions and clubs, courses and highlights. */
export function EducationList({ items }: { items: Education[] }) {
  return (
    <div>
      {items.map((e, i) => (
        <Entry key={i} first={i === 0} tile={e.school} title={<>{e.degree}{e.field && <span className="font-normal text-muted-foreground"> · {e.field}</span>}</>}
          tag={<>{e.status && <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{e.status}{e.semester && ` · ${e.semester}`}</span>}{e.grade && <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{e.grade}</span>}</>}
          sub={e.school} right={<div className="font-mono text-xs">{period(e.start, e.end)}</div>}>
          {e.activities?.length || e.courses?.length || e.highlights?.length ? (
            <>
              {e.activities?.length ? (
                <div>
                  <Label>Positions &amp; clubs</Label>
                  <ul className="space-y-3">
                    {e.activities.map((a, j) => (
                      <li key={j} className="text-sm">
                        <span className="font-medium">{a.role}</span>{a.org && <span className="text-muted-foreground"> · {a.org}</span>}
                        {a.note && <p className="mt-0.5 leading-relaxed text-muted-foreground">{a.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {e.courses?.length ? <div><Label>Courses</Label><Pills items={e.courses} /></div> : null}
              {e.highlights?.length ? <div><Label>Highlights</Label><Bullets items={e.highlights} /></div> : null}
            </>
          ) : undefined}
        </Entry>
      ))}
    </div>
  );
}
