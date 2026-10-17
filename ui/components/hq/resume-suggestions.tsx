"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, fileUrl, type FileEntry } from "@/lib/hq";
import type { ViewProps } from "./views";

export type Raw = {
  identity?: Record<string, string>; links?: { id: string; label: string; url: string }[];
  experience?: { role: string; org: string; start?: string; highlights?: string[] }[];
  education?: { degree: string; school: string }[];
  achievements?: ({ title: string; date?: string } | string)[];
  stack?: { name: string; category: string; tier: string; projects?: number }[];
  skills?: { strong?: string[]; working?: string[]; no_evidence?: string[] };
  claim_gaps?: { name: string; where?: string; evidence?: string }[];
  positioning?: { avoid?: string[] };
};
type Kind = "add" | "remove" | "fresh";
type Item = { kind: Kind; title: string; why: string; draft?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

const GENERIC = new Set(["unless", "built", "links", "link", "framing", "domain", "expired", "never", "lead", "with", "that", "this", "from", "your", "have", "used", "using", "about", "claim", "claims", "framing"]);

/** What the profile says never to promote ("positioning.avoid"): words that must not be suggested, and exact terms to flag if they are on the resume. */
function avoidTerms(rules: string[]): { block: string[]; flag: { term: string; rule: string }[] } {
  const block = new Set<string>();
  const flag: { term: string; rule: string }[] = [];
  for (const rule of rules) {
    const core = rule.replace(/\([^)]*\)/g, " ").replace(/\bunless\b.*$/i, " ");
    for (const w of core.toLowerCase().split(/[^a-z0-9.]+/).filter((x) => x.length > 3 && !GENERIC.has(x))) block.add(w.replace(/\.[a-z]+$/, ""));
    // comma lists ("LangChain, LangGraph, Prisma") and domains are exact things to look for on the resume
    for (const part of core.split(",").map((s) => s.trim()).filter(Boolean)) if (part.split(/\s+/).length <= 2 && /^[A-Za-z][\w.+-]*(\s[\w.+-]+)?$/.test(part) && (core.includes(",") || part.includes("."))) flag.push({ term: part, rule });
    for (const d of core.match(/[a-z0-9-]+\.[a-z]{2,}/gi) ?? []) flag.push({ term: d, rule });
  }
  return { block: [...block], flag };
}

/** Everything readable in a PDF: its text and the URLs behind its links. */
export async function readPdf(url: string): Promise<{ text: string; links: string[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ url }).promise;
  let text = ""; const links: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    text += (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
    for (const a of await page.getAnnotations()) if (a.subtype === "Link" && a.url) links.push(a.url);
  }
  return { text, links };
}

/** Compare the resume with what the profile knows and list what is missing, outdated or unsupported. Runs locally, no AI call. */
export function compare(text: string, links: string[], me: Raw, d: ViewProps["d"], file: FileEntry): { items: Item[]; checked: number; found: number } {
  const hay = norm(text + " " + links.join(" "));
  const has = (t?: string) => !!t && hay.includes(norm(t));
  const fuzzy = (t: string) => { const w = words(t); return w.length ? w.filter((x) => hay.includes(x)).length / w.length >= 0.6 : has(t); };
  const items: Item[] = [];
  let checked = 0, found = 0;
  const avoid = avoidTerms(me.positioning?.avoid ?? []);
  // anything you told the profile to avoid is never suggested, and is not counted as missing
  const avoided = (i: Item) => { const s = norm(`${i.title} ${i.why} ${i.draft ?? ""}`); return avoid.block.some((w) => s.includes(norm(w))); };
  const check = (ok: boolean, item: Item) => { if (avoided(item)) return; checked++; if (ok) found++; else items.push(item); };

  // contact and links
  const id = me.identity ?? {};
  if (id.email) check(has(id.email), { kind: "add", title: "Email address", why: `${id.email} is stored but not on the resume.` });
  if (id.phone) check(has(id.phone.replace(/\D/g, "").slice(-8)), { kind: "add", title: "Phone number", why: "Stored in your profile but not on the resume." });
  for (const l of me.links ?? []) {
    if (!["github", "linkedin", "portfolio"].includes(l.id)) continue;
    const handle = l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    check(has(handle) || has(handle.split("/").pop() ?? ""), { kind: "add", title: `${l.label} link`, why: `${handle} is in your profile links but missing from the resume.`, draft: l.url });
  }

  // experience and education
  for (const e of me.experience ?? []) check(has(e.org) || has(e.role), { kind: "add", title: `${e.role} at ${e.org}`, why: "A role in your profile that the resume doesn't mention.", draft: (e.highlights ?? []).map((h) => `- ${h}`).join("\n") || undefined });
  for (const e of me.education ?? []) check(has(e.school) || has(e.degree), { kind: "add", title: `${e.degree}, ${e.school}`, why: "Education from your profile that the resume doesn't mention." });
  for (const a of me.achievements ?? []) { const t = typeof a === "string" ? a : a.title; check(fuzzy(t), { kind: "add", title: t, why: "An achievement in your profile that the resume doesn't mention." }); }

  // pinned projects, and their numbers
  for (const r of d.repos.filter((x) => x.pinned && !x.fork)) {
    const draft = [r.tagline, ...(r.bullets ?? []).map((b) => `- ${b}`)].filter(Boolean).join("\n") || r.desc || undefined;
    check(has(r.name), { kind: "add", title: `Project: ${r.name}`, why: "Pinned for your resume but not on it.", draft });
    for (const m of r.impact ?? []) if (has(r.name)) check(has(m.value), { kind: "add", title: `${r.name}: ${m.label} ${m.value}`, why: "You recorded this number but the resume doesn't state it.", draft: `${m.label}: ${m.value}` });
  }

  // strongest technologies and skills
  const techs = [...(me.stack ?? [])].filter((s) => ["Core", "Regular"].includes(s.tier) && s.category !== "Languages" && s.category !== "Tooling & testing").sort((a, b) => (b.projects ?? 0) - (a.projects ?? 0)).slice(0, 10);
  for (const s of techs) check(has(s.name.split(/ \(| \/ /)[0]), { kind: "add", title: s.name, why: `Used in ${s.projects ?? "several"} of your projects (${s.tier}) but not on the resume.` });
  for (const s of me.skills?.strong ?? []) check(has(s.split(/ \(| \/ /)[0]), { kind: "add", title: s, why: "Listed as a strong skill in your profile." });

  // things on the resume the profile cannot back up
  const unsupported = [...(me.claim_gaps ?? []).map((g) => g.name), ...(me.skills?.no_evidence ?? [])];
  for (const n of new Set(unsupported)) if (n && has(n.split(/ \(| \/ /)[0])) items.push({ kind: "remove", title: n, why: "The resume mentions this, but your profile says there is no evidence for it. Remove it or add proof." });

  // terms the profile says to avoid, if they made it onto the resume
  for (const f of avoid.flag) if (has(f.term) && !items.some((i) => i.kind === "remove" && norm(i.title) === norm(f.term))) items.push({ kind: "remove", title: f.term, why: `Your profile says to avoid this: "${f.rule}"` });

  // work newer than this version
  const since = file.added;
  for (const r of d.repos.filter((x) => !x.fork && x.created && Date.parse(x.created) / 1000 > since && !x.private)) {
    const item: Item = { kind: "fresh", title: `New since this version: ${r.name}`, why: `Created ${r.created!.slice(0, 10)}, after you added this resume.`, draft: r.tagline || r.desc || undefined };
    if (!avoided(item)) items.push(item);
  }
  return { items, checked, found };
}

/** Suggestions tab: what to add to, or remove from, the current resume. */
export function ResumeSuggestions({ file, d }: { file: FileEntry; d: ViewProps["d"] }) {
  const [me, setMe] = useState<Raw | null>(null);
  const [pdf, setPdf] = useState<{ text: string; links: string[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false; setPdf(null); setErr("");
    Promise.all([api<Raw>("get", { path: "me" }), file.ext === "pdf" ? readPdf(fileUrl(file.id)) : Promise.reject(new Error("Suggestions need a PDF version"))])
      .then(([m, p]) => { if (!dead) { setMe(m); setPdf(p); } })
      .catch((e: Error) => { if (!dead) setErr(e.message); });
    return () => { dead = true; };
  }, [file.id, file.ext]);

  const result = useMemo(() => (me && pdf ? compare(pdf.text, pdf.links, me, d, file) : null), [me, pdf, d, file]);

  if (err) return <p className="p-8 text-sm text-muted-foreground">{err}. Upload a PDF resume under Files to get suggestions.</p>;
  if (!result) return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Reading your resume…</div>;

  const groups: { kind: Kind; title: string; hint: string; icon: typeof Plus }[] = [
    { kind: "add", title: "Missing from the resume", hint: "In your profile, not on this version", icon: Plus },
    { kind: "fresh", title: "New since this version", hint: "Work after you added this resume", icon: Sparkles },
    { kind: "remove", title: "Check before sending", hint: "On the resume, but not backed by your profile", icon: AlertTriangle },
  ];
  const prompt = `Use the hq MCP server. My current resume is "${file.label || file.name}". Review these suggestions and rewrite the relevant resume sections using only facts from my profile (call brief, then ask / graph_explain for evidence). Do not invent numbers.\n\n` +
    result.items.map((i) => `- [${i.kind}] ${i.title}: ${i.why}`).join("\n");
  const copy = async (t: string, msg: string) => { await navigator.clipboard.writeText(t); toast.success(msg); };

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{result.items.length ? `${result.items.length} suggestion${result.items.length === 1 ? "" : "s"}` : "Nothing to add"}</h2>
          <p className="text-xs text-muted-foreground">{result.found} of {result.checked} checks from your profile are already on &ldquo;{file.label || file.name}&rdquo;.</p>
        </div>
        {result.items.length > 0 && <Button size="sm" variant="outline" onClick={() => copy(prompt, "Prompt for your agent copied")}><Copy className="size-3.5" />Copy for my agent</Button>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${result.checked ? (result.found / result.checked) * 100 : 0}%` }} /></div>

      {!result.items.length && <div className="mt-8 flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm"><Check className="size-4 text-ok" />Your resume covers everything your profile knows.</div>}

      {groups.map((g) => {
        const rows = result.items.filter((i) => i.kind === g.kind);
        if (!rows.length) return null;
        return (
          <section key={g.kind} className="mt-7">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              <g.icon className={`size-3.5 ${g.kind === "remove" ? "text-warn" : g.kind === "fresh" ? "text-brand" : ""}`} />{g.title}<span className="normal-case tracking-normal">· {g.hint}</span>
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((i, n) => (
                <li key={n} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{i.title}</p>
                    <p className="text-xs text-muted-foreground">{i.why}</p>
                    {i.draft && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">{i.draft}</pre>}
                  </div>
                  {i.draft && <Button size="sm" variant="ghost" onClick={() => copy(i.draft!, "Copied")}><Copy className="size-3.5" />Copy</Button>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
