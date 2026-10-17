"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, HardDrive, Camera, CircleDot, Clock, Copy, ExternalLink, GitBranch, GitPullRequest, Globe, ImagePlus, Loader2, Plus, Scale, Star, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LANG_COLOR, ago, api, fileUrl, uploadFile, type Commit, type FileEntry, type Repo } from "@/lib/hq";
import { isLocal } from "@/lib/hq";
import { Tip } from "@/components/kit/tip";
import { DropZone, pick } from "./files";
import { TechBadge } from "@/components/kit/tech-badge";
import { LangBar } from "@/components/kit/lang-bar";
import { StageChip } from "@/components/kit/cells";
import { EmptyState } from "@/components/kit/empty-state";
import { RepoCommits } from "./commits";
import type { ViewProps } from "./views";

type Doc = { cover?: string; impact?: { label: string; value: string; note?: string }[]; tagline?: string; stack?: string[]; bullets?: string[]; url?: string; topics?: string[]; created?: string; live_url?: string };
type Stored = { fetched: number; nodes: Commit[] };
type Extras = NonNullable<Repo["extras"]>;
type Impact = { label: string; value: string; note?: string };

const TABS = ["overview", "commits", "resume"] as const;
type Tab = (typeof TABS)[number];

const Label = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-2.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
    <span>{children}</span><span className="normal-case tracking-normal">{right}</span>
  </div>
);

const kb = (n?: number) => (!n ? "" : n > 1024 ? `${(n / 1024).toFixed(1)} MB` : `${n} KB`);

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-r border-border px-5 py-4 last:border-r-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 truncate text-xl font-semibold tracking-tight">{children}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** One project: overview (stats, recent commits, about, languages), full history, and the resume fields agents and you can edit. */
export function Project({ d, run, arg, go }: ViewProps & { arg: string }) {
  const repo = d.repos.find((r) => r.name === arg);
  const [doc, setDoc] = useState<Doc>({});
  const [tag, setTag] = useState("");
  const [bullet, setBullet] = useState("");
  const [stack, setStack] = useState("");
  const [view, setView] = useState<Tab>("overview");
  const [commits, setCommits] = useState<Stored | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [shots, setShots] = useState<FileEntry[]>([]);
  const [impact, setImpact] = useState<Impact[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const x = await api<Doc>("get", { path: `projects/${arg}` });
    setDoc(x); setTag(x.tagline ?? ""); setStack((x.stack ?? []).join(", "));
  }, [arg]);
  useEffect(() => { load(); }, [load]);
  const loadShots = useCallback(async () => { setShots(await api<FileEntry[]>("files", { ref_type: "project", ref: arg }).catch(() => [])); }, [arg]);
  useEffect(() => { loadShots(); }, [loadShots]);
  useEffect(() => { setImpact(doc.impact ?? repo?.impact ?? []); }, [doc.impact, repo?.impact]);
  // release, CI and open issues/PRs come from GitHub; refresh when older than 6 hours
  useEffect(() => {
    const cached = repo?.extras ?? null;
    setExtras(cached);
    if (repo && isLocal(repo)) return; // nothing on GitHub to ask about
    if (!cached || Date.now() / 1000 - cached.fetched > 6 * 3600) api<Extras>("project_extras", { repo: arg }).then(setExtras).catch(() => {});
  }, [arg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCommits(null);
    if (repo && isLocal(repo)) { setCommits({ fetched: 0, nodes: [] }); return; }
    api<Stored>("commits", { repo: arg, refresh: false, limit: 30 }).then(setCommits).catch(() => setCommits({ fetched: 0, nodes: [] }));
  }, [arg]);

  if (!repo) return <p className="p-8 text-muted-foreground">Project not found.</p>;
  const save = async (path: string, value: unknown, msg: string) => {
    try { await api("set", { path: `projects/${arg}/${path}`, value }); toast.success(msg); await load(); } catch (e) { toast.error((e as Error).message); }
  };

  const nodes = commits?.nodes ?? [];
  const month = Date.now() - 30 * 864e5;
  const recent = nodes.filter((c) => Date.parse(c.date) >= month).length;
  const latest = nodes[0];
  const detected = (repo.detected ?? []).map((t) => t.name);
  // your own stack list first, then anything detected from the repo's dependencies
  const byLang = (() => { const e = Object.entries(repo.langs ?? {}); const tot = e.reduce((a, [, v]) => a + v, 0); return e.filter(([, v]) => tot && v / tot >= 0.1).sort((a, b) => b[1] - a[1]).map(([k]) => k); })();
  const stackFound = [...new Set([...(doc.stack ?? []), ...detected])];
  // no manifest to read (static sites, scripts, bots): fall back to the main languages so the page is never blank
  const chosen = stackFound.length ? stackFound : byLang;
  const topics = [...new Set(repo.topics ?? [])];
  const lead = repo.tagline || repo.desc || repo.summary;
  const images = shots.filter((s) => s.kind === "screenshot");
  const cover = images.find((s) => s.id === (doc.cover ?? repo.cover)) ?? null;
  const ciOk = extras?.ci.length ? (extras.ci[0].ok === false ? false : extras.ci[0].ok) : null;

  return (
    <div>
      <div className="flex items-start gap-4 px-6 pt-6">
        <i className="mt-1 size-12 shrink-0 rounded-xl ring-1 ring-white/10" style={{ background: `radial-gradient(circle at 35% 28%, #fffb, ${LANG_COLOR[repo.primary ?? ""] ?? "#71717a"} 60%, #0008)` }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
            {isLocal(repo) ? <Badge variant="outline" className="rounded-full border-dashed"><HardDrive className="size-3" />Local only</Badge> : <Badge variant="outline" className="rounded-full">{repo.private ? "Private" : "Public"}</Badge>}
            {repo.category && <Badge variant="outline" className="rounded-full">{repo.category}</Badge>}
            {repo.fork && <Badge variant="outline" className="rounded-full">Fork</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{lead || "No description yet. Add a tagline in the Resume tab."}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
            {repo.primary && <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: LANG_COLOR[repo.primary] ?? "#71717a" }} />{repo.primary}</span>}
            {repo.branch && <span className="inline-flex items-center gap-1.5 font-mono text-xs"><GitBranch className="size-3.5" />{repo.branch}</span>}
            {repo.license && <span className="inline-flex items-center gap-1.5"><Scale className="size-3.5" />{repo.license.replace(/ License$/, "")}</span>}
            {repo.pushed && <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />Pushed {ago(repo.pushed)}{ago(repo.pushed) === "today" ? "" : " ago"}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant={repo.pinned ? "default" : "outline"} size="sm" onClick={() => run("pin", repo.pinned ? "Unpinned" : "Pinned", { repo: repo.name, on: !repo.pinned })}>
            <Star className={`size-3.5 ${repo.pinned ? "fill-current" : ""}`} />{repo.pinned ? "Pinned" : "Pin"}
          </Button>
          {doc.url && <a href={doc.url} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Open on GitHub <ArrowUpRight className="size-3.5" /></Button></a>}
        </div>
      </div>

      <div className="mt-5 flex border-b border-border px-6">
        {TABS.filter((v) => v !== "commits" || !isLocal(repo)).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`relative px-4 py-2.5 text-sm capitalize transition ${view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {v}
            {view === v && <span className="absolute inset-x-3 bottom-0 h-px bg-brand" />}
          </button>
        ))}
      </div>

      {view === "commits" && <RepoCommits repo={arg} repos={d.repos} />}

      {view === "overview" && (
        <>
          {cover && (
            <div className="px-6 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(cover.id)} alt={cover.label || repo.name} className="aspect-[16/7] w-full rounded-xl border border-border object-cover object-center" />
            </div>
          )}
          {isLocal(repo) ? (
            <div className="mt-5 grid grid-cols-2 border-y border-border md:grid-cols-4">
              <Stat label="Status" sub="set by you or your agent">{repo.status || "–"}</Stat>
              <Stat label="When" sub={repo.category ?? "no category"}>{repo.when || "–"}</Stat>
              <Stat label="Where" sub="on this computer"><span className="block max-w-full truncate font-mono text-sm" title={repo.local_path}>{repo.local_path || "–"}</span></Stat>
              <Stat label="Live site" sub={repo.homepage ? repo.homepage.replace(/^https?:\/\//, "") : "No site linked"}><StageChip live={repo.live} local /></Stat>
            </div>
          ) : (
          <div className="mt-5 grid grid-cols-2 border-y border-border md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Commits (30 days)" sub={commits ? `${nodes.length} loaded` : "loading…"}>{commits ? recent : "–"}</Stat>
            <Stat label="Latest release" sub={extras?.release ? `${ago(extras.release.date)}${ago(extras.release.date) === "today" ? "" : " ago"}` : extras ? "No releases" : "loading…"}>
              {extras?.release ? <a href={extras.release.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><Tag className="size-4 text-muted-foreground" />{extras.release.tag}</a> : "–"}
            </Stat>
            <Stat label="CI on main" sub={extras ? (extras.ci.length ? (ciOk === false ? "Failing" : ciOk ? "Passing" : "Running") : "No workflows") : "loading…"}>
              {extras?.ci.length ? (
                <span className="inline-flex gap-0.5">
                  {[...extras.ci].reverse().map((c, i) => <i key={i} title={c.ok === null ? "running or skipped" : c.ok ? "passed" : "failed"} className={`h-4 w-1.5 rounded-[2px] ${c.ok === null ? "bg-muted-foreground/40" : c.ok ? "bg-ok" : "bg-bad"}`} />)}
                </span>
              ) : "–"}
            </Stat>
            <Stat label="Open issues · PRs" sub={extras ? "on GitHub" : "loading…"}>
              {extras ? <span className="inline-flex items-center gap-3">
                <a href={doc.url ? `${doc.url}/issues` : "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline"><CircleDot className="size-4 text-muted-foreground" />{extras.issues}</a>
                <a href={doc.url ? `${doc.url}/pulls` : "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline"><GitPullRequest className="size-4 text-muted-foreground" />{extras.prs}</a>
              </span> : "–"}
            </Stat>
            <Stat label="Stars" sub={repo.forks ? `${repo.forks} forks` : undefined}>{repo.stars ?? 0}</Stat>
            <Stat label="Live site" sub={repo.homepage ? repo.homepage.replace(/^https?:\/\//, "") : "No site linked"}><StageChip live={repo.live} local={isLocal(repo)} /></Stat>
          </div>

          )}

          <div className="border-b border-border px-6 py-4">
            <Label right={<button className="hover:text-foreground" onClick={() => setView("resume")}>{impact.length ? "Edit" : "Add numbers"}</button>}>Impact</Label>
            {impact.length ? (
              <div className="flex flex-wrap gap-x-10 gap-y-3">
                {impact.map((m, i) => <div key={i}><div className="text-2xl font-semibold tracking-tight">{m.value}</div><div className="text-xs text-muted-foreground">{m.label}{m.note ? ` · ${m.note}` : ""}</div></div>)}
              </div>
            ) : <p className="text-xs text-muted-foreground">No numbers yet. Users, requests per day, downloads, load time: these are what recruiters read.</p>}
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="min-w-0 lg:border-r lg:border-border">
              <div className="flex items-center justify-between px-6 py-3.5 text-sm">
                <span className="font-medium">{isLocal(repo) ? "Commits" : "Recent commits"} {!isLocal(repo) && <span className="ml-1 font-mono text-xs text-muted-foreground">{repo.branch ?? "main"}</span>}</span>
                {!isLocal(repo) && <button onClick={() => setView("commits")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">History <ArrowUpRight className="size-3" /></button>}
              </div>
              {isLocal(repo) && <div className="px-6 pb-6"><EmptyState icon={HardDrive} compact title="Not on GitHub" hint="This project lives only on your computer, so there is no commit history here. Push it to GitHub and run Sync GitHub to bring it in." /></div>}
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {nodes.slice(0, 8).map((c) => (
                    <tr key={c.sha} className="cursor-pointer border-t border-border/70 hover:bg-muted/30" onClick={() => doc.url && window.open(`${doc.url}/commit/${c.sha}`, "_blank")}>
                      <td className="w-24 whitespace-nowrap py-2.5 pl-6 pr-3 font-mono text-xs text-muted-foreground">{c.short}</td>
                      <td className="max-w-0 truncate py-2.5 pr-3">{c.msg}</td>
                      <td className="hidden w-36 truncate py-2.5 pr-3 text-muted-foreground @xl:table-cell sm:table-cell">{c.author}</td>
                      <td className="w-16 whitespace-nowrap py-2.5 pr-6 text-right text-muted-foreground">{ago(c.date)}</td>
                    </tr>
                  ))}
                  {commits && !nodes.length && !isLocal(repo) && <tr className="border-t border-border/70"><td className="px-6 py-6 text-muted-foreground" colSpan={4}>No commits loaded. Open History and press Refresh.</td></tr>}
                  {!commits && <tr className="border-t border-border/70"><td className="px-6 py-6 text-muted-foreground" colSpan={4}>Loading commits…</td></tr>}
                </tbody>
              </table>
              {images.length > 0 && (
                <div className="border-t border-border px-6 py-4">
                  <Label right={<button className="hover:text-foreground" onClick={() => setView("resume")}>Manage</button>}>Screenshots</Label>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {images.slice(0, 6).map((s) => (
                      <a key={s.id} href={fileUrl(s.id)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(s.id)} alt={s.label || s.name} loading="lazy" className="aspect-video w-full object-cover object-top transition group-hover:scale-[1.03]" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-6 px-6 py-5">
              <div>
                <Label>About</Label>
                <div className="space-y-2 text-[13px]">
                  {repo.homepage && <a href={repo.homepage} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand hover:underline"><Globe className="size-3.5 shrink-0" /><span className="truncate">{repo.homepage.replace(/^https?:\/\//, "")}</span></a>}
                  {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5 shrink-0" /><span className="truncate">{doc.url.replace(/^https?:\/\//, "")}</span></a>}
                  {repo.created && <div className="flex items-center gap-2 text-muted-foreground"><Clock className="size-3.5 shrink-0" />Created {repo.created.slice(0, 10)}</div>}
                  {repo.size_kb ? <div className="text-muted-foreground">Size {kb(repo.size_kb)}</div> : null}
                </div>
              </div>

              <div>
                <Label right={detected.length ? "auto-detected" : !stackFound.length && byLang.length ? "from languages" : undefined}>Stack</Label>
                {chosen.length ? <div className="flex flex-wrap gap-1.5">{chosen.map((s) => <TechBadge key={s} name={s} />)}</div>
                  : <p className="text-xs text-muted-foreground">Nothing detected yet. Run Sync GitHub, or set the stack in the Resume tab.</p>}
              </div>

              {topics.length > 0 && (
                <div>
                  <Label>Topics</Label>
                  <div className="flex flex-wrap gap-1.5">{topics.map((t) => <span key={t} className="rounded-full border border-border bg-card/50 px-2.5 py-0.5 text-xs text-muted-foreground">{t}</span>)}</div>
                </div>
              )}

              <div>
                <Label>Languages</Label>
                <LangBar langs={repo.langs ?? {}} />
              </div>
            </aside>
          </div>
        </>
      )}

      {view === "resume" && (
        <div className="max-w-3xl space-y-8 px-6 py-6">
          <p className="text-sm text-muted-foreground">These fields feed the resume export and autofill. Your agent can draft them from the repo: <button className="inline-flex items-center gap-1 text-foreground underline" onClick={async () => { await navigator.clipboard.writeText(`Use the hq MCP server: call repo_context for "${arg}", then update_project with a one-line tagline, 2-3 outcome bullets and the stack, using only what the repo shows.`); toast.success("Prompt copied"); }}><Copy className="size-3" />copy prompt</button></p>
          <section className="space-y-2">
            <Label>Tagline</Label>
            <div className="flex gap-2">
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="One line a recruiter should read" />
              <Button variant="outline" onClick={() => save("tagline", tag, "Tagline saved")}>Save</Button>
            </div>
          </section>

          <section className="space-y-2">
            <Label right={detected.length && !doc.stack?.length ? `detected: ${detected.length}` : undefined}>Stack</Label>
            <div className="flex gap-2">
              <Input value={stack} onChange={(e) => setStack(e.target.value)} placeholder={detected.length ? `Leave empty to use detected: ${detected.slice(0, 4).join(", ")}…` : "Next.js, Postgres, …"} />
              <Button variant="outline" onClick={() => save("stack", stack.split(",").map((s) => s.trim()).filter(Boolean), "Stack saved")}>Save</Button>
              {detected.length > 0 && <Button variant="ghost" onClick={() => save("stack", detected, "Detected stack saved")}>Use detected</Button>}
            </div>
            <div className="flex flex-wrap gap-1.5">{chosen.map((s) => <TechBadge key={s} name={s} />)}</div>
          </section>

          <section className="space-y-2">
            <Label>Resume bullets</Label>
            <ul className="space-y-1.5 text-sm">
              {(doc.bullets ?? []).map((b, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">•</span>{b}</li>)}
              {!doc.bullets?.length && <li className="text-muted-foreground">None yet. Add outcomes with numbers, or ask your agent to draft them from the repo.</li>}
            </ul>
            <div className="flex gap-2">
              <Input value={bullet} onChange={(e) => setBullet(e.target.value)} placeholder="Add a bullet"
                onKeyDown={(e) => e.key === "Enter" && bullet && api("append", { path: `projects/${arg}/bullets`, value: bullet }).then(() => { setBullet(""); load(); })} />
              <Button variant="outline" onClick={() => bullet && api("append", { path: `projects/${arg}/bullets`, value: bullet }).then(() => { setBullet(""); load(); })}><Plus className="size-4" /></Button>
            </div>
          </section>
          <section className="space-y-2">
            <Label>Impact numbers</Label>
            <p className="text-xs text-muted-foreground">Users, requests per day, downloads, load time. Only numbers you can stand behind.</p>
            {impact.map((m, i) => (
              <div key={i} className="flex gap-2">
                <Input value={m.label} onChange={(e) => setImpact(impact.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label, e.g. Requests per day" />
                <Input className="w-40" value={m.value} onChange={(e) => setImpact(impact.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value, e.g. 50k" />
                <Button variant="ghost" size="icon" onClick={() => setImpact(impact.filter((_, j) => j !== i))} aria-label="Remove"><X className="size-4" /></Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setImpact([...impact, { label: "", value: "" }])}><Plus className="size-3.5" />Add number</Button>
              <Button size="sm" onClick={() => save("impact", impact.filter((m) => m.label.trim() && m.value.trim()), "Impact saved")}>Save impact</Button>
            </div>
          </section>

          <section className="space-y-2">
            <Label>Screenshots</Label>
            <DropZone accept={`image/png,image/jpeg,image/webp,image/gif`} onFiles={async (list) => {
              setBusy("upload");
              for (const f of list) { try { await uploadFile(f, { kind: "screenshot", link: { type: "project", ref: arg } }); } catch (e) { toast.error((e as Error).message); } }
              setBusy(""); await loadShots();
            }}>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!!busy} onClick={() => pick("image/png,image/jpeg,image/webp,image/gif")}>{busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}Add screenshots</Button>
                <Tip content={repo.homepage ? "Takes a screenshot of the live site with a public screenshot service (only the URL is sent)" : "This project has no live site URL"}>
                  <Button variant="outline" size="sm" disabled={!!busy || !repo.homepage} onClick={async () => {
                    setBusy("capture");
                    try { await api("capture_screenshot", { repo: arg }); toast.success("Live site captured"); await loadShots(); } catch (e) { toast.error((e as Error).message); }
                    setBusy("");
                  }}>{busy === "capture" ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}Capture live site</Button>
                </Tip>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                {images.map((s) => (
                  <div key={s.id} className="group relative overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(s.id)} alt={s.label || s.name} loading="lazy" className="aspect-video w-full object-cover object-top" />
                    <div className="absolute inset-x-0 bottom-0 hidden items-center justify-between gap-1 bg-black/70 p-1.5 text-xs group-hover:flex">
                      <button className={`rounded px-1.5 py-0.5 hover:bg-white/20 ${doc.cover === s.id ? "text-brand" : ""}`} onClick={() => save("cover", doc.cover === s.id ? "" : s.id, doc.cover === s.id ? "Cover removed" : "Cover set")}>{doc.cover === s.id ? "Cover" : "Set cover"}</button>
                      <button className="rounded p-1 hover:bg-white/20" aria-label="Delete" onClick={async () => { if (!confirm("Delete this screenshot? This cannot be undone.")) return; await api("file_delete", { id: s.id }); await loadShots(); }}><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </DropZone>
          </section>
          <button className="text-xs text-muted-foreground underline" onClick={() => go("repos")}>Back to all projects</button>
        </div>
      )}
    </div>
  );
}
