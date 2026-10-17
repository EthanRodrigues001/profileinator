"use client";
import { useEffect, useState } from "react";
import { HardDrive, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusIcon } from "@/components/kit/status-icon";
import { TechBadge } from "@/components/kit/tech-badge";
import { ago, api, bytes, isLocal, type Commit, type Repo } from "@/lib/hq";
import { checks } from "../projects-table";
import { CopyButton, Empty, Field, Pill, Section, agoTs, useUsage, type PanelProps } from "./shared";

type P = PanelProps & { subject: string | null };
const repoOf = (d: PanelProps["d"], name: string | null) => d.repos.find((r) => r.name === name) ?? null;

/** The portfolio at a glance when nothing is selected, the project's facts when one is. */
export function Details({ d, subject }: P) {
  const r = repoOf(d, subject);
  const { rows } = useUsage();
  if (!r) {
    const pinned = d.repos.filter((x) => x.pinned);
    const ready = pinned.map((x) => checks(x).filter((c) => c.ok).length);
    const avg = ready.length ? (ready.reduce((a, b) => a + b, 0) / ready.length).toFixed(1) : "–";
    const langs: Record<string, number> = {};
    d.repos.forEach((x) => { if (x.primary) langs[x.primary] = (langs[x.primary] ?? 0) + 1; });
    return (
      <>
        <Section title="Portfolio">
          <Field label="Projects">{d.repos.length}</Field>
          <Field label="Pinned">{pinned.length}</Field>
          <Field label="Live sites">{d.repos.filter((x) => x.live === "ok").length}</Field>
          <Field label="Avg readiness">{avg} / 5</Field>
        </Section>
        <Section title="Main languages">
          {Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => <Field key={k} label={k}>{n} repos</Field>)}
        </Section>
        <Empty>Select a project in the table to inspect it here.</Empty>
      </>
    );
  }
  const techs = [...new Set([...(r.stack ?? []), ...(r.detected ?? []).map((x) => x.name)])];
  if (isLocal(r)) {
    return (
      <>
        <Section title={r.name} right={<Pill icon={<HardDrive className="size-3" />}>Local only</Pill>}>
          <p className="mb-3 text-[13px] text-muted-foreground">{r.tagline || r.summary || r.desc || "No description yet."}</p>
          <Field label="Category">{r.category ?? "–"}</Field>
          <Field label="Status">{r.status ?? "–"}</Field>
          <Field label="When">{r.when ?? "–"}</Field>
          <Field label="Location">{r.local_path ?? "–"}</Field>
          <Field label="Visibility">{r.visibility ?? "Private"}</Field>
          <Field label="Live site">{r.homepage || "none"}</Field>
        </Section>
        {techs.length > 0 && <Section title="Stack"><div className="flex flex-wrap gap-1.5">{techs.slice(0, 16).map((t) => <TechBadge key={t} name={t} />)}</div></Section>}
        {r.note && <Section title="Note"><p className="text-[13px] text-muted-foreground">{r.note}</p></Section>}
      </>
    );
  }
  return (
    <>
      <Section title={r.name}>
        <p className="mb-3 text-[13px] text-muted-foreground">{r.tagline || r.desc || "No description yet."}</p>
        <Field label="Language">{r.primary ?? "–"}</Field>
        <Field label="Stars">{r.stars ?? 0}{r.forks ? ` · ${r.forks} forks` : ""}</Field>
        <Field label="Pushed">{r.pushed ? `${ago(r.pushed)}${ago(r.pushed) === "today" ? "" : " ago"}` : "–"}</Field>
        <Field label="Created">{r.created?.slice(0, 10) ?? "–"}</Field>
        <Field label="Branch">{r.branch ?? "–"}</Field>
        <Field label="License">{r.license?.replace(/ License$/, "") ?? "none"}</Field>
        <Field label="Size">{r.size_kb ? bytes(r.size_kb * 1024) : "–"}</Field>
        <Field label="Visibility">{r.private ? "Private" : "Public"}{r.fork ? " fork" : ""}</Field>
        <Field label="Agent reads">{(() => { const hit = (rows ?? []).filter((x) => x.label.toLowerCase() === r.name.toLowerCase() || x.key === `path:projects/${r.name}`); const n = hit.reduce((a, x) => a + x.n, 0); return n ? `${n} · ${agoTs(Math.max(...hit.map((x) => x.last)))}` : "none yet"; })()}</Field>
      </Section>
      {techs.length > 0 && <Section title="Stack"><div className="flex flex-wrap gap-1.5">{techs.slice(0, 16).map((t) => <TechBadge key={t} name={t} />)}</div></Section>}
      {(r.topics?.length ?? 0) > 0 && <Section title="Topics"><div className="flex flex-wrap gap-1.5">{r.topics!.map((t) => <span key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{t}</span>)}</div></Section>}
    </>
  );
}

/** Readiness checks with a fix next to each one, and the impact numbers. */
export function Checks({ d, subject, reload }: P) {
  const r = repoOf(d, subject);
  const [tag, setTag] = useState("");
  const [impact, setImpact] = useState<{ label: string; value: string }[]>([]);
  const [busy, setBusy] = useState("");
  useEffect(() => { setTag(r?.tagline ?? ""); setImpact(r?.impact ?? []); }, [r?.name, r?.tagline, r?.impact]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Empty>Select a project to see what it needs before it goes on a resume.</Empty>;

  const save = async (args: object, msg: string) => {
    setBusy(msg);
    try { await api("update_project", { name: r.name, ...args }); toast.success(msg); await reload(); } catch (e) { toast.error((e as Error).message); }
    setBusy("");
  };
  const detected = (r.detected ?? []).map((x) => x.name);
  const list = checks(r);
  const fix: Record<string, React.ReactNode> = {
    Tagline: (
      <div className="mt-2 flex gap-1.5"><Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="One line a recruiter should read" className="h-7 text-xs md:text-xs" />
        <Button size="sm" variant="outline" className="h-7" disabled={!tag.trim() || tag === r.tagline || !!busy} onClick={() => save({ tagline: tag.trim() }, "Tagline saved")}>Save</Button></div>
    ),
    "Stack listed": detected.length && !r.stack?.length ? <div className="mt-2"><Button size="sm" variant="outline" className="h-7" disabled={!!busy} onClick={() => save({ stack: detected }, "Stack saved")}>Use detected ({detected.length})</Button></div> : null,
    "Resume bullets": <div className="mt-2"><CopyButton label="Copy prompt for my agent" done="Prompt copied" text={`Use the hq MCP server: call repo_context for "${r.name}", then update_project with a one-line tagline, 2-3 outcome bullets and the stack, using only what the repo shows.`} /></div>,
    "Live site responds": r.homepage ? (
      <div className="mt-2"><Button size="sm" variant="outline" className="h-7" disabled={!!busy} onClick={async () => { setBusy("check"); try { await api("check_link", { url: r.homepage }); toast.success("Checked"); await reload(); } catch (e) { toast.error((e as Error).message); } setBusy(""); }}>
        {busy === "check" ? <Loader2 className="size-3 animate-spin" /> : null}Check now</Button></div>
    ) : null,
  };
  return (
    <>
      <Section title="Readiness" right={<span className="font-mono text-foreground">{list.filter((c) => c.ok).length}/5</span>}>
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.label}>
              <div className="flex items-center gap-2 text-[13px]"><StatusIcon state={c.ok ? "done" : "todo"} size={14} /><span className={c.ok ? "" : "font-medium"}>{c.label}</span></div>
              {!c.ok && <p className="ml-[22px] text-xs text-muted-foreground">{c.fix}</p>}
              {!c.ok && <div className="ml-[22px]">{fix[c.label]}</div>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Impact numbers" right={impact.length ? "what recruiters read" : undefined}>
        <ul className="space-y-1.5">
          {impact.map((m, i) => (
            <li key={i} className="flex gap-1.5">
              <Input value={m.label} onChange={(e) => setImpact(impact.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Users" className="h-7 text-xs md:text-xs" />
              <Input value={m.value} onChange={(e) => setImpact(impact.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="1.2k" className="h-7 w-20 text-xs md:text-xs" />
              <button onClick={() => setImpact(impact.filter((_, j) => j !== i))} aria-label="Remove" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setImpact([...impact, { label: "", value: "" }])}><Plus className="size-3" />Add</Button>
          <Button size="sm" variant="outline" className="h-7" disabled={!!busy} onClick={() => save({ impact: impact.filter((m) => m.label.trim() && m.value.trim()) }, "Impact saved")}>Save</Button>
        </div>
      </Section>
    </>
  );
}

/** Release, CI, issues and the latest commits of the project. */
export function ActivityTab({ d, subject }: P) {
  const r = repoOf(d, subject);
  const [commits, setCommits] = useState<Commit[] | null>(null);
  useEffect(() => {
    setCommits(null);
    if (r && !isLocal(r)) api<{ nodes: Commit[] }>("commits", { repo: r.name, refresh: false, limit: 30 }).then((c) => setCommits(c.nodes)).catch(() => setCommits([]));
  }, [r?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Empty>Select a project to see its recent activity.</Empty>;
  if (isLocal(r)) return <Empty title="Not on GitHub">This project lives only on your computer, so there are no commits, releases or CI to show. Push it to GitHub and run Sync GitHub to see them here.</Empty>;
  const x: Repo["extras"] = r.extras;
  return (
    <>
      <Section title="On GitHub">
        <Field label="Release">{x?.release ? `${x.release.tag} · ${ago(x.release.date)}${ago(x.release.date) === "today" ? "" : " ago"}` : x ? "none" : "not fetched"}</Field>
        <Field label="Open issues">{x ? x.issues : "–"}</Field>
        <Field label="Open PRs">{x ? x.prs : "–"}</Field>
        {x?.ci.length ? (
          <div className="mt-2"><div className="mb-1 text-xs text-muted-foreground">CI on main</div>
            <div className="flex gap-0.5">{[...x.ci].reverse().map((c, i) => <i key={i} className={`h-4 w-2 rounded-[2px] ${c.ok === null ? "bg-muted-foreground/40" : c.ok ? "bg-ok" : "bg-bad"}`} />)}</div></div>
        ) : null}
      </Section>
      <Section title="Latest commits" right={commits ? `${commits.length} cached` : ""}>
        {commits === null ? <p className="text-[13px] text-muted-foreground">Loading…</p> : commits.length ? (
          <ul className="space-y-2.5">
            {commits.slice(0, 6).map((c) => (
              <li key={c.sha}><div className="truncate text-[13px]">{c.msg}</div><div className="font-mono text-[11px] text-muted-foreground">{c.short} · {c.author} · {ago(c.date)}</div></li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">No commits cached. Fetch them from the Commits page.</p>}
      </Section>
    </>
  );
}

type Explain = { links: { label: string; kind: string; how: string }[] };

/** Where the project sits in the graph, and a ready prompt for an agent. */
export function Ask({ d, subject }: P) {
  const r = repoOf(d, subject);
  const [links, setLinks] = useState<Explain["links"]>([]);
  useEffect(() => {
    setLinks([]);
    if (r) api<Explain>("graph_explain", { node: r.name, json: true }).then((x) => setLinks(x.links ?? [])).catch(() => {});
  }, [r?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Empty>Select a project to get a prompt about it.</Empty>;
  const byKind: Record<string, string[]> = {};
  links.forEach((l) => (byKind[l.kind] ??= []).push(l.label));
  return (
    <>
      <Section title="Connected in your graph">
        {Object.entries(byKind).map(([k, v]) => <Field key={k} label={k}>{v.slice(0, 3).join(", ")}{v.length > 3 ? ` +${v.length - 3}` : ""}</Field>)}
        {!links.length && <p className="text-[13px] text-muted-foreground">No connections found.</p>}
      </Section>
      <Section title="Ask an agent">
        <p className="mb-2 text-xs text-muted-foreground">Paste into an agent connected to hq.</p>
        <div className="flex flex-col gap-2">
          <CopyButton label="Improve this project’s entry" done="Prompt copied" text={isLocal(r) ? `Use the hq MCP server. "${r.name}" is a local-only project (not on GitHub). Call graph_explain for it${r.local_path ? ` and read the files at ${r.local_path}` : ""}, then improve its tagline, bullets and stack with update_project using only facts you can see. Ask me for anything missing, such as status, dates or outcomes.` : `Use the hq MCP server. Call repo_context for "${r.name}" and graph_explain for it, then improve its tagline, bullets and stack with update_project using only facts shown. List what is missing instead of guessing.`} />
          <CopyButton label="Draft a resume paragraph" done="Prompt copied" text={`Use the hq MCP server. From ask and graph_explain, write a 3-line resume entry for "${r.name}" (what it is, how it was built, the outcome). Use only stored facts and flag any number I should confirm.`} />
        </div>
      </Section>
    </>
  );
}
