import { Activity, Brain, FileText, FolderGit2, FolderOpen, GitCommitHorizontal, Home, Link2, Network, Plug, UserRound, type LucideIcon } from "lucide-react";

export type TabKind = "home" | "profile" | "repos" | "commits" | "graph" | "links" | "context" | "integrations" | "resume" | "files" | "activity" | "project";
export type Tab = { id: string; kind: TabKind; title: string; arg?: string; dot?: boolean };

export const KINDS: Record<Exclude<TabKind, "project">, { title: string; icon: LucideIcon }> = {
  home: { title: "Home", icon: Home },
  profile: { title: "Profile", icon: UserRound },
  repos: { title: "Projects", icon: FolderGit2 },
  commits: { title: "Commits", icon: GitCommitHorizontal },
  graph: { title: "Graph", icon: Network },
  links: { title: "Links", icon: Link2 },
  context: { title: "Context", icon: Brain },
  integrations: { title: "Integrations", icon: Plug },
  resume: { title: "Resume", icon: FileText },
  files: { title: "Files", icon: FolderOpen },
  activity: { title: "Activity", icon: Activity },
};

export const tabId = (kind: TabKind, arg?: string) => (arg ? `${kind}:${arg}` : kind);
export const tabTitle = (kind: TabKind, arg?: string) => (kind === "project" ? arg ?? "Project" : KINDS[kind].title);
export const tabIcon = (kind: TabKind): LucideIcon => (kind === "project" ? FolderGit2 : KINDS[kind].icon);
