//! Everything a brand-new user needs to get a complete profile without hand-writing JSON:
//! typed setters that validate, a stack scan that derives technologies from the user's own repos,
//! and an onboarding checklist that tells an agent what is missing and what to ask.
use crate::store::*;
use serde_json::{json, Map, Value};
use std::process::Command;

type R = Result<Value, String>;

fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

// ---------------------------------------------------------------- typed setters
/// Merge identity fields. Unknown keys are rejected so a typo can't silently create a field nobody reads.
pub fn set_identity(a: &Value) -> R {
    const KEYS: [&str; 8] = ["name", "legal_name", "pronouns", "location", "email", "phone", "headline", "summary"];
    let given: Vec<&str> = KEYS.iter().copied().filter(|k| a.get(*k).is_some_and(|v| !v.is_null())).collect();
    if given.is_empty() {
        return Err(format!("pass at least one of: {}", KEYS.join(", ")));
    }
    if let Some(e) = a["email"].as_str() {
        if !e.contains('@') || !e.contains('.') {
            return Err(format!("email “{e}” does not look like an email address"));
        }
    }
    if let Some(p) = a["phone"].as_str() {
        if p.chars().filter(char::is_ascii_digit).count() < 7 {
            return Err(format!("phone “{p}” needs at least 7 digits"));
        }
    }
    locked(|| {
        let mut me = load("me");
        for k in &given {
            me["identity"][*k] = json!(s(a, k).trim());
        }
        save("me", &me)
    })?;
    Ok(json!(format!("identity updated: {}", given.join(", "))))
}

/// Add or update a link by id. The URL must be http(s) or mailto so broken pastes are caught here, not at link-check time.
pub fn add_link(a: &Value) -> R {
    let (id, label, url) = (norm(s(a, "id")), s(a, "label"), s(a, "url").trim());
    if id.is_empty() || label.is_empty() {
        return Err("id and label are required (id like github, linkedin, portfolio)".into());
    }
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")) {
        return Err(format!("url “{url}” must start with https://, http:// or mailto:"));
    }
    locked(|| {
        let mut me = load("me");
        let mut entry = json!({"id": id, "label": label, "url": url});
        for k in ["resume", "note"] {
            if let Some(v) = a.get(k).filter(|v| !v.is_null()) { entry[k] = v.clone(); }
        }
        if !me["links"].is_array() { me["links"] = json!([]); }
        let links = me["links"].as_array_mut().unwrap();
        match links.iter().position(|l| s(l, "id") == id) {
            Some(i) => { let old = links[i].clone(); links[i] = old; for (k, v) in entry.as_object().unwrap() { links[i][k] = v.clone(); } }
            None => links.push(entry),
        }
        save("me", &me)
    })?;
    Ok(json!(format!("link {id} saved")))
}

/// Store one standard application answer (notice period, expected salary, work authorization...).
pub fn set_answer(a: &Value) -> R {
    let key = s(a, "key");
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("key must be snake_case, e.g. notice_period".into());
    }
    let v = a.get("value").cloned().ok_or("value is required (use null to mark it unanswered)")?;
    locked(|| {
        let mut me = load("me");
        me["answers"][key] = v;
        save("me", &me)
    })?;
    Ok(json!(format!("answer {key} saved")))
}

pub fn add_skill(a: &Value) -> R {
    let (group, name) = (s(a, "group"), s(a, "name").trim());
    if !["strong", "working", "no_evidence"].contains(&group) {
        return Err("group must be one of: strong, working, no_evidence".into());
    }
    if name.is_empty() {
        return Err("name is required".into());
    }
    locked(|| {
        let mut me = load("me");
        if !me["skills"][group].is_array() { me["skills"][group] = json!([]); }
        let list = me["skills"][group].as_array_mut().unwrap();
        if list.iter().any(|x| x.as_str().is_some_and(|y| norm(y) == norm(name))) {
            return Err(format!("{name} is already in {group}"));
        }
        list.push(json!(name));
        save("me", &me)
    })?;
    Ok(json!(format!("{name} added to {group}")))
}

/// Direction, headline and summary variants, things to avoid, and the honest skill order. Present keys replace, absent keys stay.
pub fn set_positioning(a: &Value) -> R {
    let mut changed = vec![];
    locked(|| {
        let mut me = load("me");
        if !me["positioning"].is_object() { me["positioning"] = json!({}); }
        if let Some(d) = a["direction"].as_str() { me["positioning"]["direction"] = json!(d); changed.push("direction"); }
        for k in ["headlines", "summaries"] {
            if let Some(v) = a[k].as_array() {
                if v.iter().any(|x| s(x, "label").is_empty() || s(x, "text").is_empty()) {
                    return Err(format!("every item in {k} needs a label and a text"));
                }
                me["positioning"][k] = json!(v);
                changed.push(k);
            }
        }
        for k in ["avoid", "skill_order"] {
            if let Some(v) = a[k].as_array() {
                me["positioning"][k] = json!(v.iter().filter_map(Value::as_str).collect::<Vec<_>>());
                changed.push(k);
            }
        }
        if changed.is_empty() { return Err("pass at least one of: direction, headlines, summaries, avoid, skill_order".into()); }
        if let Some(d) = a["direction"].as_str() { me["target"] = json!(d); }
        save("me", &me)
    })?;
    Ok(json!(format!("positioning updated: {}", changed.join(", "))))
}

// ---------------------------------------------------------------- stack scan
/// (package name or scope prefix ending in "/", technology, area). Only names that say something about skill are listed.
const DEPS: &[(&str, &str, &str)] = &[
    ("react", "React", "Frontend & UI"), ("next", "Next.js", "Frontend & UI"), ("vue", "Vue", "Frontend & UI"), ("nuxt", "Nuxt", "Frontend & UI"),
    ("svelte", "Svelte", "Frontend & UI"), ("@angular/", "Angular", "Frontend & UI"), ("solid-js", "Solid", "Frontend & UI"), ("astro", "Astro", "Frontend & UI"),
    ("tailwindcss", "Tailwind CSS", "Frontend & UI"), ("@radix-ui/", "Radix UI", "Frontend & UI"), ("@base-ui/", "Base UI", "Frontend & UI"),
    ("@base-ui-components/", "Base UI", "Frontend & UI"), ("@mui/", "Material UI", "Frontend & UI"), ("@chakra-ui/", "Chakra UI", "Frontend & UI"),
    ("framer-motion", "Framer Motion / Motion", "Frontend & UI"), ("motion", "Framer Motion / Motion", "Frontend & UI"), ("gsap", "GSAP", "Frontend & UI"),
    ("three", "Three.js / R3F", "Frontend & UI"), ("@react-three/", "Three.js / R3F", "Frontend & UI"), ("recharts", "Recharts", "Frontend & UI"),
    ("d3", "D3", "Frontend & UI"), ("zustand", "Zustand", "Frontend & UI"), ("redux", "Redux", "Frontend & UI"), ("@reduxjs/toolkit", "Redux", "Frontend & UI"),
    ("@tanstack/react-query", "TanStack Query", "Frontend & UI"), ("react-hook-form", "React Hook Form", "Frontend & UI"), ("zod", "Zod", "Frontend & UI"),
    ("@dnd-kit/", "dnd-kit", "Frontend & UI"), ("@xyflow/react", "React Flow (xyflow)", "Frontend & UI"), ("reactflow", "React Flow (xyflow)", "Frontend & UI"),
    ("@tiptap/", "TipTap editor", "Frontend & UI"), ("lexical", "Lexical", "Frontend & UI"), ("@codemirror/", "CodeMirror / Monaco", "Frontend & UI"),
    ("monaco-editor", "CodeMirror / Monaco", "Frontend & UI"), ("@monaco-editor/react", "CodeMirror / Monaco", "Frontend & UI"), ("mermaid", "Mermaid", "Frontend & UI"),
    ("pixi.js", "PixiJS / Konva", "Frontend & UI"), ("konva", "PixiJS / Konva", "Frontend & UI"), ("jspdf", "jsPDF / PDF", "Frontend & UI"),
    ("express", "Express", "Backend, data & auth"), ("fastify", "Fastify", "Backend, data & auth"), ("hono", "Hono", "Backend, data & auth"), ("@nestjs/", "NestJS", "Backend, data & auth"),
    ("drizzle-orm", "Drizzle ORM", "Backend, data & auth"), ("prisma", "Prisma", "Backend, data & auth"), ("@prisma/client", "Prisma", "Backend, data & auth"),
    ("mongoose", "MongoDB / Mongoose", "Backend, data & auth"), ("mongodb", "MongoDB / Mongoose", "Backend, data & auth"), ("pg", "Postgres", "Backend, data & auth"),
    ("postgres", "Postgres", "Backend, data & auth"), ("@neondatabase/", "Neon Postgres", "Backend, data & auth"), ("firebase", "Firebase", "Backend, data & auth"),
    ("firebase-admin", "Firebase", "Backend, data & auth"), ("@supabase/", "Supabase", "Backend, data & auth"), ("appwrite", "Appwrite", "Backend, data & auth"),
    ("node-appwrite", "Appwrite", "Backend, data & auth"), ("next-auth", "NextAuth / Better Auth", "Backend, data & auth"), ("better-auth", "NextAuth / Better Auth", "Backend, data & auth"),
    ("@clerk/", "Clerk", "Backend, data & auth"), ("passport", "Passport auth", "Backend, data & auth"), ("socket.io", "Socket.IO", "Backend, data & auth"),
    ("redis", "Redis", "Backend, data & auth"), ("ioredis", "Redis", "Backend, data & auth"), ("@upstash/redis", "Redis", "Backend, data & auth"),
    ("nodemailer", "Nodemailer", "Backend, data & auth"), ("stripe", "Stripe", "Backend, data & auth"), ("uploadthing", "UploadThing", "Backend, data & auth"),
    ("@aws-sdk/", "AWS SDK", "Backend, data & auth"), ("fastapi", "FastAPI", "Backend, data & auth"), ("flask", "Flask", "Backend, data & auth"), ("django", "Django", "Backend, data & auth"),
    ("sqlalchemy", "SQLAlchemy", "Backend, data & auth"), ("axum", "Axum", "Backend, data & auth"), ("actix-web", "Actix", "Backend, data & auth"), ("tokio", "Tokio", "Backend, data & auth"),
    ("ai", "Vercel AI SDK", "AI / ML"), ("@ai-sdk/", "Vercel AI SDK", "AI / ML"), ("@google/generative-ai", "Google Gemini API", "AI / ML"), ("@google/genai", "Google Gemini API", "AI / ML"),
    ("openai", "OpenAI API", "AI / ML"), ("@anthropic-ai/sdk", "Anthropic API", "AI / ML"), ("langchain", "LangChain", "AI / ML"), ("@langchain/", "LangChain", "AI / ML"),
    ("@modelcontextprotocol/sdk", "MCP", "AI / ML"), ("scikit-learn", "scikit-learn", "AI / ML"), ("sklearn", "scikit-learn", "AI / ML"), ("pandas", "pandas / NumPy", "AI / ML"),
    ("numpy", "pandas / NumPy", "AI / ML"), ("torch", "PyTorch / Keras", "AI / ML"), ("keras", "PyTorch / Keras", "AI / ML"), ("tensorflow", "TensorFlow", "AI / ML"),
    ("xgboost", "XGBoost", "AI / ML"), ("transformers", "Hugging Face", "AI / ML"), ("streamlit", "Streamlit", "AI / ML"), ("shap", "SHAP / LIME (XAI)", "AI / ML"),
    ("lime", "SHAP / LIME (XAI)", "AI / ML"), ("crawl4ai", "Crawl4AI / Playwright", "AI / ML"),
    ("expo", "Expo", "Mobile, desktop & extensions"), ("react-native", "React Native", "Mobile, desktop & extensions"), ("nativewind", "NativeWind", "Mobile, desktop & extensions"),
    ("@tauri-apps/", "Tauri (Rust)", "Mobile, desktop & extensions"), ("tauri", "Tauri (Rust)", "Mobile, desktop & extensions"), ("electron", "Electron", "Mobile, desktop & extensions"),
    ("wxt", "WXT (browser ext.)", "Mobile, desktop & extensions"), ("flutter", "Flutter", "Mobile, desktop & extensions"),
    ("vite", "Vite", "Tooling & testing"), ("vitest", "Vitest / Testing Library", "Tooling & testing"), ("jest", "Jest", "Tooling & testing"),
    ("@testing-library/", "Vitest / Testing Library", "Tooling & testing"), ("playwright", "Playwright", "Tooling & testing"), ("@playwright/test", "Playwright", "Tooling & testing"),
    ("cypress", "Cypress", "Tooling & testing"), ("eslint", "Biome / ESLint", "Tooling & testing"), ("@biomejs/biome", "Biome / ESLint", "Tooling & testing"),
    ("turbo", "Turborepo", "Tooling & testing"), ("pytest", "pytest", "Tooling & testing"),
];

fn tech_for(dep: &str) -> Option<(&'static str, &'static str)> {
    let d = dep.to_lowercase();
    DEPS.iter().find(|(k, _, _)| if k.ends_with('/') { d.starts_with(k) } else { d == *k }).map(|(_, t, c)| (*t, *c))
}

fn fetch_file(owner: &str, repo: &str, file: &str) -> Option<String> {
    let out = Command::new("gh").args(["api", "-H", "Accept: application/vnd.github.raw+json", &format!("repos/{owner}/{repo}/contents/{file}")]).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

const MANIFESTS: [&str; 4] = ["package.json", "requirements.txt", "Cargo.toml", "pyproject.toml"];
const SKIP_DIRS: [&str; 14] = ["node_modules", "dist", "build", "public", "docs", "doc", "assets", "static", "test", "tests", "examples", "scripts", "vendor", "target"];

/// (type, name) of everything directly inside a repo folder.
fn list_dir(owner: &str, repo: &str, dir: &str) -> Vec<(String, String)> {
    let path = if dir.is_empty() { format!("repos/{owner}/{repo}/contents") } else { format!("repos/{owner}/{repo}/contents/{dir}") };
    Command::new("gh").args(["api", &path, "-q", r#".[] | .type + " " + .name"#]).output().ok().filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| l.split_once(' ').map(|(t, n)| (t.to_string(), n.to_string()))).collect()).unwrap_or_default()
}

/// Technologies a repo declares: manifests at the top level plus one folder down (monorepos, src-tauri/, backend/ ...).
fn repo_techs(owner: &str, repo: &str) -> Vec<(&'static str, &'static str)> {
    let mut found: Vec<(&'static str, &'static str)> = vec![];
    let mut read = |dir: &str, names: &[(String, String)]| {
        for (t, n) in names {
            if t == "file" && MANIFESTS.contains(&n.as_str()) {
                let path = if dir.is_empty() { n.clone() } else { format!("{dir}/{n}") };
                if let Some(body) = fetch_file(owner, repo, &path) {
                    found.extend(deps_in(n, &body).iter().filter_map(|d| tech_for(d)));
                }
            }
        }
    };
    let root = list_dir(owner, repo, "");
    read("", &root);
    for (t, n) in root.iter().filter(|(t, n)| t == "dir" && !n.starts_with('.') && !SKIP_DIRS.contains(&n.as_str())).take(12) {
        let _ = t;
        let inner = list_dir(owner, repo, n);
        read(n, &inner);
    }
    found.sort_unstable();
    found.dedup();
    found
}

/// Names of declared dependencies in a manifest, by file type.
fn deps_in(file: &str, body: &str) -> Vec<String> {
    match file {
        "package.json" => {
            let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            ["dependencies", "devDependencies", "peerDependencies"].iter().flat_map(|k| v[*k].as_object().map(|m| m.keys().cloned().collect::<Vec<_>>()).unwrap_or_default()).collect()
        }
        "requirements.txt" => body.lines().filter_map(|l| {
            let l = l.trim();
            if l.is_empty() || l.starts_with('#') || l.starts_with('-') { return None; }
            Some(l.split(['=', '<', '>', '~', '!', '[', ';', ' ']).next().unwrap_or("").to_lowercase())
        }).collect(),
        "pyproject.toml" => {
            // PEP 621 `dependencies = ["name>=1", ...]` and Poetry `[tool.poetry.dependencies] name = "^1"`
            let (mut in_list, mut in_table) = (false, false);
            let name = |s: &str| s.trim().trim_matches(|c| c == '"' || c == '\'' || c == ',').split(['=', '<', '>', '~', '!', '[', ';', ' ', '^']).next().unwrap_or("").to_lowercase();
            body.lines().filter_map(|l| {
                let l = l.trim();
                if l.starts_with('[') && !l.starts_with("[\"") { in_table = l.contains("dependencies"); in_list = false; return None; }
                if l.starts_with("dependencies") && l.contains('[') { in_list = !l.contains(']'); return None; }
                if in_list { if l.starts_with(']') { in_list = false; return None; } return Some(name(l)); }
                (in_table && l.contains('=')).then(|| name(l.split('=').next().unwrap_or("")))
            }).filter(|n| !n.is_empty()).collect()
        }
        _ => {
            // Cargo.toml: names on the left of `=` inside any [*dependencies] table
            let mut inside = false;
            body.lines().filter_map(|l| {
                let l = l.trim();
                if l.starts_with('[') { inside = l.contains("dependencies"); return None; }
                (inside && l.contains('=')).then(|| l.split('=').next().unwrap_or("").trim().trim_matches('"').to_string())
            }).collect()
        }
    }
}

fn tier(count: usize, recent: bool) -> &'static str {
    if !recent { "Past" } else if count >= 15 { "Core" } else if count >= 5 { "Regular" } else if count >= 2 { "Working" } else { "Tried" }
}

/// Read dependency manifests from every non-fork repo (package.json, requirements.txt, Cargo.toml) and language bytes from the
/// synced data, and upsert an evidence-based stack: how many projects use each technology, first and last use, and a tier.
pub fn scan_stack() -> R {
    let owner = crate::owner()?;
    let projects = load("projects");
    let repos: Vec<(String, Value)> = projects.as_object().into_iter().flatten().filter(|(_, p)| p["fork"] != true && !s(p, "url").is_empty()).map(|(n, p)| (n.clone(), p.clone())).collect();
    if repos.is_empty() {
        return Err("no synced repositories yet: run `sync` first".into());
    }
    // gh calls happen outside the lock; six repos at a time
    let mut found: Vec<(String, Vec<(&'static str, &'static str)>)> = vec![];
    for chunk in repos.chunks(6) {
        let res: Vec<(String, Vec<(&'static str, &'static str)>)> = std::thread::scope(|sc| {
            let hs: Vec<_> = chunk.iter().map(|(n, _)| (n.clone(), sc.spawn(|| {
                repo_techs(&owner, n)
            }))).collect();
            hs.into_iter().map(|(n, h)| (n, h.join().unwrap_or_default())).collect()
        });
        found.extend(res);
    }

    struct Acc { cat: String, repos: Vec<(String, String, String)>, share: Option<f64> }
    let mut acc: std::collections::BTreeMap<String, Acc> = Default::default();
    let key = |n: &str| n.to_string();
    for (repo, techs) in &found {
        let p = &projects[repo];
        for (t, c) in techs {
            acc.entry(key(t)).or_insert_with(|| Acc { cat: c.to_string(), repos: vec![], share: None }).repos.push((repo.clone(), s(p, "created").into(), s(p, "pushed").into()));
        }
    }
    // languages by bytes, and by how many repos contain them
    let total: f64 = repos.iter().flat_map(|(_, p)| p["langs"].as_object().into_iter().flatten().filter_map(|(_, v)| v.as_f64())).sum();
    let mut lang_bytes: std::collections::BTreeMap<String, f64> = Default::default();
    for (repo, p) in &repos {
        for (l, v) in p["langs"].as_object().into_iter().flatten() {
            let e = acc.entry(l.clone()).or_insert_with(|| Acc { cat: "Languages".into(), repos: vec![], share: None });
            if e.cat == "Languages" { e.repos.push((repo.clone(), s(p, "created").into(), s(p, "pushed").into())); }
            *lang_bytes.entry(l.clone()).or_default() += v.as_f64().unwrap_or(0.0);
        }
    }
    for (l, b) in &lang_bytes {
        if let Some(e) = acc.get_mut(l) { if e.cat == "Languages" && total > 0.0 { e.share = Some(b / total * 100.0); } }
    }

    let cutoff = ymd(now().saturating_sub(365 * 86400));
    let entries: Vec<Value> = acc.iter().filter(|(_, a)| !a.repos.is_empty()).map(|(name, a)| {
        let mut r = a.repos.clone();
        r.sort_by(|x, y| y.2.cmp(&x.2));
        let last = r.first().map(|x| x.2.get(..10).unwrap_or("").to_string()).unwrap_or_default();
        let first = r.iter().map(|x| x.1.get(..10).unwrap_or("").to_string()).filter(|x| !x.is_empty()).min().unwrap_or_default();
        let mut e = json!({"name": name, "category": a.cat, "tier": tier(r.len(), last.as_str() >= cutoff.as_str()), "projects": r.len(), "first_seen": first, "last_used": last,
                           "recent": r.iter().take(3).map(|x| x.0.clone()).collect::<Vec<_>>(), "source": "scan"});
        if let Some(sh) = a.share { e["note"] = json!(format!("{sh:.1}% of code bytes")); }
        e
    }).collect();

    let n = entries.len();
    locked(|| {
        // per-project detected stack, shown on each project page until the user sets one by hand
        let mut p = load("projects");
        for (repo, techs) in &found {
            if let Some(e) = p.get_mut(repo) {
                e["detected"] = json!(techs.iter().map(|(n, c)| json!({"name": n, "category": c})).collect::<Vec<_>>());
            }
        }
        save("projects", &p)?;
        let mut me = load("me");
        let mut stack = me["stack"].as_array().cloned().unwrap_or_default();
        for e in entries {
            match stack.iter().position(|x| norm(s(x, "name")) == norm(s(&e, "name")) && s(x, "category") == s(&e, "category")) {
                Some(i) => { for (k, v) in e.as_object().unwrap() { if !(k == "note" && !s(&stack[i], "note").is_empty() && v.as_str().is_some_and(|t| t.contains("code bytes"))) { stack[i][k] = v.clone(); } } }
                None => stack.push(e),
            }
        }
        me["stack"] = json!(stack);
        save("me", &me)
    })?;
    let core: Vec<String> = acc.iter().filter(|(_, a)| a.repos.len() >= 15).map(|(k, _)| k.clone()).take(10).collect();
    Ok(json!(format!("scanned {} repos, {n} technologies written to me/stack. Core: {}", found.len(), core.join(", "))))
}

/// Everything an agent needs to describe one repo truthfully: description, languages, detected stack, top-level files and the README.
pub fn repo_context(a: &Value) -> R {
    let name = s(a, "repo");
    let p = load("projects");
    let proj = p.get(name).ok_or_else(|| format!("unknown repo {name} (run sync first)"))?;
    if !proj["url"].is_string() {
        return Ok(json!({"name": name, "local_only": true, "project": proj,
            "note": "Not on GitHub, so there is no README or manifest to read here. Use local_path (if set) to inspect the folder yourself, then store what you confirm with update_project."}));
    }
    let owner = crate::owner()?;
    let techs = repo_techs(&owner, name);
    let files = Command::new("gh").args(["api", &format!("repos/{owner}/{name}/contents"), "-q", ".[].name"]).output().ok()
        .filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).lines().take(40).collect::<Vec<_>>().join(", ")).unwrap_or_default();
    let readme = Command::new("gh").args(["api", "-H", "Accept: application/vnd.github.raw+json", &format!("repos/{owner}/{name}/readme")]).output().ok()
        .filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).chars().take(3500).collect::<String>()).unwrap_or_default();
    let total: f64 = proj["langs"].as_object().into_iter().flatten().filter_map(|(_, v)| v.as_f64()).sum();
    let langs = proj["langs"].as_object().into_iter().flatten().filter_map(|(k, v)| v.as_f64().map(|b| (k.clone(), b / total.max(1.0) * 100.0))).map(|(k, v)| format!("{k} {v:.0}%")).collect::<Vec<_>>().join(", ");
    Ok(json!(format!(
        "# {name}

description: {}
homepage: {}
stars: {} · private: {} · fork: {}
languages: {langs}
topics: {}
detected stack: {}
top-level files: {files}
current tagline: {}
current bullets: {}

## README (first 3500 chars)
{readme}

Next: write a one-line tagline and 2-3 outcome bullets using only what is shown, then call update_project {{name, tagline, bullets[], stack[]}}.",
        s(proj, "desc"), s(proj, "homepage"), proj["stars"], proj["private"], proj["fork"],
        arr(&proj["topics"]).iter().filter_map(|t| t.as_str()).collect::<Vec<_>>().join(", "),
        techs.iter().map(|(n, _)| *n).collect::<Vec<_>>().join(", "),
        s(proj, "tagline"), arr(&proj["bullets"]).iter().filter_map(|b| b.as_str()).collect::<Vec<_>>().join(" | "))))
}

// ---------------------------------------------------------------- onboarding
/// A checklist for an agent (or a person) setting up a profile from nothing: what is done, what is missing, what to ask, which tool to call.
pub fn onboarding() -> String {
    let me = load("me");
    let projects = load("projects");
    let id = &me["identity"];
    let n_proj = projects.as_object().map_or(0, |m| m.len());
    let pinned: Vec<(&String, &Value)> = projects.as_object().into_iter().flatten().filter(|(_, p)| p["pinned"] == true).collect();
    let stack = me["stack"].as_array().cloned().unwrap_or_default();
    let missing_id: Vec<&str> = ["name", "email", "phone", "location", "headline", "summary"].into_iter().filter(|k| s(id, k).is_empty()).collect();
    // the standard questions stay on the list even if someone deleted the key; extra keys count once they exist
    let mut unanswered: Vec<String> = ["work_authorization", "notice_period", "expected_salary", "willing_to_relocate", "earliest_start_date"].iter()
        .filter(|k| me["answers"].get(**k).map_or(true, |v| v.is_null() || v.as_str() == Some(""))).map(|k| k.to_string()).collect();
    for (k, v) in me["answers"].as_object().into_iter().flatten() {
        if (v.is_null() || v.as_str() == Some("")) && !unanswered.contains(k) { unanswered.push(k.clone()); }
    }
    let has = |name: &str| arr(&me["links"]).iter().any(|l| s(l, "id") == name);
    let checked = load("state")["links"].as_object().is_some_and(|m| !m.is_empty());
    let gh_login = load("state")["owner"].as_str().map(String::from);

    // skills claimed with nothing in the scanned stack behind them
    let evidence: Vec<String> = stack.iter().map(|x| norm(s(x, "name"))).collect();
    let unproven: Vec<String> = if stack.is_empty() { vec![] } else { ["strong", "working"].iter().flat_map(|g| arr(&me["skills"][*g]).iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>()).filter(|sk| {
        let k = norm(sk.split(['(', '/', '+']).next().unwrap_or(sk));
        !k.is_empty() && !evidence.iter().any(|e| e.contains(&k) || k.contains(e.as_str()))
    }).collect() };

    struct Step { title: &'static str, done: bool, body: String }
    let mut steps: Vec<Step> = vec![];
    steps.push(Step { title: "Identity", done: missing_id.is_empty(), body: if missing_id.is_empty() { "complete".into() } else {
        format!("missing: {}\nask: what is your full name, email, phone, city, one-line headline (e.g. \"Full-Stack Developer · AI\"), and a 3-4 sentence summary?\ncall: set_identity {{name, email, phone, location, headline, summary, pronouns?, legal_name?}}", missing_id.join(", ")) } });
    steps.push(Step { title: "Links", done: has("github") && has("linkedin"), body: format!("have: {}\n{}ask: which of GitHub, LinkedIn, portfolio, X/Twitter, resume URL, booking link should appear on applications?\ncall: add_link {{id, label, url, resume?}} for each (id like github, linkedin, portfolio)",
        arr(&me["links"]).iter().map(|l| s(l, "id")).collect::<Vec<_>>().join(", "), match (&gh_login, has("github")) { (Some(g), false) => format!("suggest: GitHub is logged in as {g}, add https://github.com/{g}\n"), _ => String::new() }) });
    steps.push(Step { title: "GitHub projects", done: n_proj > 0, body: if n_proj > 0 { format!("{n_proj} repos synced") } else {
        "no repos yet\ncall: sync (needs the user to be logged in with `gh auth login`; reads public and private repos, stores no token)".into() } });
    steps.push(Step { title: "Tech stack from evidence", done: !stack.is_empty(), body: if !stack.is_empty() { format!("{} technologies, with tiers from real usage", stack.len()) } else if n_proj > 0 {
        "empty\ncall: scan_stack (reads package.json, requirements.txt and Cargo.toml of every repo; derives tiers from how many projects use each technology)".into() } else { "needs repos first (sync)".into() } });
    steps.push(Step { title: "Experience", done: !arr(&me["experience"]).is_empty(), body: if arr(&me["experience"]).is_empty() {
        "none recorded\nask, one role at a time: role, organisation, type (Full-time, Part-time, Internship, Freelance, Contract, Volunteer, Open source), dates, what you built or did, technologies used, what you learned. Include internships, freelance and open source.\ncall: add_experience {role, org, type, start, end (YYYY-MM or Present), highlights[], stack[], learned[]}".into() } else { format!("{} entries", arr(&me["experience"]).len()) } });
    steps.push(Step { title: "Education", done: !arr(&me["education"]).is_empty(), body: if arr(&me["education"]).is_empty() {
        "none recorded\nask: degree and subject, school, years, status, relevant courses, and clubs or positions held there\ncall: add_education {level, degree, field, school, start, end, courses[], activities[{role, org, note}]}".into() } else { format!("{} entries", arr(&me["education"]).len()) } });
    steps.push(Step { title: "Achievements", done: !arr(&me["achievements"]).is_empty(), body: if arr(&me["achievements"]).is_empty() {
        "none recorded (optional)\nask: hackathons, competitions, courses, certifications, awards, with dates\ncall: add_achievement {title, kind, date}".into() } else { format!("{} entries", arr(&me["achievements"]).len()) } });
    let bare: Vec<&str> = pinned.iter().filter(|(_, p)| s(p, "tagline").is_empty() || arr(&p["bullets"]).is_empty()).map(|(n, _)| n.as_str()).collect();
    steps.push(Step { title: "Resume projects", done: pinned.len() >= 4 && bare.is_empty(), body: {
        let mut b = format!("{} pinned", pinned.len());
        if pinned.len() < 4 && n_proj > 0 {
            let mut c: Vec<(&String, &Value)> = projects.as_object().into_iter().flatten().filter(|(_, p)| p["fork"] != true && p["private"] != true).collect();
            c.sort_by(|a, b| s(b.1, "pushed").cmp(s(a.1, "pushed")));
            b += &format!("\nask: which 4-6 projects best show your work? most recent: {}\ncall: pin {{repo}}", c.iter().take(8).map(|(n, _)| n.as_str()).collect::<Vec<_>>().join(", "));
        }
        if !bare.is_empty() { b += &format!("\nneeds a tagline and 2-3 outcome bullets each: {}\ncall: set projects/<repo>/tagline, append projects/<repo>/bullets", bare.join(", ")); }
        b } });
    steps.push(Step { title: "Positioning", done: !s(&me["positioning"], "direction").is_empty() || !s(&me, "target").is_empty(), body: if s(&me["positioning"], "direction").is_empty() && s(&me, "target").is_empty() {
        "no target role\nask: what role are you aiming for, and what should an application never claim or lead with?\ncall: set_positioning {direction, avoid[], headlines[{label,text}], skill_order[]}".into() } else { "set".into() } });
    steps.push(Step { title: "Skills and claims", done: (!arr(&me["skills"]["strong"]).is_empty()) && unproven.is_empty(), body: {
        let mut b = String::new();
        if arr(&me["skills"]["strong"]).is_empty() {
            let core: Vec<&str> = stack.iter().filter(|x| matches!(s(x, "tier"), "Core" | "Regular")).map(|x| s(x, "name")).take(12).collect();
            b += &format!("no skills listed\nask the user to confirm from this evidence: {}\ncall: add_skill {{group: strong|working|no_evidence, name}}\n", if core.is_empty() { "(scan_stack first)".into() } else { core.join(", ") });
        }
        if !unproven.is_empty() { b += &format!("claimed but no evidence in the scanned repos: {}\nask the user whether each is real; if yes keep it, if not call add_claim_gap {{name, where, evidence, action}}\n", unproven.join(", ")); }
        if b.is_empty() { "every listed skill has evidence".into() } else { b.trim_end().to_string() } } });
    steps.push(Step { title: "Standard answers", done: unanswered.is_empty(), body: if unanswered.is_empty() { "complete".into() } else {
        format!("unanswered: {}\nask each, then call: set_answer {{key, value}} (value null keeps it unanswered; never delete the key)", unanswered.join(", ")) } });
    steps.push(Step { title: "Link health", done: checked, body: if checked { "checked".into() } else { "never checked\ncall: check_links".into() } });

    let done = steps.iter().filter(|s| s.done).count();
    let mut o = format!("# Profile setup: {done} of {} steps done\n\nRules: ask the user for anything marked ask, one section at a time; never invent facts; store with the typed tools shown (they validate and list what is wrong); undo mistakes with `undo`. Everything you store is indexed into the knowledge graph immediately, so `ask` can use it right away. Finish with `graph_stats` and tell the user what remains.\n", steps.len());
    for st in &steps {
        o += &format!("\n## {} {}\n{}\n", if st.done { "[x]" } else { "[ ]" }, st.title, st.body);
    }
    o
}

pub fn skeleton() -> Value {
    let mut me = Map::new();
    me.insert("identity".into(), json!({"name": "", "email": "", "phone": "", "location": "", "headline": "", "summary": ""}));
    me.insert("links".into(), json!([]));
    me.insert("experience".into(), json!([]));
    me.insert("education".into(), json!([]));
    me.insert("achievements".into(), json!([]));
    me.insert("skills".into(), json!({"strong": [], "working": [], "no_evidence": []}));
    me.insert("stack".into(), json!([]));
    me.insert("claim_gaps".into(), json!([]));
    me.insert("positioning".into(), json!({"direction": "", "headlines": [], "summaries": [], "avoid": [], "skill_order": []}));
    me.insert("answers".into(), json!({"work_authorization": null, "notice_period": null, "expected_salary": null, "willing_to_relocate": null, "earliest_start_date": null}));
    Value::Object(me)
}
