"use client";
import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import type { Education, Experience } from "@/lib/hq";
import { cn } from "@/lib/utils";
import { TechBadge } from "./tech-badge";

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

const Chip = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium", className ?? "border-border bg-card/60 text-muted-foreground")}>{children}</span>
);

/** A small text chip (courses, learnings, clubs), capped with a "+N" tail. */
function Tags({ items, max, tone }: { items: string[]; max: number; tone?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.slice(0, max).map((s) => <span key={s} className={cn("rounded-md border px-1.5 py-0.5 text-[11px]", tone ?? "border-border bg-card/40 text-muted-foreground")}>{s}</span>)}
      {items.length > max && <span className="text-[11px] text-muted-foreground">+{items.length - max}</span>}
    </div>
  );
}

/** Timeline rail: a line with one dot per entry; the entry in progress gets a ringed brand dot. */
function Rail({ children }: { children: React.ReactNode }) {
  return <ol className="relative ml-1 border-l border-border pl-6">{children}</ol>;
}

function Entry({ live, title, org, chips, meta, when, children, more }: {
  live?: boolean; title: React.ReactNode; org: React.ReactNode; chips?: React.ReactNode; meta?: React.ReactNode;
  when: { period: string; length?: string }; children?: React.ReactNode; more?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative pb-5 last:pb-0">
      <i className={cn("absolute -left-[29px] top-[7px] size-2.5 rounded-full border-2 border-background", live ? "bg-brand ring-2 ring-brand/30" : "bg-muted-foreground/50")} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[14px] font-medium leading-snug">{title}</h3>
            <span className="text-[13px] text-muted-foreground">{org}</span>
            {chips}
          </div>
          {meta && <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/80">{meta}</div>}
        </div>
        <div className="whitespace-nowrap text-right font-mono text-[11px] text-muted-foreground">
          {when.period}{when.length && <span className="ml-2 text-muted-foreground/60">{when.length}</span>}
        </div>
      </div>
      {children && <div className="mt-2 space-y-2">{children}</div>}
      {more && (
        <>
          {open && <div className="mt-2 space-y-2">{more}</div>}
          <button onClick={() => setOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
            {open ? "Show less" : "Show more"}<ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
          </button>
        </>
      )}
    </li>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="space-y-1 text-[13px] leading-relaxed text-foreground/85">
    {items.map((b, i) => <li key={i} className="flex gap-2.5"><span className="mt-[0.7em] h-px w-2.5 shrink-0 bg-muted-foreground/60" />{b}</li>)}
  </ul>
);

const Sub = ({ children }: { children: React.ReactNode }) => <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{children}</div>;

/** Work history as a timeline: role, place, type and period at a glance; two highlights and the stack inline; the rest on demand. */
export function ExperienceList({ items }: { items: Experience[] }) {
  return (
    <Rail>
      {items.map((e, i) => {
        const hl = e.highlights ?? [];
        const stack = e.stack ?? [];
        const restHl = hl.slice(2);
        const hasMore = restHl.length > 0 || stack.length > 6 || !!e.learned?.length;
        return (
          <Entry key={i} live={e.end === "Present"} title={e.role} org={<>{e.org}</>}
            chips={<>{e.type && <Chip className={TYPE_TONE[e.type] ?? TYPE_TONE.Volunteer}>{e.type}</Chip>}{e.visibility === "Private" && <Chip>Private</Chip>}</>}
            meta={(e.location || e.mode) ? <><MapPin className="size-3" />{[e.location, e.mode].filter(Boolean).join(" · ")}</> : undefined}
            when={{ period: period(e.start, e.end), length: duration(e.start, e.end) }}
            more={hasMore ? (
              <>
                {restHl.length > 0 && <Bullets items={restHl} />}
                {stack.length > 6 && <div className="flex flex-wrap gap-1.5">{stack.slice(6).map((s) => <TechBadge key={s} name={s} />)}</div>}
                {e.learned?.length ? <div><Sub>Learned</Sub><Tags items={e.learned} max={20} tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-300" /></div> : null}
              </>
            ) : undefined}>
            {(e.note || hl.length > 0 || stack.length > 0) && (
              <>
                {e.note && <p className="text-[13px] leading-relaxed text-muted-foreground">{e.note}</p>}
                {hl.length > 0 && <Bullets items={hl.slice(0, 2)} />}
                {stack.length > 0 && <div className="flex flex-wrap gap-1.5">{stack.slice(0, 6).map((s) => <TechBadge key={s} name={s} />)}</div>}
              </>
            )}
          </Entry>
        );
      })}
    </Rail>
  );
}

/** Education as a timeline: credential, school, period and result at a glance; roles and courses underneath. */
export function EducationList({ items }: { items: Education[] }) {
  return (
    <Rail>
      {items.map((e, i) => {
        const roles = e.activities ?? [];
        const courses = e.courses ?? [];
        const hl = e.highlights ?? [];
        return (
          <Entry key={i} live={e.status === "Ongoing"} title={<>{e.degree}{e.field && <span className="font-normal text-muted-foreground"> · {e.field}</span>}</>} org={e.school}
            chips={<>{e.status && <Chip>{e.status}{e.semester && ` · ${e.semester}`}</Chip>}{e.grade && <Chip className="border-emerald-400/25 bg-emerald-400/10 text-emerald-300">{e.grade}</Chip>}</>}
            when={{ period: period(e.start, e.end) }}
            more={hl.length ? <Bullets items={hl} /> : undefined}>
            {(roles.length > 0 || courses.length > 0) && (
              <>
                {roles.length > 0 && (
                  <ul className="space-y-1 text-[13px]">
                    {roles.map((a, j) => (
                      <li key={j}><span className="font-medium">{a.role}</span>{a.org && <span className="text-muted-foreground"> · {a.org}</span>}{a.note && <span className="text-muted-foreground"> — {a.note}</span>}</li>
                    ))}
                  </ul>
                )}
                {courses.length > 0 && <div><Sub>Courses</Sub><Tags items={courses} max={8} /></div>}
              </>
            )}
          </Entry>
        );
      })}
    </Rail>
  );
}
