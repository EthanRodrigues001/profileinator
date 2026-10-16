"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LANG_COLOR, ago, api } from "@/lib/hq";
import { TechBadge } from "@/components/kit/tech-badge";
import { SpecGrid } from "@/components/kit/spec-grid";
import { RepoCommits } from "./commits";
import { StageChip } from "@/components/kit/cells";
import { Languages, type ViewProps } from "./views";

type Doc = { tagline?: string; stack?: string[]; bullets?: string[]; url?: string; topics?: string[]; created?: string; live_url?: string };

/** One project: edit the tagline, stack and resume bullets that feed the resume export and autofill. */
export function Project({ d, run, arg }: ViewProps & { arg: string }) {
  const repo = d.repos.find((r) => r.name === arg);
  const [doc, setDoc] = useState<Doc>({});
  const [tag, setTag] = useState("");
  const [bullet, setBullet] = useState("");
  const [stack, setStack] = useState("");
  const [view, setView] = useState<"overview" | "commits">("overview");

  const load = async () => {
    const x = await api<Doc>("get", { path: `projects/${arg}` });
    setDoc(x); setTag(x.tagline ?? ""); setStack((x.stack ?? []).join(", "));
  };
  useEffect(() => { load(); }, [arg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!repo) return <p className="p-8 text-muted-foreground">Project not found.</p>;
  const save = async (path: string, value: unknown, msg: string) => {
    try { await api("set", { path: `projects/${arg}/${path}`, value }); toast.success(msg); await load(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-8 px-6 py-6">
      <div className="flex items-start gap-4">
        <i className="mt-1 size-12 shrink-0 rounded-full ring-1 ring-white/10" style={{ background: `radial-gradient(circle at 35% 28%, #fffb, ${LANG_COLOR[repo.primary ?? ""] ?? "#71717a"} 60%, #0008)` }} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
          <p className="text-sm text-muted-foreground">{repo.desc || repo.summary || "No description yet"}{repo.pushed ? ` · pushed ${ago(repo.pushed)} ago` : repo.when ? ` · ${repo.when}` : ""} · {repo.category ?? (repo.private ? "private" : "public")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {doc.url && <a href={doc.url} target="_blank" rel="noreferrer"><Badge variant="outline" className="gap-1">GitHub <ExternalLink className="size-3" /></Badge></a>}
            {repo.homepage && <a href={repo.homepage} target="_blank" rel="noreferrer"><Badge variant="outline" className="gap-1">Live site <ExternalLink className="size-3" /></Badge></a>}
            <StageChip live={repo.live} />
          </div>
        </div>
        <Button variant={repo.pinned ? "default" : "outline"} size="sm" onClick={() => run("pin", repo.pinned ? "Unpinned" : "Pinned", { repo: repo.name, on: !repo.pinned })}>
          <Star className={`size-3.5 ${repo.pinned ? "fill-current" : ""}`} />{repo.pinned ? "Pinned" : "Pin"}
        </Button>
      </div>

      <div className="-mx-6 flex border-b border-border px-6">
        {(["overview", "commits"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`relative px-4 py-2.5 text-sm capitalize transition ${view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {v}
            {view === v && <span className="absolute inset-x-3 bottom-0 h-px bg-brand" />}
          </button>
        ))}
      </div>

      {view === "commits" ? (
        <div className="-mx-6"><RepoCommits repo={arg} repos={d.repos} /></div>
      ) : (
        <>
      <SpecGrid cols={4} className="-mx-6" items={[
        { label: "Language", value: repo.primary ?? "" },
        { label: "Stars", value: String(repo.stars ?? 0) },
        { label: "Visibility", value: repo.private ? "Private" : "Public" },
        { label: "Type", value: repo.fork ? "Fork" : "Source" },
        { label: "Created", value: (doc.created ?? "").slice(0, 10) },
        { label: "Pushed", value: (repo.pushed ?? "").slice(0, 10) },
        { label: "Source code", value: "GitHub", href: doc.url },
        { label: "Live site", value: repo.homepage ? repo.homepage.replace(/^https?:\/\//, "") : "", href: repo.homepage ?? undefined },
        { label: "Stack", value: "", list: doc.stack ?? [], span: 2 },
        { label: "Topics", value: (doc.topics ?? []).join(", "), span: 2 },
      ]} />

      <section>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Languages</h3>
        <Languages repos={[repo]} />
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Tagline</h3>
        <div className="flex gap-2">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="One line a recruiter should read" />
          <Button variant="outline" onClick={() => save("tagline", tag, "Tagline saved")}>Save</Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Stack</h3>
        <div className="flex gap-2">
          <Input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="Next.js, Postgres, …" />
          <Button variant="outline" onClick={() => save("stack", stack.split(",").map((s) => s.trim()).filter(Boolean), "Stack saved")}>Save</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">{(doc.stack ?? []).map((s) => <TechBadge key={s} name={s} />)}</div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Resume bullets</h3>
        <ul className="space-y-1.5 text-sm">
          {(doc.bullets ?? []).map((b, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">•</span>{b}</li>)}
          {!doc.bullets?.length && <li className="text-muted-foreground">None yet. Add outcomes with numbers, or ask Claude to draft them from the repo.</li>}
        </ul>
        <div className="flex gap-2">
          <Input value={bullet} onChange={(e) => setBullet(e.target.value)} placeholder="Add a bullet" onKeyDown={(e) => e.key === "Enter" && bullet && api("append", { path: `projects/${arg}/bullets`, value: bullet }).then(() => { setBullet(""); load(); })} />
          <Button variant="outline" onClick={() => bullet && api("append", { path: `projects/${arg}/bullets`, value: bullet }).then(() => { setBullet(""); load(); })}><Plus className="size-4" /></Button>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
