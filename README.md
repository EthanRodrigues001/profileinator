<p align="center"><img src="ui/public/logo-512.png" width="120" alt="Profileinator logo"></p>

# Profileinator

One place that knows everything about you, for every AI chat and every job application.

- **One file.** Everything lives in a single `profile.json` with typed sections: `me` (identity, links, experience, skills, form answers), `projects` (your GitHub repos plus what you add), `state` (link checks, last sync) and `log` (decisions your AI should remember). Run `hq where` to see the path. It is stored in your OS config folder, never in the repo.
- **MCP server.** Claude, GPT or any MCP client can read and update the profile, autofill forms, and tell you what is missing.
- **GitHub, no tokens.** `hq sync` uses your existing `gh` login to list every repo and its languages. Pin the ones that belong on a resume.
- **Link checker.** `hq check_links` tests every profile and pinned-project URL.
- **Dashboard.** A Next.js + shadcn UI, served by the same Rust binary, optionally wrapped as a native window with Tauri.

## Layout

| Folder | What |
| --- | --- |
| `hq/` | Rust core: CLI, MCP server (stdio) and local API |
| `ui/` | Next.js + shadcn dashboard (static export) |
| `desktop/` | Tauri shell that starts `hq` and opens the dashboard in a native window |
| `skills/` | Skill file that teaches an AI how to use the tools |
| `examples/` | MCP client config |

## Install

One line, then everything is connected (skill, MCP server, dashboard):

```powershell
# Windows
irm https://raw.githubusercontent.com/EthanRodrigues001/profileinator/main/install.ps1 | iex
```
```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/EthanRodrigues001/profileinator/main/install.sh | sh
```

Or download the archive for your platform from Releases (`hq` binary, `ui/` dashboard, `skills/`), unpack it and run:

```bash
./hq setup     # installs the Claude Code skill, registers the MCP server, creates your profile
./hq ui        # opens the dashboard at http://127.0.0.1:4777
```

The welcome screen then walks you through three steps: connect GitHub, connect your agent (one button), paste one prompt. It closes by itself as soon as your agent saves data.

Other MCP clients (Cursor, Claude Desktop...): `hq setup` prints the stdio config to paste, or copy `examples/mcp.json` and set the real path to `hq`. Clients that take a URL can use `http://127.0.0.1:4777/mcp` while `hq ui` is running (local only).

Requirements: nothing for the core. The [GitHub CLI](https://cli.github.com) (`gh`) is needed only for the GitHub import. The first semantic search downloads a 30 MB model once; set `HQ_SEMANTIC=off` to skip it.

Build from source: see [CONTRIBUTING.md](CONTRIBUTING.md). A native window is optional: `cd desktop && npm i && npm run build`, then copy `hq` next to `src-tauri/target/release/profileinator`.

## First run

The dashboard opens on a welcome screen with three steps:

1. **GitHub.** Already signed in with `gh`? One click imports your name, bio, link, every repo, languages and an evidence-based tech stack. Not signed in? **Connect GitHub** starts the browser sign-in and shows the one-time code; the import runs when you approve.
2. **Agent.** **Connect Claude Code** installs the skill and registers the MCP server. Other agents: copy the MCP config or URL.
3. **Prompt.** Copy one prompt into your agent. It interviews you or imports pasted resume/LinkedIn text, and saves everything with validated, undoable tools. The welcome screen closes by itself when the first data arrives.

## Agent tools

`brief`, `onboarding`, `ask`, `graph_neighbors`, `graph_path`, `graph_explain`, `graph_stats` read; `set_identity`, `add_link`, `add_experience`, `add_education`, `add_achievement`, `add_tech`, `add_claim_gap`, `add_skill`, `add_project`, `update_project`, `set_positioning`, `set_answer`, `note` write; `github_status`, `github_connect`, `sync`, `scan_stack`, `commits`, `check_links` use the network; `undo`, `history` recover; `get`, `set`, `append`, `del` are the escape hatch for anything else.

## Privacy

Everything lives in one JSON file in your OS config folder (`hq where`). The only network calls are the ones you trigger: `gh` for GitHub, link checks, and the one-time model download. No telemetry, no tokens stored.

## How the memory works

- **One file, one graph.** `profile.json` is the only store. The knowledge graph (people, roles, schools, projects, technologies, claims, decisions and the edges between them) is rebuilt from it on every call, so it can never drift from the data. Edges are marked `stated` (written in the data) or `derived` (inferred by matching names).
- **Semantic retrieval, locally.** `ask` fuses keyword search (with a small thesaurus) and local semantic search, then widens along graph edges. Embeddings are static Model2Vec vectors (`potion-base-8M`, about 30 MB, downloaded once from Hugging Face and cached, nothing leaves your machine afterwards). If the model can't load, it falls back to keyword search. Build with `--no-default-features` to drop it. Vectors are cached in `profile.index.json` next to your profile; delete it any time.
- **Traversal.** `graph_neighbors`, `graph_path` and `graph_explain` walk the graph. The Graph page in the app draws it.
- **Safe writes.** Typed `add_*` tools validate input. Every write is recorded, so `undo` reverses it. A lock file makes the app and any number of MCP clients safe to write at the same time.

## Plans

LinkedIn import from the official data export, resume rendering, portfolio push. LinkedIn has no public API, so only the export file is used.

MIT licensed.
