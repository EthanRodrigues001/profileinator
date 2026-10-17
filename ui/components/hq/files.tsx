"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Eye, FileText, ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tip } from "@/components/kit/tip";
import { Dropdown } from "@/components/kit/dropdown";
import { api, bytes, fileUrl, uploadFile, type FileEntry, type FileLink } from "@/lib/hq";
import { cn } from "@/lib/utils";
import { useSelection } from "@/lib/selection";
import { EmptyState } from "@/components/kit/empty-state";
import type { ViewProps } from "./views";

const TABS = [["resume", "Resume"], ["screenshots", "Screenshots"], ["avatar", "Profile picture"]] as const;
type Tab = (typeof TABS)[number][0];

const when = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Drag files onto a region or press a button; both end up in `onFiles`. */
export function DropZone({ onFiles, accept, children, className }: { onFiles: (f: File[]) => void; accept: string; children: React.ReactNode; className?: string }) {
  const [over, setOver] = useState(false);
  return (
    <div className={cn("relative", className)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}>
      {children}
      {over && <div className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-xl border-2 border-dashed border-brand/60 bg-background/80 text-sm">Drop to add</div>}
      <input id={`pick-${accept}`} type="file" accept={accept} multiple className="hidden" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}
export const pick = (accept: string) => document.getElementById(`pick-${accept}`)?.click();

function useFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => { setFiles(await api<FileEntry[]>("files").catch(() => [])); setLoaded(true); }, []);
  useEffect(() => { load(); }, [load]);
  return { files, loaded, load };
}

const HEAD = ({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
    <div><h2 className="text-sm font-medium">{title}</h2><p className="text-xs text-muted-foreground">{hint}</p></div>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

/* ------------------------------------------------------------------ resume versions */
function ResumeTab({ files, load }: { files: FileEntry[]; load: () => Promise<void> }) {
  const { setSel } = useSelection();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const rows = files.filter((f) => f.kind === "resume").sort((a, b) => b.added - a.added);
  const ACCEPT = ".pdf,.doc,.docx,.md,.txt";

  const add = async (list: File[]) => {
    setBusy(true);
    for (const f of list) {
      try { await uploadFile(f, { kind: "resume" }); toast.success(`${f.name} added as the current resume`); } catch (e) { toast.error((e as Error).message); }
    }
    setBusy(false); await load();
  };
  const act = async (op: string, args: object, msg?: string) => { try { await api(op, args); if (msg) toast.success(msg); await load(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <DropZone onFiles={add} accept={ACCEPT} className="min-h-[24rem]">
      <HEAD title="Resume versions" hint="Every version you upload is kept. The current one is what agents and exports point to.">
        <Button size="sm" onClick={() => pick(ACCEPT)} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}Upload version</Button>
      </HEAD>
      {!rows.length ? (
        <div className="mx-6"><EmptyState icon={FileText} title="No resume stored yet" hint="Drop a PDF or document here. Each upload becomes a new version, so you can always go back to the one you sent last month.">
          <Button size="sm" onClick={() => pick(ACCEPT)}><Upload className="size-3.5" />Upload version</Button>
        </EmptyState></div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="border-y border-border text-left text-xs font-normal text-muted-foreground">
            <th className="h-9 pl-6 pr-3 font-normal">Version</th><th className="px-3 font-normal">File</th><th className="px-3 font-normal">Size</th><th className="px-3 font-normal">Added</th><th className="pr-6" />
          </tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} onClick={() => setSel({ kind: "file", id: f.id })} className="cursor-pointer border-b border-border/70 hover:bg-muted/30">
                <td className="py-2.5 pl-6 pr-3">
                  <div className="flex items-center gap-2">
                    {edit === f.id ? (
                      <Input autoFocus defaultValue={f.label} className="h-7 w-44 text-[13px]" onBlur={(e) => { setEdit(null); if (e.target.value !== f.label) act("file_update", { id: f.id, label: e.target.value }); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                    ) : (
                      <button className="font-medium hover:underline" onClick={() => setEdit(f.id)} title="Rename">{f.label || "Untitled"}</button>
                    )}
                    {f.current && <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] text-brand">Current</span>}
                  </div>
                </td>
                <td className="max-w-0 truncate px-3 text-muted-foreground">{f.name}</td>
                <td className="whitespace-nowrap px-3 text-muted-foreground">{bytes(f.size)}</td>
                <td className="whitespace-nowrap px-3 text-muted-foreground">{when(f.added)}</td>
                <td className="whitespace-nowrap py-1.5 pr-6 text-right">
                  <Tip content="Open"><a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="inline-grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Eye className="size-4" /></a></Tip>
                  <Tip content="Download"><a href={fileUrl(f.id)} download={f.name} className="inline-grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Download className="size-4" /></a></Tip>
                  {!f.current && <Tip content="Make current"><button onClick={() => act("file_update", { id: f.id, current: true }, `${f.label || f.name} is now current`)} className="inline-grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Check className="size-4" /></button></Tip>}
                  <Tip content="Delete"><button onClick={() => confirm(`Delete ${f.label || f.name}? This cannot be undone.`) && act("file_delete", { id: f.id }, "Deleted")} className="inline-grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-bad"><Trash2 className="size-4" /></button></Tip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DropZone>
  );
}

/* ------------------------------------------------------------------ screenshots */
const linkLabel = (l: FileLink) => (l.type === "me" ? "Profile" : `${l.type}: ${l.ref}`);

function Detail({ f, d, onClose, load, reload }: { f: FileEntry; d: ViewProps["d"]; onClose: () => void; load: () => Promise<void>; reload: () => Promise<void> }) {
  const [type, setType] = useState<FileLink["type"]>("project");
  const [ref, setRef] = useState("");
  const [label, setLabel] = useState(f.label ?? "");
  const [note, setNote] = useState(f.note ?? "");
  const options: Record<string, string[]> = {
    project: d.repos.map((r) => r.name),
    experience: d.me.experience.map((e) => `${e.role} · ${e.org}`),
    achievement: (d.me.achievements ?? []).map((a) => (typeof a === "string" ? a : a.title)),
    education: d.me.education.map((e) => e.degree),
  };
  const run = async (op: string, args: object, msg?: string) => { try { await api(op, args); if (msg) toast.success(msg); await load(); await reload(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={onClose}>
      <div className="grid max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl md:grid-cols-[minmax(0,1fr)_20rem]" onClick={(e) => e.stopPropagation()}>
        <div className="grid min-h-64 place-items-center overflow-auto bg-black/40 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(f.id)} alt={f.label || f.name} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5 text-[13px]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="truncate font-medium">{f.name}</p><p className="text-xs text-muted-foreground">{bytes(f.size)} · {when(f.added)}</p></div>
            <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
          </div>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Caption</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (f.label ?? "") && run("file_update", { id: f.id, label })} placeholder="e.g. Dashboard" /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Note</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (f.note ?? "") && run("file_update", { id: f.id, note })} placeholder="What it shows" /></label>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Linked to</span>
            <div className="flex flex-wrap gap-1.5">
              {f.links.map((l) => (
                <span key={linkLabel(l)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 py-0.5 pl-2.5 pr-1 text-xs">
                  {linkLabel(l)}<button aria-label="Unlink" onClick={() => run("file_update", { id: f.id, unlink: l })} className="rounded-full p-0.5 hover:bg-accent"><X className="size-3" /></button>
                </span>
              ))}
              {!f.links.length && <span className="text-xs text-muted-foreground">Nothing yet</span>}
            </div>
            <div className="flex gap-1.5">
              <Dropdown className="w-32 shrink-0" size="sm" value={type} onChange={(v) => { setType(v as FileLink["type"]); setRef(""); }}
                options={["project", "experience", "achievement", "education"].map((x) => ({ value: x, label: x }))} />
              <Dropdown className="flex-1" size="sm" placeholder="Choose…" value={ref} onChange={setRef} options={(options[type] ?? []).map((o) => ({ value: o, label: o }))} />
              <Button size="sm" variant="outline" disabled={!ref} onClick={() => run("file_update", { id: f.id, link: { type, ref } }, "Linked")}>Add</Button>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            {f.links.filter((l) => l.type === "project").map((l) => (
              <Button key={l.ref} size="sm" variant="outline" onClick={() => run("update_project", { name: l.ref, cover: f.id }, `Cover of ${l.ref} set`)}>Use as {l.ref} cover</Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => run("set_avatar", { id: f.id }, "Profile picture set")}>Use as profile picture</Button>
            <Button size="sm" variant="ghost" className="text-bad" onClick={() => confirm("Delete this screenshot? This cannot be undone.") && run("file_delete", { id: f.id }, "Deleted").then(onClose)}><Trash2 className="size-3.5" />Delete</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShotsTab({ files, load, d, reload }: { files: FileEntry[]; load: () => Promise<void>; d: ViewProps["d"]; reload: () => Promise<void> }) {
  const { setSel } = useSelection();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shots = files.filter((f) => f.kind === "screenshot").sort((a, b) => b.added - a.added);
  const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
  const add = async (list: File[]) => {
    setBusy(true);
    for (const f of list) { try { await uploadFile(f, { kind: "screenshot" }); } catch (e) { toast.error((e as Error).message); } }
    setBusy(false); await load();
  };
  const cur = shots.find((s) => s.id === open);
  return (
    <DropZone onFiles={add} accept={ACCEPT} className="min-h-[24rem]">
      <HEAD title="Screenshots" hint="Images of your work. Link each to a project, role or achievement. Capture live sites from a project page.">
        <Button size="sm" onClick={() => pick(ACCEPT)} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}Add screenshots</Button>
      </HEAD>
      {!shots.length ? (
        <div className="mx-6"><EmptyState icon={ImagePlus} title="No screenshots yet" hint="Drop images here, or open a project and press Capture to screenshot its live site." /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-6 pb-8 md:grid-cols-3 2xl:grid-cols-4">
          {shots.map((s) => (
            <button key={s.id} onClick={() => { setSel({ kind: "file", id: s.id }); setOpen(s.id); }} className="group overflow-hidden rounded-xl border border-border bg-card/30 text-left transition hover:border-brand/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(s.id)} alt={s.label || s.name} loading="lazy" className="aspect-video w-full object-cover transition group-hover:scale-[1.02]" />
              <div className="space-y-1 p-3">
                <p className="truncate text-[13px] font-medium">{s.label || s.name}</p>
                <div className="flex flex-wrap gap-1">
                  {s.links.length ? s.links.map((l) => <span key={linkLabel(l)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{linkLabel(l)}</span>) : <span className="text-[11px] text-muted-foreground">Not linked</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {cur && <Detail f={cur} d={d} load={load} reload={reload} onClose={() => setOpen(null)} />}
    </DropZone>
  );
}

/* ------------------------------------------------------------------ profile picture */
function AvatarTab({ files, load, d, reload }: { files: FileEntry[]; load: () => Promise<void>; d: ViewProps["d"]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const mine = files.filter((f) => f.kind === "avatar").sort((a, b) => b.added - a.added);
  const current = d.me.identity.avatar;
  const ACCEPT = "image/png,image/jpeg,image/webp";
  const add = async (list: File[]) => {
    const f = list[0]; if (!f) return;
    setBusy(true);
    try { await uploadFile(f, { kind: "avatar" }); toast.success("Profile picture updated"); } catch (e) { toast.error((e as Error).message); }
    setBusy(false); await load(); await reload();
  };
  const use = async (id: string) => { try { await api("set_avatar", { id }); toast.success("Profile picture set"); await reload(); } catch (e) { toast.error((e as Error).message); } };
  const del = async (id: string) => { if (!confirm("Delete this picture? This cannot be undone.")) return; await api("file_delete", { id }); if (current === id) await api("set", { path: "me/identity/avatar", value: "" }); await load(); await reload(); };
  return (
    <DropZone onFiles={add} accept={ACCEPT} className="min-h-[24rem]">
      <HEAD title="Profile picture" hint="Shown on your Profile page and used when agents build a portfolio or resume header.">
        <Button size="sm" onClick={() => pick(ACCEPT)} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}Upload picture</Button>
      </HEAD>
      <div className="flex items-center gap-6 px-6 pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current ? <img src={fileUrl(current)} alt="" className="size-32 rounded-full border border-border object-cover" /> : <div className="grid size-32 place-items-center rounded-full border border-dashed border-border text-xs text-muted-foreground">No picture</div>}
        <p className="max-w-sm text-xs text-muted-foreground">Drop an image anywhere on this page, or press Upload. PNG, JPG or WebP. It stays on this computer.</p>
      </div>
      {mine.length > 0 && (
        <div className="border-t border-border px-6 py-4">
          <p className="mb-3 text-xs text-muted-foreground">Previous pictures</p>
          <div className="flex flex-wrap gap-3">
            {mine.map((f) => (
              <div key={f.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(f.id)} alt="" className={cn("size-20 rounded-full object-cover ring-2", current === f.id ? "ring-brand" : "ring-transparent")} />
                <div className="absolute inset-0 hidden items-center justify-center gap-1 rounded-full bg-black/60 group-hover:flex">
                  {current !== f.id && <button className="rounded p-1 hover:bg-white/20" onClick={() => use(f.id)} aria-label="Use"><Check className="size-4" /></button>}
                  <button className="rounded p-1 hover:bg-white/20" onClick={() => del(f.id)} aria-label="Delete"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DropZone>
  );
}

/** Local file store: resume versions, screenshots linked to projects/roles/achievements, and the profile picture. */
export function Files({ d, reload }: ViewProps & { reload: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("resume");
  const { files, load, loaded } = useFiles();
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  return (
    <div>
      <div className="flex border-b border-border px-4">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`relative px-4 py-2.5 text-sm transition ${tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {label}<span className="ml-1.5 text-xs text-muted-foreground">{files.filter((f) => (id === "screenshots" ? f.kind === "screenshot" : f.kind === (id === "avatar" ? "avatar" : "resume"))).length || ""}</span>
            {tab === id && <span className="absolute inset-x-3 bottom-0 h-px bg-brand" />}
          </button>
        ))}
      </div>
      {loaded && tab === "resume" && <ResumeTab files={files} load={load} />}
      {loaded && tab === "screenshots" && <ShotsTab files={files} load={load} d={d} reload={reload} />}
      {loaded && tab === "avatar" && <AvatarTab files={files} load={load} d={d} reload={reload} />}
    </div>
  );
}
