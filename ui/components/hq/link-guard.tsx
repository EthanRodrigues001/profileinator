"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/hq";

const KEY = "hq-trusted-hosts";
const trustedHosts = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const trust = (host: string) => { try { localStorage.setItem(KEY, JSON.stringify([...new Set([...trustedHosts(), host])])); } catch { /* storage blocked */ } };

const isWeb = (u: URL) => u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:";
const isExternal = (u: URL) => isWeb(u) && (u.protocol === "mailto:" || u.origin !== window.location.origin);
const isLocalFile = (u: URL) => u.origin === window.location.origin && u.pathname.startsWith("/files/");

/**
 * Every external link goes through a confirmation, then opens in the system's default browser (the desktop window cannot open
 * external links itself). Files served by hq (resume PDFs, screenshots) open in the browser without a warning.
 */
export function LinkGuard() {
  const [pending, setPending] = useState<URL | null>(null);
  const [remember, setRemember] = useState(false);
  const nativeOpen = useRef<typeof window.open | null>(null);

  const openOut = useCallback(async (url: string) => {
    try { await api("open_url", { url }); } catch (e) {
      // an older hq without open_url: fall back to the browser's own behaviour
      if (nativeOpen.current) nativeOpen.current.call(window, url, "_blank", "noopener,noreferrer"); else toast.error((e as Error).message);
    }
  }, []);

  const ask = useCallback((u: URL) => {
    if (u.protocol !== "mailto:" && trustedHosts().includes(u.host)) { openOut(u.href); return; }
    setRemember(false); setPending(u);
  }, [openOut]);

  useEffect(() => {
    nativeOpen.current = window.open;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download")) return;
      let u: URL; try { u = new URL(a.href, window.location.href); } catch { return; }
      if (isExternal(u)) { e.preventDefault(); e.stopPropagation(); ask(u); }
      else if (isLocalFile(u) && a.target === "_blank") { e.preventDefault(); e.stopPropagation(); openOut(u.href); }
    };
    document.addEventListener("click", onClick, true);
    const orig = window.open;
    window.open = ((url?: string | URL, ...rest: unknown[]) => {
      try {
        const u = new URL(String(url ?? ""), window.location.href);
        if (isExternal(u)) { ask(u); return null; }
        if (isLocalFile(u)) { openOut(u.href); return null; }
      } catch { /* not a URL: fall through */ }
      return (orig as (...a: unknown[]) => Window | null).call(window, url, ...rest);
    }) as typeof window.open;
    return () => { document.removeEventListener("click", onClick, true); window.open = orig; };
  }, [ask, openOut]);

  useEffect(() => {
    if (!pending) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPending(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pending]);

  if (!pending) return null;
  const insecure = pending.protocol === "http:";
  const go = () => { if (remember && pending.protocol !== "mailto:") trust(pending.host); openOut(pending.href); setPending(null); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-6" onClick={() => setPending(null)}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-popover p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warn/15 text-warn"><ShieldAlert className="size-5" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Open this link in your browser?</h2>
            <p className="mt-1 text-xs text-muted-foreground">You are leaving Profileinator. Only open links you trust.</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-card/50 px-3 py-2.5">
          <p className="text-[13px] font-medium">{pending.protocol === "mailto:" ? "Email" : pending.host}</p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{pending.href}</p>
        </div>
        {insecure && <p className="mt-3 flex items-center gap-2 text-xs text-warn"><ShieldAlert className="size-3.5 shrink-0" />This site is not encrypted (http). Do not enter passwords or personal details.</p>}
        {pending.protocol !== "mailto:" && (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
            Don&apos;t ask again for {pending.host}
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Cancel</Button>
          <Button size="sm" autoFocus onClick={go}><ExternalLink className="size-3.5" />Open link</Button>
        </div>
      </div>
    </div>
  );
}
