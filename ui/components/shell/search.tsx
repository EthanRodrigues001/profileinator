"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, FileText, FolderGit2, Link2, RefreshCw, Search, Sparkles, UserRound, type LucideIcon, GraduationCap, Briefcase, Trophy, AlertTriangle, Layers, ArrowUpCircle, Image as ImageIcon, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { LANG_COLOR, api, type FileEntry } from "@/lib/hq";
import type { Data } from "@/components/hq/use-hq";
import { KINDS, type TabKind } from "./nav";

type GNode = { id: string; kind: string; label: string; deg: number };
type Export = { nodes: GNode[] };
type Props = {
  d: Data | null;
  go: (kind: TabKind, arg?: string) => void;
  run: (op: string, label: string, args?: object) => Promise<void>;
};

const NODE_GROUP: Record<string, { title: string; icon: LucideIcon }> = {
  tech: { title: "Skills & tools", icon: Layers }, experience: { title: "Roles", icon: Briefcase }, education: { title: "Education", icon: GraduationCap },
  achievement: { title: "Achievements", icon: Trophy }, claim: { title: "Gaps", icon: AlertTriangle }, decision: { title: "Decisions", icon: Brain },
};
const PAGES: TabKind[] = ["home", "profile", "repos", "commits", "graph", "links", "context", "resume", "files", "activity", "integrations"];

/** Tell the Graph page what to show, whether it is mounted yet or not. */
export function sendToGraph(msg: { focus?: string; ask?: string }) {
  try { sessionStorage.setItem("hq-graph-msg", JSON.stringify(msg)); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent("hq:graph", { detail: msg }));
}

function Row({ icon: Icon, children, hint }: { icon: LucideIcon; children: React.ReactNode; hint?: string }) {
  return (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="ml-2 max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{hint}</span>}
    </>
  );
}

/** One search for everything: pages, projects, skills, roles, links, files, your stored facts, and actions. Ctrl K from anywhere. */
export function SearchPalette({ d, go, run }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // load the searchable index each time the palette opens, so it is never stale
  useEffect(() => {
    if (!open) { setQ(""); setFacts([]); return; }
    api<Export>("graph_export").then((x) => setNodes(x.nodes)).catch(() => {});
    api<FileEntry[]>("files").then(setFiles).catch(() => {});
  }, [open]);

  // full-text hits across everything stored, as you type
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setFacts([]); return; }
    timer.current = setTimeout(() => { api<string[]>("search", { q }).then((r) => setFacts(r.slice(0, 8))).catch(() => setFacts([])); }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const typing = q.trim().length > 0;
  const pick = (fn: () => void) => () => { setOpen(false); setTimeout(fn, 60); };
  const byKind = useMemo(() => {
    const g: Record<string, GNode[]> = {};
    for (const n of nodes) if (NODE_GROUP[n.kind]) (g[n.kind] ??= []).push(n);
    for (const k of Object.keys(g)) g[k].sort((a, b) => b.deg - a.deg);
    return g;
  }, [nodes]);
  const links = useMemo(() => [
    ...(d?.me.links ?? []).map((l) => ({ name: l.label, url: l.url })),
    ...(d?.repos ?? []).filter((r) => r.pinned && r.homepage).map((r) => ({ name: `${r.name} (live site)`, url: r.homepage! })),
  ], [d]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search everything"
        className="group relative mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm text-muted-foreground transition hover:border-ring/50 hover:text-foreground dark:bg-input/30">
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Search</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search pages, projects, skills, links, files and your stored facts" className="sm:max-w-2xl">
        <Command>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search projects, skills, roles, links, files, facts…" />
          <CommandList className="max-h-[26rem] p-1">
            <CommandEmpty>Nothing found. Try the Ask option below.</CommandEmpty>

            <CommandGroup heading="Pages">
              {PAGES.map((k) => { const { title, icon } = KINDS[k as Exclude<TabKind, "project">]; return (
                <CommandItem key={k} value={`page ${title}`} onSelect={pick(() => go(k))}><Row icon={icon}>{title}</Row></CommandItem>
              ); })}
            </CommandGroup>

            {(d?.repos.length ?? 0) > 0 && (
              <CommandGroup heading={typing ? "Projects" : "Pinned projects"}>
                {d!.repos.filter((r) => typing || r.pinned).map((r) => (
                  <CommandItem key={r.name} value={`project ${r.name} ${r.tagline ?? ""} ${r.desc ?? ""} ${(r.stack ?? []).join(" ")} ${(r.detected ?? []).map((x) => x.name).join(" ")} ${(r.topics ?? []).join(" ")}`} onSelect={pick(() => go("project", r.name))}>
                    <i className="size-2.5 shrink-0 rounded-full" style={{ background: LANG_COLOR[r.primary ?? ""] ?? "#71717a" }} />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.pinned && <span className="shrink-0 text-[11px] text-brand">pinned</span>}
                    <span className="ml-2 max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{r.tagline || r.desc}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {typing && Object.entries(NODE_GROUP).map(([kind, g]) => byKind[kind]?.length ? (
              <CommandGroup key={kind} heading={g.title}>
                {byKind[kind].slice(0, kind === "tech" ? 150 : 60).map((n) => (
                  <CommandItem key={n.id} value={`${g.title} ${n.label}`} onSelect={pick(() => { go("graph"); sendToGraph({ focus: n.id }); })}>
                    <Row icon={g.icon} hint={`${n.deg} connection${n.deg === 1 ? "" : "s"}`}>{n.label}</Row>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null)}

            {typing && links.length > 0 && (
              <CommandGroup heading="Links">
                {links.map((l) => (
                  <CommandItem key={l.url + l.name} value={`link ${l.name} ${l.url}`} onSelect={pick(() => window.open(l.url, "_blank"))}>
                    <Row icon={Link2} hint={l.url.replace(/^https?:\/\/(www\.)?/, "")}>{l.name}</Row>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {typing && files.length > 0 && (
              <CommandGroup heading="Files">
                {files.map((f) => (
                  <CommandItem key={f.id} value={`file ${f.kind} ${f.label ?? ""} ${f.name} ${f.links.map((l) => l.ref).join(" ")}`} onSelect={pick(() => go(f.kind === "resume" ? "resume" : "files"))}>
                    <Row icon={f.kind === "screenshot" || f.kind === "avatar" ? ImageIcon : FileText} hint={f.kind === "resume" && f.current ? "current resume" : f.kind}>{f.label || f.name}</Row>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem value="action sync github repos" onSelect={pick(() => run("sync", "GitHub sync"))}><Row icon={RefreshCw}>Sync GitHub</Row></CommandItem>
              <CommandItem value="action fetch commits" onSelect={pick(() => run("commits_all", "Fetching commits"))}><Row icon={DownloadCloud}>Fetch commits for all repos</Row></CommandItem>
              <CommandItem value="action check all links" onSelect={pick(() => run("check_links", "Link check"))}><Row icon={Link2}>Check all links</Row></CommandItem>
              <CommandItem value="action copy brief ai chat" onSelect={pick(async () => { await navigator.clipboard.writeText(await api<string>("brief", {})); toast.success("Brief copied"); })}><Row icon={Brain}>Copy a brief for an AI chat</Row></CommandItem>
              <CommandItem value="action check for updates version" onSelect={pick(() => go("integrations"))}><Row icon={ArrowUpCircle}>Check for updates</Row></CommandItem>
              <CommandItem value="action open profile" onSelect={pick(() => go("profile"))}><Row icon={UserRound}>View my profile</Row></CommandItem>
            </CommandGroup>

            {facts.length > 0 && (
              <CommandGroup heading="Matches in your data">
                {facts.map((f, i) => (
                  <CommandItem key={i} forceMount value={`fact ${q} ${i}`} onSelect={pick(() => go("context"))}>
                    <Row icon={FolderGit2}>{f}</Row>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {q.trim().length > 1 && (
              <CommandGroup heading="Ask">
                <CommandItem forceMount value={`ask ${q}`} onSelect={pick(() => { go("graph"); sendToGraph({ ask: q.trim() }); })}>
                  <Row icon={Sparkles}>Ask your profile: &ldquo;{q.trim()}&rdquo;</Row>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
