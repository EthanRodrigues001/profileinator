---
name: profileinator
description: Read or update everything known about the user (identity, roles, education, projects, technologies, achievements, claims, answers, decisions) through the hq MCP server. Use for any resume, LinkedIn, portfolio, cover letter, interview prep or job-application task.
---

The `hq` MCP server holds one knowledge graph about the user, built from a single `profile.json`. Use its tools instead of asking the user to repeat themselves or reading markdown files.

0. **New or empty profile?** If `brief` says the profile is empty or incomplete, call `onboarding` and follow it: it lists what is missing, the exact questions to ask the user (one section at a time) and the tool that stores each answer. Never invent facts. Typical order: `set_identity`, `add_link`, `sync`, `scan_stack`, `add_experience`, `add_education`, `add_achievement`, `pin`, `set_positioning`, `add_skill`, `set_answer`. Call `onboarding` again after each section.
1. **Start with `brief`.** It is a compact overview (about 1.4k tokens). `brief` with `full=true` returns the complete dossier in one call (about 3k tokens): use it when you know nothing about the user.
2. **Answer questions with `ask`.** It combines keywords, synonyms and local semantic search, then widens along graph edges ("backend experience", "who did I mentor", "anything with Rust"). Ids in the result look like `tech:nextjs`.
   - Dig with `graph_neighbors` (what connects to X), `graph_path` (how X relates to Y) and `graph_explain` (all facts about X, plus where it is stored).
   - `search` is only for exact path or text lookups.
   - If `ask` says no match, the fact is probably not stored. Say so; don't guess.
3. **Store facts the user confirmed.** Prefer the typed tools, which validate input: `add_experience`, `add_education`, `add_achievement`, `add_tech`, `add_claim_gap`, `add_project`, `update_project`. Dates are `YYYY-MM`, `YYYY` or `Present`. For anything else use `set` or `append` under `me/...` or `projects/...`. The graph is rebuilt on every call, so new facts are searchable immediately.
4. **Made a mistake?** `history` shows recent writes, `undo` reverses them (n at a time).
5. **Forms.** `autofill`, then ask the user about everything in `missing` and store the answers under `me/answers/<key>`.
6. **Projects.** `github_status` / `github_connect` detect the user's `gh` login and import everything (profile link, repos, tech stack); `sync` refreshes repos, `pin` marks resume picks, `commits` shows history. Use `update_project` for `tagline`, `summary`, `bullets`, `stack` and `pinned` on a repo, and `add_project` for work that is not on GitHub.
7. **Record decisions and preferences with `note`** so the next chat doesn't ask again.
8. **Never claim** anything listed under claim gaps, avoid, or skills with no evidence. Check `ask "what should I not claim"` before writing a resume.
9. Run `check_links` after links change and never use links that are dead or down.
