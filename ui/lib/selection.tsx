"use client";
import { createContext, useContext, useMemo, useState } from "react";

/** What the user last picked on a page. The inspector rail shows details for it. */
export type Selection =
  | { kind: "project"; name: string }
  | { kind: "link"; url: string; name: string }
  | { kind: "commit"; repo: string; sha: string; msg?: string; url?: string }
  | { kind: "file"; id: string }
  | { kind: "log"; ts: number }
  | null;

type Ctx = { sel: Selection; setSel: (s: Selection) => void };
const C = createContext<Ctx>({ sel: null, setSel: () => {} });

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [sel, setSel] = useState<Selection>(null);
  const v = useMemo(() => ({ sel, setSel }), [sel]);
  return <C.Provider value={v}>{children}</C.Provider>;
}

export const useSelection = () => useContext(C);
