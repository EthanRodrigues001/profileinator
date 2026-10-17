"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Check, Download, ExternalLink, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/kit/empty-state";
import { Dropdown } from "@/components/kit/dropdown";
import { PdfView } from "./pdf-view";
import { ResumeSuggestions } from "./resume-suggestions";
import { JobMatch } from "./job-match";
import { api, bytes, fileUrl, type FileEntry } from "@/lib/hq";
import type { ViewProps } from "./views";

const when = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

type Tab = "pdf" | "suggestions" | "match";

/** The stored resume: the version marked current is shown as the real PDF; the Text tab is the layout generated from your profile data. */
export function Resume({ go, d }: ViewProps) {
  const [versions, setVersions] = useState<FileEntry[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    const v = (await api<FileEntry[]>("files", { kind: "resume" }).catch(() => [])).sort((a, b) => b.added - a.added);
    setVersions(v);
    setViewing((cur) => (cur && v.some((x) => x.id === cur) ? cur : (v.find((x) => x.current) ?? v[0])?.id ?? null));
    setTab((t) => t ?? "pdf");
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!versions || !tab) return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading…</div>;

  const cur = versions.find((v) => v.id === viewing) ?? null;
  const makeCurrent = async () => {
    if (!cur) return;
    try { await api("file_update", { id: cur.id, current: true }); toast.success(`${cur.label || cur.name} is now the current resume`); await load(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <div className="flex border-b border-border px-4">
        {([["pdf", "PDF"], ["suggestions", "Suggestions"], ["match", "Job match"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`relative px-4 py-2.5 text-sm transition ${tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
            {tab === id && <span className="absolute inset-x-3 bottom-0 h-px bg-brand" />}
          </button>
        ))}
      </div>

      {tab === "match" ? (
        <JobMatch />
      ) : tab === "pdf" ? (
        !versions.length ? (
          <div className="mx-6 mt-6"><EmptyState icon={FileText} title="No resume file stored yet" hint="Upload your PDF under Files. The version you mark as current is shown here.">
            <Button size="sm" onClick={() => go("files")}><Upload className="size-3.5" />Upload resume</Button>
          </EmptyState></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Dropdown size="sm" className="w-52" value={viewing ?? ""} onChange={setViewing}
                  options={versions.map((v) => ({ value: v.id, label: `${v.label || v.name}${v.current ? " (current)" : ""}` }))} />
                {cur?.current ? <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] text-brand">Current</span> : cur && <span className="text-xs text-muted-foreground">Previous version</span>}
                {cur && <span className="hidden text-xs text-muted-foreground md:inline">{cur.name} · {bytes(cur.size)} · added {when(cur.added)}</span>}
              </div>
              <div className="flex items-center gap-2">
                {cur && !cur.current && <Button size="sm" variant="outline" onClick={makeCurrent}><Check className="size-3.5" />Make current</Button>}
                {cur && <a href={fileUrl(cur.id)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="size-3.5" />Open</Button></a>}
                {cur && <a href={fileUrl(cur.id)} download={cur.name}><Button size="sm" variant="outline"><Download className="size-3.5" />Download</Button></a>}
                <Button size="sm" variant="ghost" onClick={() => go("files")}><Upload className="size-3.5" />Manage</Button>
              </div>
            </div>
            {cur?.ext === "pdf" ? (
              <PdfView key={cur.id} url={fileUrl(cur.id)} />
            ) : (
              <div className="grid place-items-center gap-3 px-4 py-24 text-center">
                <FileText className="size-10 text-muted-foreground" />
                <p className="text-sm">{cur?.name} can&apos;t be previewed here</p>
                <p className="max-w-sm text-xs text-muted-foreground">Upload a PDF version to see it on this page. You can still open or download this file.</p>
              </div>
            )}
          </>
        )
      ) : cur ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
            <Dropdown size="sm" className="w-52" value={viewing ?? ""} onChange={setViewing}
              options={versions.map((v) => ({ value: v.id, label: `${v.label || v.name}${v.current ? " (current)" : ""}` }))} />
            <span className="text-xs text-muted-foreground">Compared with the latest facts in your profile</span>
          </div>
          <ResumeSuggestions key={cur.id} file={cur} d={d} />
        </>
      ) : (
        <div className="mx-6 mt-6 grid place-items-center rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm">Upload a resume to get suggestions</p>
          <Button size="sm" className="mt-4" onClick={() => go("files")}><Upload className="size-3.5" />Upload resume</Button>
        </div>
      )}
    </div>
  );
}
