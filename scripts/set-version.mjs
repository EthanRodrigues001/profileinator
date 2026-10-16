// Release helper: stamp one version (from the git tag) into every manifest so the app, hq and the updater agree.
import { readFileSync, writeFileSync } from "node:fs";
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) { console.error("usage: set-version.mjs 1.2.3"); process.exit(1); }
const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
for (const f of ["hq/Cargo.toml", "desktop/src-tauri/Cargo.toml"]) edit(f, (t) => t.replace(/^version = ".*"$/m, `version = "${v}"`));
edit("desktop/src-tauri/tauri.conf.json", (t) => t.replace(/"version": ".*?"/, `"version": "${v}"`));
console.log("version set to", v);
