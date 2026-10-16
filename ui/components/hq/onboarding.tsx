"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { siGithub } from "simple-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/hq";
import { PROMPTS, SETUP_PROMPT } from "@/lib/prompts";

type Status = { installed: boolean; logged_in: boolean; login?: string; name?: string; avatar?: string; hint?: string; code?: string; waiting?: boolean; url?: string };
type Agent = { connected: boolean; lines: string[]; mcp_url: string; command: string };
type Done = { login: string; sync: string; stack: string };

const Github = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d={siGithub.path} /></svg>
);

export const copy = async (text: string, what: string) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error("Copy failed"); }
};

export function PromptList() {
  const [open, setOpen] = useState<string | null>(PROMPTS[0].id);
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {PROMPTS.map((p) => (
        <div key={p.id}>
          <div role="button" tabIndex={0} className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            onClick={() => setOpen(open === p.id ? null : p.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(open === p.id ? null : p.id)}>
            <span><span className="block text-sm font-medium">{p.title}</span><span className="block text-xs text-muted-foreground">{p.when}</span></span>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); copy(p.text, "Prompt"); }}><Copy className="size-3" />Copy</Button>
          </div>
          {open === p.id && <pre className="whitespace-pre-wrap border-t border-border bg-muted/30 px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">{p.text}</pre>}
        </div>
      ))}
    </div>
  );
}

/** First-run screen: one action (GitHub), then the prompt to hand to an agent. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState("");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => { api<Status>("github_status").then(setSt).catch((e) => setErr(e.message)); return stop; }, []);

  // the agent filling in the profile closes this screen by itself
  useEffect(() => {
    const id = setInterval(async () => {
      const me = await api<{ identity?: { headline?: string }; experience?: unknown[]; education?: unknown[]; achievements?: unknown[] }>("get", { path: "me" }).catch(() => null);
      if (me && (me.identity?.headline || me.experience?.length || me.education?.length || me.achievements?.length)) {
        clearInterval(id);
        toast.success("Your agent added your profile");
        onDone();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [onDone]);

  const connectAgent = async () => {
    setAgentBusy(true);
    try { setAgent(await api<Agent>("setup_agent")); } catch (e) { setErr((e as Error).message); }
    setAgentBusy(false);
  };

  const connect = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api<Partial<Done> & Status & { connected?: boolean }>("github_connect");
      if (r.connected) { stop(); setDone(r as Done); }
      else if (r.waiting && r.code) {
        setSt((s) => ({ ...(s as Status), ...r }));
        if (!timer.current) timer.current = setInterval(async () => {
          const s = await api<Status>("github_status").catch(() => null);
          if (!s) { stop(); setBusy(false); setErr("Lost connection to hq. Restart the app and try again."); return; }
          if (s?.logged_in) { stop(); connect(); } else if (s && !s.waiting) { stop(); setSt({ ...s, code: undefined }); setBusy(false); setErr("Sign-in was not completed. Press Connect GitHub to try again."); }
        }, 2500);
        return; // keep the spinner while the browser sign-in finishes
      } else setSt(r);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const waiting = !!st?.code && !st.logged_in;
  return (
    <div className="flex min-h-screen items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Profileinator</h1>
          <p className="mt-1 text-sm text-muted-foreground">One memory of you that every AI agent can read and write. Everything stays on this computer.</p>
        </div>

        {!done ? (
          <div className="rounded-xl border border-border p-5">
            <div className="flex items-center gap-3">
              {st?.avatar ? <img src={st.avatar} alt="" className="size-10 rounded-full" /> : <span className="grid size-10 place-items-center rounded-full bg-muted"><Github className="size-5" /></span>}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{st?.logged_in ? `1. Signed in as ${st.login}` : "1. Connect GitHub"}</p>
                <p className="text-xs text-muted-foreground">{st?.logged_in ? "Found your GitHub CLI login. Import your repos, languages and tech stack." : "Pulls your repos, languages and stack through the GitHub CLI. No token is stored by this app."}</p>
              </div>
              <Button onClick={connect} disabled={busy || !st}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
                {st?.logged_in ? "Import from GitHub" : "Connect GitHub"}
              </Button>
            </div>
            {waiting && (
              <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
                Enter this code on GitHub (a browser tab should have opened):
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-md border border-border bg-background px-3 py-1.5 text-lg font-semibold tracking-widest">{st?.code}</code>
                  <Button variant="outline" size="sm" onClick={() => copy(st!.code!, "Code")}><Copy className="size-3.5" />Copy</Button>
                  <a className="inline-flex items-center gap-1 text-xs underline" href={st?.url} target="_blank" rel="noreferrer">github.com/login/device <ExternalLink className="size-3" /></a>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Waiting for you to approve…</p>
              </div>
            )}
            {st && !st.installed && <p className="mt-3 text-xs text-bad">{st.hint} <a className="underline" href="https://cli.github.com" target="_blank" rel="noreferrer">cli.github.com</a></p>}
            {err && <p className="mt-3 text-xs text-bad">{err}</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-border p-5 text-sm">
            <p className="flex items-center gap-2 font-medium"><Check className="size-4 text-ok" />Imported from {done.login}</p>
            <p className="mt-1 text-xs text-muted-foreground">{done.sync}. {done.stack}</p>
          </div>
        )}

        <div className="rounded-xl border border-border p-5">
          <p className="text-sm font-medium">2. Connect your AI agent</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Installs the skill and registers hq as an MCP server in Claude Code. Using another agent? Use the config below.</p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant={agent?.connected ? "outline" : "default"} onClick={connectAgent} disabled={agentBusy}>
              {agentBusy ? <Loader2 className="size-4 animate-spin" /> : agent?.connected ? <Check className="size-4 text-ok" /> : null}
              {agent?.connected ? "Connected to Claude Code" : "Connect Claude Code"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => copy(JSON.stringify({ mcpServers: { hq: { command: agent?.command ?? "hq", args: ["mcp"] } } }, null, 2), "MCP config")}><Copy className="size-3.5" />Copy MCP config</Button>
            <Button variant="ghost" size="sm" onClick={() => copy("http://127.0.0.1:4777/mcp", "MCP URL")}><Copy className="size-3.5" />Copy MCP URL</Button>
          </div>
          {agent && !agent.connected && <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground">{agent.lines.join(String.fromCharCode(10))}</pre>}
          {agent?.connected && <p className="mt-2 text-xs text-muted-foreground">Start a new Claude Code chat so it loads the tools.</p>}
        </div>

        <div className="rounded-xl border border-border p-5">
          <p className="text-sm font-medium">3. Paste this into your agent</p>
          <p className="mt-0.5 text-xs text-muted-foreground">It interviews you (or imports pasted text) and saves everything. This screen closes by itself when your data arrives.</p>
          <pre className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{SETUP_PROMPT}</pre>
          <Button className="mt-3" onClick={() => copy(SETUP_PROMPT, "Prompt")}><Copy className="size-4" />Copy prompt</Button>
        </div>

        <div className="flex justify-end">
          <Button variant={done ? "default" : "ghost"} onClick={onDone}>{done ? "Open workspace" : "Skip for now"}</Button>
        </div>
      </div>
    </div>
  );
}
