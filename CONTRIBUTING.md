# Contributing

Profileinator is a Rust core (`hq/`) plus a static Next.js dashboard (`ui/`). Issues and pull requests are welcome.

## Build

```bash
cargo build --release --manifest-path hq/Cargo.toml   # CLI, MCP server, local API
cd ui && npm ci && npm run build                      # dashboard -> ui/out
./hq/target/release/hq ui                             # http://127.0.0.1:4777
```

Use a throwaway profile while developing so you never touch your real one:

```bash
HQ_DATA=/tmp/hq-dev ./hq/target/release/hq init
```

## Ground rules

- **One op table.** Every capability is an entry in `call()` in `hq/src/main.rs`; the CLI, the MCP server and the HTTP API all use it. New writers go in `fill.rs` (or next to `add_entry`), must validate input, and must be covered by undo in `store.rs` (`history_pre`).
- **Facts are never invented.** Tools return what is missing instead of guessing; keep it that way.
- **No personal data in the repo.** Examples and tests use made-up people. (The screenshots in `docs/` are the maintainer's own profile, shared on purpose.)
- **Charts** use the Evil Charts components in `ui/components/evilcharts`; tables use `ui/components/kit/data-table.tsx`.
- Run `npx tsc --noEmit` in `ui/` and `cargo build` before opening a pull request.

## Releases and auto-update

Pushing a tag such as `v0.2.0` runs `.github/workflows/release.yml`: it stamps the tag into every manifest (`scripts/set-version.mjs`), builds the installers, and publishes `latest.json` with signatures. Installed desktop apps check that file and show an "Update & restart" banner; the browser and CLI builds show a "Download" link instead.

Updates are verified with a minisign key pair. The public key is in `desktop/src-tauri/tauri.conf.json`; the private key must be stored as the repository secret `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has a password). Forks need their own pair: `npx tauri signer generate -w ~/.tauri/profileinator.key`, then replace `pubkey` and the update endpoint. Keep the private key safe: without it nobody can receive updates.
