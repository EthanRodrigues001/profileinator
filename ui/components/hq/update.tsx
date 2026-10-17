"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/hq";

type Info = { current: string; latest: string; newer: boolean; url: string; notes?: string | null };
type TauriWindow = Window & { __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: object) => Promise<unknown> } };

const SKIP = "hq-update-skip";
const desktop = () => typeof window !== "undefined" && !!(window as TauriWindow).__TAURI_INTERNALS__;

/** Checks GitHub for a newer release (on load, then every 6 hours). In the desktop app it can install the signed update itself. */
export function useUpdate() {
  const [info, setInfo] = useState<Info | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const check = useCallback(async (manual = false) => {
    setChecking(true);
    try {
      const i = await api<Info>("update_check");
      setInfo(i);
      if (manual) toast[i.newer ? "info" : "success"](i.newer ? `Version ${i.latest} is available` : `You are on the latest version (${i.current})`);
    } catch (e) {
      if (manual) toast.error((e as Error).message);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(() => check(), 6 * 3600 * 1000);
    return () => clearInterval(id);
  }, [check]);

  const install = async () => {
    if (!info) return;
    if (!desktop()) { window.open(info.url, "_blank", "noreferrer"); return; }
    setInstalling(true);
    try {
      await (window as TauriWindow).__TAURI_INTERNALS__!.invoke("install_update");
    } catch (e) {
      toast.error(`Update failed: ${String(e)}`);
      setInstalling(false);
    }
  };

  return { info, check, checking, install, installing, desktop: desktop() };
}

export function UpdateBanner() {
  const u = useUpdate();
  const [skipped, setSkipped] = useState<string | null>(null);
  useEffect(() => { try { setSkipped(localStorage.getItem(SKIP)); } catch { /* storage blocked */ } }, []);
  if (!u.info?.newer || skipped === u.info.latest) return null;
  const dismiss = () => { try { localStorage.setItem(SKIP, u.info!.latest); } catch { /* storage blocked */ } setSkipped(u.info!.latest); };
  return (
    <div className="flex items-center gap-3 border-b border-brand/30 bg-brand/10 px-4 py-1.5 text-xs">
      <ArrowUpCircle className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1 truncate">Profileinator <b>{u.info.latest}</b> is available (you have {u.info.current}). <a className="underline" href={u.info.url} target="_blank" rel="noreferrer">What&apos;s new</a></span>
      <Button size="sm" className="h-6" onClick={u.install} disabled={u.installing}>
        {u.installing && <Loader2 className="size-3 animate-spin" />}
        {u.installing ? "Updating…" : u.desktop ? "Update & restart" : "Download"}
      </Button>
      <button aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={dismiss}><X className="size-3.5" /></button>
    </div>
  );
}

export function UpdateCard() {
  const u = useUpdate();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Version {u.info?.current ?? "…"}</p>
        <p className="text-xs text-muted-foreground">{u.info ? (u.info.newer ? `${u.info.latest} is available` : "You are on the latest version") : "Checking…"}</p>
      </div>
      <div className="flex gap-2">
        {u.info?.newer && <Button size="sm" onClick={u.install} disabled={u.installing}>{u.installing ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpCircle className="size-3.5" />}{u.desktop ? "Update & restart" : "Download"}</Button>}
        <Button size="sm" variant="outline" onClick={() => u.check(true)} disabled={u.checking}>{u.checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Check for updates</Button>
      </div>
    </div>
  );
}

/** Updates tab: current and latest version, release notes, check and install. */
export function UpdatesPanel() {
  const u = useUpdate();
  return (
    <div className="space-y-4 p-4">
      <UpdateCard />
      {u.info?.newer && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">What&apos;s new in {u.info.latest}</p>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">{u.info.notes?.trim() || "No release notes."}</pre>
          <a className="mt-3 inline-block text-xs underline" href={u.info.url} target="_blank" rel="noreferrer">View release on GitHub</a>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{u.desktop ? "Updates are signed and verified before they install." : "You are using the browser build: updates are downloaded from the release page."} The app checks for updates on launch and every 6 hours.</p>
    </div>
  );
}
