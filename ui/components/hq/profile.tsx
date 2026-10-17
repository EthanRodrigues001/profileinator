"use client";
import { Briefcase, Calendar, GraduationCap, Link2, Trophy } from "lucide-react";
import { EducationList, ExperienceList } from "@/components/kit/career";
import { LinkChips } from "@/components/kit/link-chips";
import { Section } from "@/components/kit/section";
import { Badge } from "@/components/ui/badge";
import { TechBadge } from "@/components/kit/tech-badge";
import { SpecGrid } from "@/components/kit/spec-grid";
import { StageChip } from "@/components/kit/cells";
import { LANG_COLOR, ago, fileUrl } from "@/lib/hq";
import { isLocal } from "@/lib/hq";
import { ProfileBanner } from "./banner";
import type { ViewProps } from "./views";

type Tone = "yellow" | "green" | "blue" | "gray";
const TONES: Record<Tone, string> = {
  yellow: "border-yellow-300/20 bg-yellow-300/10 text-yellow-200",
  green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  blue: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  gray: "border-white/10 bg-white/5 text-zinc-300",
};

/** Tinted status chip: the same family as the banner pills. */
function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-medium ${TONES[tone]}`}>{children}</span>;
}

const handleOf = (url?: string) => (url ? "@" + url.replace(/\/$/, "").split("/").pop() : "");

/** Social-style profile: banner, overlapping avatar, bio, a spec sheet, then every fact hq stores about the person. */
export function Profile({ d, go }: ViewProps) {
  const { identity: id, links, education, experience, skills } = d.me;
  const achievements = d.me.achievements ?? [];
  const pinned = d.repos.filter((r) => r.pinned);
  const github = links.find((l) => l.id === "github");
  const school = education.find((e) => e.level === "Degree") ?? education[0];

  return (
    <div className="pb-16">
      <ProfileBanner src={id.banner} />

      <div className="px-8">
        <div className="relative z-10 -mt-14 flex items-end justify-between">
          {id.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(id.avatar)} alt="" className="size-28 rounded-full border-4 border-background object-cover" />
          ) : (
            <div className="relative size-28 rounded-full border-4 border-background"
              style={{ background: "radial-gradient(circle at 35% 28%, #fff1bd, #f0a24b 55%, #8f4a14)", boxShadow: "0 0 50px oklch(0.8 0.15 75 / 25%)" }}>
              <i className="absolute left-[31%] top-[44%] h-[5px] w-[15px] rounded-full bg-[#2a1708]" />
              <i className="absolute right-[31%] top-[44%] h-[5px] w-[15px] rounded-full bg-[#2a1708]" />
              <i className="absolute left-1/2 top-[62%] h-[4px] w-[9px] -translate-x-1/2 rounded-full bg-[#2a1708]" />
            </div>
          )}
          <button onClick={() => go("files")} className="mb-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Change photo</button>
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">{id.name}</h1>
        <p className="text-sm text-muted-foreground">
          {github && <a href={github.url} target="_blank" rel="noreferrer" className="hover:text-brand hover:underline">{handleOf(github.url)}</a>}
          {github && id.pronouns && " · "}
          {id.pronouns}
        </p>
        <p className="mt-4 text-[15px] font-medium">{id.headline}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{id.summary}</p>
      </div>

      <SpecGrid className="mt-8" items={[
        { label: "Location", value: id.location },
        { label: "Email", value: id.email, href: id.email ? `mailto:${id.email}` : undefined },
        { label: "Studying", value: school ? `${school.degree}${school.field ? ` ${school.field}` : ""}` : "" },
        { label: "University", value: school ? `${school.school.split(",")[0]} '${school.end.slice(2)}` : "" },
        { label: "Target", value: d.me.target, span: 4 },
      ]} />

      <Section icon={Briefcase} title="Experience" count={experience.length} collapsible><ExperienceList items={experience} /></Section>
      <Section icon={GraduationCap} title="Education" count={education.length} collapsible><EducationList items={education} /></Section>

        <Section icon={Calendar} title="Skills" count={skills.strong.length + skills.working.length}>
          <div className="space-y-5">
            <div><div className="mb-3 text-xs text-muted-foreground">Strong</div><div className="flex flex-wrap gap-2">{skills.strong.map((s) => <TechBadge key={s} name={s} />)}</div></div>
            <div><div className="mb-3 text-xs text-muted-foreground">Working with</div><div className="flex flex-wrap gap-2">{skills.working.map((s) => <TechBadge key={s} name={s} />)}</div></div>
            {skills.no_evidence.length > 0 && <div><div className="mb-3 text-xs text-muted-foreground">Not claimed (no project evidence)</div><div className="flex flex-wrap gap-2">{skills.no_evidence.map((s) => <Badge key={s} variant="outline" className="h-6 rounded-md px-2 text-xs text-muted-foreground">{s}</Badge>)}</div></div>}
          </div>
        </Section>
        <Section icon={Trophy} title="Achievements" count={achievements.length}>
          <div className="flex flex-wrap gap-2">{achievements.map((a) => {
              const x = typeof a === "string" ? { title: a, kind: "", date: "" } : a;
              return (
                <Badge key={x.title} variant="secondary" className="h-auto gap-2 rounded-md px-2.5 py-1 text-xs font-medium">
                  {x.title}{x.kind && <span className="font-normal text-muted-foreground">{x.kind}{x.date && ` · ${x.date}`}</span>}
                </Badge>
              );
            })}</div>
        </Section>

      <div>
        <Section icon={Briefcase} title="Pinned projects" count={pinned.length}>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {pinned.map((r) => {
              const techs = [...new Set([...(r.stack ?? []), ...(r.detected ?? []).map((x) => x.name)])];
              return (
                <li key={r.name}>
                  <button onClick={() => go("project", r.name)} className="flex h-10 w-full items-center gap-3 px-3 text-left transition hover:bg-muted/30">
                    <i className="size-2.5 shrink-0 rounded-full" title={r.primary ?? ""} style={{ background: LANG_COLOR[r.primary ?? ""] ?? "#71717a" }} />
                    <span className="shrink-0 text-[13px] font-medium">{r.name}</span>
                    <StageChip live={r.live} local={isLocal(r)} className="h-5 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{r.tagline || r.desc}</span>
                    <div className="hidden shrink-0 items-center gap-1 lg:flex">
                      {techs.slice(0, 2).map((s) => <TechBadge key={s} name={s} />)}
                      {techs.length > 2 && <span className="text-[11px] text-muted-foreground">+{techs.length - 2}</span>}
                    </div>
                    <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground">{ago(r.pushed)}</span>
                  </button>
                </li>
              );
            })}
            {!pinned.length && <li className="px-3 py-4 text-sm text-muted-foreground">No pinned projects yet. Pin the ones that belong on your resume from the Projects page.</li>}
          </ul>
        </Section>
      </div>

      <Section icon={Link2} title="Find me online" count={links.length}><LinkChips links={links} state={d.links} /></Section>
    </div>
  );
}
