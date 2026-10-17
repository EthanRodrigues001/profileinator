"use client";
import { useEffect, useState } from "react";
import { FileText, FolderOpen, Gauge, Link2 } from "lucide-react";
import { api, fileUrl, type FileEntry } from "@/lib/hq";
import { score } from "./score";
import { compare, readPdf, type Raw } from "./resume-suggestions";
import type { TabKind } from "@/components/shell/nav";
import type { Data } from "./use-hq";

function Cell({ icon: Icon, label, value, sub, onClick }: { icon: typeof FileText; label: string; value: React.ReactNode; sub?: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group min-w-0 border-r border-border px-4 py-3.5 text-left transition last:border-r-0 even:border-r-0 hover:bg-muted/30 xl:even:border-r">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div>
      <div className="mt-1.5 truncate text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </button>
  );
}

const age = (ts: number) => { const d = (Date.now() / 1000 - ts) / 86400; return d < 1 ? "today" : d < 60 ? `${Math.round(d)}d ago` : `${Math.round(d / 30)}mo ago`; };

const checks = new Map<string, Promise<number>>();

/** The stored files, the current resume, and how many things that resume is missing (computed once per file, on this machine). */
export function useResumeCheck(d: Data) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [tips, setTips] = useState<number | null>(null);
  useEffect(() => { api<FileEntry[]>("files").then(setFiles).catch(() => setFiles([])); }, []);
  const current = files?.find((f) => f.kind === "resume" && f.current) ?? null;
  useEffect(() => {
    if (!current || current.ext !== "pdf") { setTips(null); return; }
    let dead = false;
    let p = checks.get(current.id);
    if (!p) {
      p = Promise.all([api<Raw>("get", { path: "me" }), readPdf(fileUrl(current.id))])
        .then(([me, pdf]) => compare(pdf.text, pdf.links, me, d, current).items.filter((i) => i.kind !== "fresh").length);
      checks.set(current.id, p);
    }
    p.then((n) => { if (!dead) setTips(n); }).catch(() => { if (!dead) setTips(null); });
    return () => { dead = true; };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { files, current, tips };
}

/** Four at-a-glance cells: the current resume and how complete it is, profile score, link health, stored files. */
export function HomeCards({ d, go }: { d: Data; go: (k: TabKind, a?: string) => void }) {
  const { files, current, tips } = useResumeCheck(d);
  const s = score(d);
  const sites = [...d.me.links.map((l) => l.url), ...d.repos.filter((r) => r.pinned && r.homepage).map((r) => r.homepage!)];
  const st = (u: string) => d.links[u]?.status;
  const liveN = sites.filter((u) => st(u) === "ok").length;
  const attn = sites.filter((u) => ["dead", "down", "gated"].includes(st(u) ?? "")).length;
  const shots = files?.filter((f) => f.kind === "screenshot").length ?? 0;
  const versions = files?.filter((f) => f.kind === "resume").length ?? 0;

  return (
    <div className="grid grid-cols-2 border-b border-border xl:grid-cols-4">
      <Cell icon={FileText} label="Resume" onClick={() => go("resume")}
        value={files === null ? "…" : current ? (current.label || current.name) : "None yet"}
        sub={current ? `${age(current.added)}${tips !== null ? ` · ${tips} suggestion${tips === 1 ? "" : "s"}` : ""}` : "Upload a PDF under Files"} />
      <Cell icon={Gauge} label="Profile score" onClick={() => go("context")} value={`${s.pct}%`} sub={s.todos.length ? `${s.todos.length} thing${s.todos.length === 1 ? "" : "s"} to do` : "Nothing left to do"} />
      <Cell icon={Link2} label="Links" onClick={() => go("links")} value={sites.length ? `${liveN} live` : "Unchecked"} sub={attn ? `${attn} need attention` : sites.length ? "All good" : "Run a link check"} />
      <Cell icon={FolderOpen} label="Files" onClick={() => go("files")} value={files === null ? "…" : `${versions + shots + (d.me.identity.avatar ? 1 : 0)}`} sub={`${versions} resume · ${shots} screenshots${d.me.identity.avatar ? " · photo" : ""}`} />
    </div>
  );
}
