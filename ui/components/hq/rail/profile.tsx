"use client";
import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";
import { api } from "@/lib/hq";
import { CopyButton, Field, Section, type PanelProps } from "./shared";

const ID_FIELDS: [string, string][] = [["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["location", "Location"], ["headline", "Headline"], ["summary", "Summary"]];

/** Which parts of your profile are filled in. */
export function Complete({ d, go }: PanelProps) {
  const id = d.me.identity;
  const answers = Object.entries(d.me.answers ?? {});
  const open = answers.filter(([, v]) => v === null || v === "");
  return (
    <>
      <Section title="Identity">
        <ul className="space-y-1.5">
          {ID_FIELDS.map(([k, label]) => (
            <li key={k} className="flex items-center gap-2 text-[13px]">
              {id[k] ? <Check className="size-3.5 text-ok" /> : <Minus className="size-3.5 text-muted-foreground" />}
              <span className={id[k] ? "" : "text-muted-foreground"}>{label}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Application answers" right={<button onClick={() => go("context")} className="hover:text-foreground">Answer</button>}>
        <Field label="Answered">{answers.length - open.length} of {answers.length}</Field>
        {open.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Missing: {open.map(([k]) => k.replace(/_/g, " ")).join(", ")}</p>}
      </Section>
      <Section title="Counts">
        <Field label="Roles">{d.me.experience.length}</Field>
        <Field label="Education">{d.me.education.length}</Field>
        <Field label="Achievements">{(d.me.achievements ?? []).length}</Field>
        <Field label="Technologies">{(d.me.stack ?? []).length}</Field>
        <Field label="Pinned projects">{d.repos.filter((r) => r.pinned).length}</Field>
      </Section>
    </>
  );
}

/** What leaves your computer: resume links and projects you keep off profiles. */
export function Visible({ d }: PanelProps) {
  const hidden = d.repos.filter((r) => r.visibility === "Keep off profiles");
  const onResume = d.me.links.filter((l) => (l as { resume?: boolean }).resume);
  return (
    <>
      <Section title="Links on your resume" right={`${onResume.length}`}>
        <ul className="space-y-1.5 text-[13px]">
          {onResume.map((l) => <li key={l.id} className="flex justify-between gap-3"><span>{l.label}</span><span className="truncate text-xs text-muted-foreground">{l.url.replace(/^https?:\/\/(www\.)?/, "")}</span></li>)}
          {!onResume.length && <li className="text-muted-foreground">None are marked for the resume.</li>}
        </ul>
      </Section>
      <Section title="Kept off profiles" right={`${hidden.length}`}>
        <ul className="space-y-1 text-[13px]">
          {hidden.slice(0, 10).map((r) => <li key={r.name}>{r.name}</li>)}
          {!hidden.length && <li className="text-muted-foreground">Nothing hidden. Every pinned project can appear on a resume.</li>}
        </ul>
      </Section>
      <Section title="Private repos">
        <Field label="In your profile">{d.repos.filter((r) => r.private).length}</Field>
        <p className="mt-1 text-xs text-muted-foreground">Private repos are never link-checked and never shown with a public link.</p>
      </Section>
    </>
  );
}

/** Exactly what an agent gets from the brief tool. */
export function Brief() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { api<string>("brief", {}).then(setText).catch(() => setText("")); }, []);
  const tokens = text ? Math.round(text.length / 4) : 0;
  return (
    <Section title="Agent brief" right={text !== null ? `~${tokens.toLocaleString()} tokens` : ""}>
      {text === null ? <p className="text-[13px] text-muted-foreground">Loading…</p> : (
        <>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{text.slice(0, 2400)}{text.length > 2400 ? "\n…" : ""}</pre>
          <div className="mt-3 flex gap-2"><CopyButton text={text} label="Copy brief" done="Brief copied" /></div>
          <p className="mt-2 text-xs text-muted-foreground">This is what the brief tool returns first. Agents call ask and the graph tools for anything deeper.</p>
        </>
      )}
    </Section>
  );
}
