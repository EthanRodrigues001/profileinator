"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type LinkState, type LogEntry, type Me, type Repo } from "@/lib/hq";

export type Data = { me: Me; repos: Repo[]; links: Record<string, LinkState>; log: LogEntry[]; synced?: number };

export function useHQ() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [me, repos, links, log, state] = await Promise.all([
        api<Me>("get", { path: "me" }), api<Repo[]>("repos"), api<Record<string, LinkState>>("links"),
        api<LogEntry[]>("log", { limit: 12 }), api<{ synced?: number }>("get", { path: "state" }).catch(() => ({} as { synced?: number })),
      ]);
      const empty: Me = { identity: {}, links: [], education: [], experience: [], skills: { strong: [], working: [], no_evidence: [] }, answers: {} };
      setData({ me: { ...empty, ...me }, repos, links: links ?? {}, log, synced: state.synced });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const run = useCallback(async (op: string, label: string, args: object = {}) => {
    setBusy(label);
    try {
      const r = await api<unknown>(op, args);
      toast.success(typeof r === "string" ? r : `${label}: done`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(null);
    await reload();
  }, [reload]);

  return { data, error, busy, reload, run };
}
