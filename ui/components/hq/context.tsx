"use client";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EducationList, ExperienceList } from "@/components/kit/career";
import { StatusChip } from "@/components/kit/cells";
import { SpecGrid } from "@/components/kit/spec-grid";
import { StatusIcon, readyState, type State } from "@/components/kit/status-icon";
import { TechBadge } from "@/components/kit/tech-badge";
import { api } from "@/lib/hq";
import { cn } from "@/lib/utils";
import { readiness } from "./projects-table";
import { Achievements, ClaimGaps, PositioningView, ProjectMix, TechStack, TIER_STATE } from "./context-data";
import type { ViewProps } from "./views";

type Id = "identity" | "positioning" | "target" | "achievements" | "stack" | "claims" | "links" | "experience" | "education" | "skills" | "projects" | "answers" | "notes" | "raw";
type Section = { id: Id; title: string; blurb: string; state: State; count?: number };

const IDENTITY: [string, string, boolean?][] = [
  ["name", "Name"], ["legal_name", "Legal name"], ["pronouns", "Pronouns"], ["location", "Location"],
  ["email", "Email"], ["phone", "Phone"], ["headline", "Headline"], ["summary", "Summary", true],
];

const pct = (n: number, of: number): State => (of === 0 || n === 0 ? "todo" : n >= of ? "done" : "progress");

/** Text box that saves on blur or Enter, only when the value changed. */
function Field({ label, value, onSave, multiline, placeholder }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onSave(v); };
  return (
    <div className="grid gap-2 border-b border-border/60 px-4 py-3 @xl:grid-cols-[11rem_1fr] @xl:items-start">
      <label className="pt-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      {multiline ? (
        <Textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} rows={4} placeholder={placeholder} className="min-h-24 resize-y leading-relaxed" />
      ) : (
        <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} placeholder={placeholder} />
      )}
    </div>
  );
}

const Head = ({ title, blurb, right }: { title: string; blurb: string; right?: React.ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-border px-4 py-3">
    <div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{title}</h2><p className="text-[13px] text-muted-foreground">{blurb}</p></div>
    {right}
  </div>
);

/**
 * Context: everything an AI chat starts from, as structured, editable data. A section list on the left shows how complete
 * each part is; the right pane edits it. Writes go through the same `set`/`append`/`del` ops the MCP tools use.
 */
export function ContextPage({ d, run, go }: ViewProps) {
  const [sel, setSel] = useState<Id>("identity");
  const [brief, setBrief] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const { me, repos, log } = d;
  const id = me.identity ?? {};
  const answers = Object.entries(me.answers ?? {});
  const pinned = repos.filter((r) => r.pinned);
  const notes = log.filter((l) => l.kind !== "change");
  const achievements = me.achievements ?? [];
  const stack = me.stack ?? [];
  const gaps = me.claim_gaps ?? [];
  const positioning = me.positioning ?? {};

  useEffect(() => { api<string>("brief").then(setBrief); }, [d]);

  const save = (path: string, value: unknown) => run("set", "Saved", { path, value });
  const copy = async (op: string, args: object, label: string) => {
    await navigator.clipboard.writeText(await api<string>(op, args));
    toast.success(`${label} copied. Paste it into any chat.`);
  };

  const sections: Section[] = [
    { id: "identity", title: "Identity", blurb: "Who you are, as forms and chats ask for it.", state: pct(IDENTITY.filter(([k]) => id[k]).length, IDENTITY.length), count: IDENTITY.filter(([k]) => id[k]).length },
    { id: "positioning", title: "Positioning", blurb: "Direction, headline and summary variants, what to avoid, and your honest skill order.", state: positioning.direction ? "done" : "todo", count: (positioning.headlines?.length ?? 0) + (positioning.summaries?.length ?? 0) },
    { id: "target", title: "Target", blurb: "The role you are aiming at. Shapes every resume and cover letter.", state: me.target ? "done" : "todo" },
    { id: "links", title: "Links", blurb: "Profiles and sites that go into applications.", state: me.links.length ? "done" : "todo", count: me.links.length },
    { id: "experience", title: "Experience", blurb: "Typed work history: type, dates, work done, stack, learnings.", state: me.experience.length ? "done" : "todo", count: me.experience.length },
    { id: "education", title: "Education", blurb: "Credential, field, courses and the positions you held.", state: me.education.length ? "done" : "todo", count: me.education.length },
    { id: "achievements", title: "Achievements", blurb: "Hackathons, competitions and courses, typed and dated.", state: achievements.length ? "done" : "todo", count: achievements.length },
    { id: "skills", title: "Skills", blurb: "What you can claim, and what you must not.", state: me.skills.strong.length ? (me.skills.working.length ? "done" : "progress") : "todo", count: me.skills.strong.length + me.skills.working.length },
    { id: "stack", title: "Tech stack", blurb: "Every technology with its evidence tier, first and last use, and recent projects.", state: stack.length ? (stack.some((s) => s.tier === "Core") ? "done" : "progress") : "todo", count: stack.length },
    { id: "claims", title: "Claims audit", blurb: "Skills listed on profiles that have no code behind them. Do not claim these.", state: gaps.length ? "progress" : "done", count: gaps.length },
    { id: "projects", title: "Projects", blurb: "Pinned projects and their resume readiness, then the whole body of work by category.", state: pinned.length ? readyState(Math.min(...pinned.map(readiness))) : "todo", count: pinned.length },
    { id: "answers", title: "Answers bank", blurb: "Standard application answers an AI can autofill.", state: pct(answers.filter(([, v]) => v !== null && v !== "").length, answers.length), count: answers.length },
    { id: "notes", title: "Decisions & notes", blurb: "What past chats decided, so the next one doesn't re-ask.", state: notes.length ? "done" : "backlog", count: notes.length },
    { id: "raw", title: "Raw brief", blurb: "Exactly the text an AI receives from `brief`.", state: brief ? "done" : "backlog" },
  ];
  const done = sections.filter((s) => s.state === "done").length;
  const tokens = Math.round(brief.length / 4);
  const open = sections.find((s) => s.id === sel)!;
  const missing = answers.filter(([, v]) => v === null || v === "").length;

  const body = useMemo(() => {
    switch (sel) {
      case "identity":
        return IDENTITY.map(([k, label, multi]) => <Field key={k} label={label} value={id[k] ?? ""} multiline={multi} onSave={(v) => save(`me/identity/${k}`, v)} />);
      case "positioning":
        return <PositioningView p={positioning} onDel={(path) => run("del", "Removed", { path })}
          field={(label, value, path, multi) => <Field key={path} label={label} value={value} multiline={multi} onSave={(v) => save(path, v)} />} />;
      case "achievements":
        return <Achievements items={achievements} />;
      case "stack":
        return <TechStack items={stack} />;
      case "claims":
        return <ClaimGaps items={gaps} />;
      case "target":
        return <Field label="Target role" value={me.target ?? ""} multiline placeholder="e.g. Full-Stack + AI Engineer, backend/AI weighted" onSave={(v) => save("me/target", v)} />;
      case "links":
        return me.links.map((l, i) => (
          <div key={l.id} className="grid items-center gap-3 border-b border-border/60 px-4 py-2.5 @xl:grid-cols-[9rem_1fr_auto]">
            <span className="font-medium">{l.label}<span className="ml-2 font-mono text-[11px] text-muted-foreground">{l.id}</span></span>
            <Field label="" value={l.url} onSave={(v) => save(`me/links/${i}/url`, v)} />
            <StatusChip state={l.resume ? "done" : "backlog"}>{l.resume ? "On resume" : "Not on resume"}</StatusChip>
          </div>
        ));
      case "experience":
        return <div className="px-4 pb-4"><ExperienceList items={me.experience} /></div>;
      case "education":
        return <div className="px-4 pb-4"><EducationList items={me.education} /></div>;
      case "skills":
        return (["strong", "working", "no_evidence"] as const).map((g) => (
          <div key={g} className="border-b border-border/60 px-4 py-4">
            <div className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {g === "strong" ? "Strong" : g === "working" ? "Working with" : "Not claimed (no evidence)"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {me.skills[g].map((s, i) => (
                <span key={s} className="group inline-flex items-center gap-1">
                  {g === "no_evidence" ? <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{s}</span> : <TechBadge name={s} />}
                  <button aria-label={`Remove ${s}`} onClick={() => run("del", "Removed", { path: `me/skills/${g}/${i}` })} className="rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"><X className="size-3" /></button>
                </span>
              ))}
              <AddInline onAdd={(v) => run("append", "Added", { path: `me/skills/${g}`, value: v })} />
            </div>
          </div>
        ));
      case "projects":
        return <>{pinned.length ? pinned.map((r) => (
          <button key={r.name} onClick={() => go("project", r.name)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left text-[13px] transition hover:bg-accent/30">
            <StatusIcon state={readyState(readiness(r))} />
            <span className="w-48 shrink-0 truncate font-medium">{r.name}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.tagline || "No tagline yet"}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{readiness(r)}/5</span>
          </button>
        )) : <p className="p-6 text-sm text-muted-foreground">Nothing pinned yet. Pin projects on the Projects page.</p>}
          <ProjectMix repos={repos} go={(n) => go("project", n)} /></>;
      case "answers":
        return (
          <>
            {answers.map(([k, v]) => (
              <div key={k} className="relative">
                <Field label={k.replace(/_/g, " ")} value={v === null ? "" : String(v)} placeholder="Not answered yet" onSave={(x) => save(`me/answers/${k}`, x === "" ? null : x)} />
                <span className="pointer-events-none absolute right-4 top-3.5">{v === null || v === "" ? <StatusIcon state="todo" /> : <StatusIcon state="done" />}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-4 py-3">
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new_question_key" className="max-w-52 font-mono text-xs" />
              <Input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="Answer" />
              <Button variant="outline" disabled={!newKey.trim()} onClick={() => { save(`me/answers/${newKey.trim().replace(/\s+/g, "_").toLowerCase()}`, newVal || null); setNewKey(""); setNewVal(""); }}><Plus className="size-4" />Add</Button>
            </div>
          </>
        );
      case "notes":
        return notes.length ? [...notes].reverse().map((l, i) => (
          <div key={i} className="flex gap-4 border-b border-border/60 px-4 py-3 text-[13px]">
            <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{l.date}</span>
            <StatusChip state={l.kind === "decision" ? "done" : "backlog"}>{l.kind}</StatusChip>
            <span className="min-w-0 flex-1">{l.text}</span>
          </div>
        )) : <p className="p-6 text-sm text-muted-foreground">No notes yet. Ask Claude to “note” decisions worth remembering.</p>;
      case "raw":
        return <pre className="whitespace-pre-wrap px-4 py-4 font-mono text-xs leading-relaxed text-muted-foreground">{brief || "loading…"}</pre>;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, d, brief, newKey, newVal]);

  return (
    // Fixed frame: header, stats and section list stay put; only the open section scrolls (from @3xl up).
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto"><h1 className="text-sm font-medium">Context</h1><p className="text-[13px] text-muted-foreground">What every AI chat starts from. Edit here or ask Claude to; both write the same file.</p></div>
        <Button size="sm" variant="outline" onClick={() => copy("brief", {}, "Brief")}><Copy className="size-3.5" />Copy brief</Button>
        <Button size="sm" variant="outline" onClick={() => copy("export", { what: "json" }, "JSON")}><Copy className="size-3.5" />Copy JSON</Button>
        <Button size="sm" variant="outline" onClick={() => copy("export", { what: "resume" }, "Resume")}><Copy className="size-3.5" />Copy resume</Button>
      </div>

      <SpecGrid cols={4} className="shrink-0" items={[
        { label: "Sections complete", value: `${done} of ${sections.length}` },
        { label: "Brief size", value: `≈ ${tokens.toLocaleString()} tokens` },
        { label: "Unanswered", value: missing ? `${missing} answers` : "None" },
        { label: "Technologies tracked", value: String(stack.length) },
      ]} />

      <div className="min-h-0 flex-1 overflow-y-auto @3xl:grid @3xl:grid-cols-[17rem_minmax(0,1fr)] @3xl:grid-rows-[minmax(0,1fr)] @3xl:overflow-hidden">
        <nav className="border-b border-border @3xl:overflow-y-auto @3xl:border-b-0 @3xl:border-r">
          {sections.map((s) => (
            <button key={s.id} onClick={() => setSel(s.id)}
              className={cn("flex w-full items-center gap-2.5 border-b border-border/40 px-4 py-2.5 text-left text-[13px] transition hover:bg-accent/30", sel === s.id && "bg-accent/50")}>
              <StatusIcon state={s.state} />
              <span className="flex-1 font-medium">{s.title}</span>
              {s.count !== undefined && <span className="font-mono text-[11px] text-muted-foreground">{s.count}</span>}
            </button>
          ))}
        </nav>
        <section className="min-w-0 @3xl:flex @3xl:min-h-0 @3xl:flex-col">
          <div className="shrink-0"><Head title={open.title} blurb={open.blurb} /></div>
          <div className="@3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto">{body}</div>
        </section>
      </div>
    </div>
  );
}

/** "+ add" chip that turns into a tiny input. */
function AddInline({ onAdd }: { onAdd: (v: string) => void }) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState("");
  const done = () => { if (v.trim()) onAdd(v.trim()); setV(""); setOn(false); };
  if (!on) return <button onClick={() => setOn(true)} className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition hover:text-foreground"><Plus className="size-3" />Add</button>;
  return <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => (e.key === "Enter" ? done() : e.key === "Escape" && setOn(false))} className="h-6 w-36 px-2 text-xs md:text-xs" />;
}
