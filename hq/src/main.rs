//! hq: one op table, three front doors (CLI, MCP over stdio, local web UI).
//! Data lives as plain JSON in $HQ_DATA (default ./data) so git and skills can read it too.
use serde_json::{json, Map, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

mod embed;
mod fill;
mod github;
mod graph;
mod store;
use store::*;

type R = Result<Value, String>;
static LOCK: Mutex<()> = Mutex::new(());

// ---------- ops ----------
fn call(op: &str, a: &Value) -> R {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let go = || {
        let pre = history_pre(op, a);
        let r = run(op, a);
        if r.is_ok() {
            if let Some(p) = pre {
                history_record(op, p);
            }
            if matches!(op, "set" | "append" | "del" | "pin" | "sync") {
                log("change", &format!("{op} {}", s(a, "path").to_string() + s(a, "repo")));
            }
        }
        r
    };
    // Network ops (gh, HTTP) must not hold the cross-process lock while they wait: they lock only for their final merge.
    if matches!(op, "sync" | "check_links" | "commits" | "commits_all" | "scan_stack" | "github_connect" | "github_status" | "setup_agent" | "update_check") { go() } else { locked(go) }
}
fn run(op: &str, a: &Value) -> R {
    match op {
        "brief" => Ok(json!(if a["full"].as_bool().unwrap_or(false) { dossier() } else { brief() })),
        "get" => {
            let (f, rest) = split(s(a, "path"));
            if f.is_empty() {
                return Ok(json!({"me": load("me"), "projects": load("projects")}));
            }
            get_at(&load(&f), &rest).cloned().ok_or_else(|| format!("nothing at {}", s(a, "path")))
        }
        "set" | "append" | "del" => {
            let (f, rest) = split(s(a, "path"));
            if !matches!(f.as_str(), "me" | "projects") {
                return Err("path must start with me/ or projects/".into());
            }
            let mut d = load(&f);
            match op {
                "del" => if !del_at(&mut d, &rest) { return Err("nothing to delete".into()) },
                "set" => set_at(&mut d, &rest, a.get("value").cloned().ok_or("value required")?),
                _ => {
                    if !get_at(&d, &rest).is_some_and(Value::is_array) {
                        set_at(&mut d, &rest, json!([]));
                    }
                    let mut r = rest.clone();
                    r.push("-".into());
                    set_at(&mut d, &r, a.get("value").cloned().ok_or("value required")?);
                }
            }
            save(&f, &d)?;
            Ok(json!("ok"))
        }
        "note" => {
            log(if s(a, "kind").is_empty() { "note" } else { s(a, "kind") }, s(a, "text"));
            Ok(json!("logged"))
        }
        "log" => {
            let l = read_log();
            let n = a["limit"].as_u64().unwrap_or(10) as usize;
            Ok(json!(l[l.len().saturating_sub(n)..]))
        }
        "search" => {
            // Word-start matching, ranked: "rust" finds Rust and Rustacean, not "TrustAI". Several words: any may match, more matches rank higher.
            let terms: Vec<String> = s(a, "q").to_lowercase().split_whitespace().map(String::from).collect();
            if terms.is_empty() {
                return Err("q is required".into());
            }
            let mut all = vec![];
            flatten(&load("me"), "me".into(), &mut all);
            flatten(&load("projects"), "projects".into(), &mut all);
            for (i, l) in read_log().iter().enumerate() {
                all.push((format!("log/{i}"), s(l, "text").into()));
            }
            // true when `term` starts a word in `hay` (previous char is not a letter or digit)
            let word_hit = |hay: &str, term: &str| hay.match_indices(term).any(|(i, _)| i == 0 || !hay[..i].chars().next_back().is_some_and(|c| c.is_alphanumeric()));
            let mut scored: Vec<(u32, String)> = all.iter().filter_map(|(path, val)| {
                let (pl, vl) = (path.to_lowercase(), val.to_lowercase());
                // any term may match; fields matching more terms rank higher
                let (mut score, mut hits) = (0, 0);
                for term in &terms {
                    let in_val = word_hit(&vl, term);
                    let in_key = word_hit(pl.rsplit('/').next().unwrap_or(""), term);
                    if in_val || in_key {
                        hits += 1;
                        score += if vl == *term { 4 } else if in_val { 2 } else { 1 } + u32::from(in_key) + 10 * hits;
                    }
                }
                if hits == 0 {
                    return None;
                }
                // raw byte counts and timestamps are noise unless the key itself matched
                if pl.contains("/langs/") && !terms.iter().any(|t| word_hit(pl.rsplit('/').next().unwrap_or(""), t)) {
                    return None;
                }
                Some((score, format!("{path}: {}", val.chars().take(160).collect::<String>())))
            }).collect();
            scored.sort_by(|x, y| y.0.cmp(&x.0).then(x.1.cmp(&y.1)));
            Ok(json!(scored.into_iter().take(25).map(|(_, l)| l).collect::<Vec<_>>()))
        }
        "repos" => repos(a),
        "pin" => {
            let (name, on) = (s(a, "repo"), a["on"].as_bool().unwrap_or(true));
            let mut p = load("projects");
            p.get_mut(name).ok_or_else(|| format!("unknown repo {name} (run sync, or set projects/{name} manually)"))?["pinned"] = json!(on);
            save("projects", &p)?;
            Ok(json!(format!("{name} pinned={on}")))
        }
        "sync" => sync(),
        "links" => Ok(load("state")["links"].clone()),
        "check_links" => check_links(),
        "autofill" => autofill(a),
        "export" => Ok(json!(export(s(a, "what")))),
        "integrations" => Ok(integrations()),
        "where" => Ok(json!(file().display().to_string())),
        "set_identity" => fill::set_identity(a),
        "add_link" => fill::add_link(a),
        "set_answer" => fill::set_answer(a),
        "add_skill" => fill::add_skill(a),
        "set_positioning" => fill::set_positioning(a),
        "scan_stack" => fill::scan_stack(),
        "setup_agent" => { let (lines, ok) = setup_core(); Ok(json!({"connected": ok, "lines": lines, "mcp_url": "http://127.0.0.1:4777/mcp", "command": std::env::current_exe().unwrap_or_default().display().to_string()})) }
        "update_check" => update_check(),
        "github_status" => github::status(),
        "github_connect" => github::connect(),
        "onboarding" => Ok(json!(fill::onboarding())),
        "ask" => graph::ask(s(a, "q"), a["depth"].as_u64().unwrap_or(1) as usize, a["limit"].as_u64().unwrap_or(6) as usize, a["json"].as_bool().unwrap_or(false)),
        "graph_neighbors" => graph::neighbors(s(a, "node"), a["depth"].as_u64().unwrap_or(1) as usize, s(a, "rel")),
        "graph_path" => graph::path(s(a, "from"), s(a, "to")),
        "graph_explain" => graph::explain(s(a, "node"), a["json"].as_bool().unwrap_or(false)),
        "graph_stats" => Ok(graph::stats()),
        "graph_export" => Ok(graph::export()),
        "undo" => undo(a["n"].as_u64().unwrap_or(1) as usize).map(|v| {
            v.iter().for_each(|l| log("change", l));
            json!(v)
        }),
        "history" => Ok(json!(history_list(a["limit"].as_u64().unwrap_or(15) as usize))),
        "commits" => commits(a),
        "commits_all" => commits_all(a),
        "feed" => feed(a),
        "add_experience" => add_entry(a, "experience", &[("type", &JOB_TYPES), ("mode", &WORK_MODES), ("visibility", &["Public", "Private"])], &["role", "org", "type", "start", "end"],
            &["role", "org", "type", "mode", "location", "start", "end", "highlights", "stack", "learned", "public", "visibility", "note"]),
        "add_education" => add_entry(a, "education", &[("level", &EDU_LEVELS), ("status", &["Ongoing", "Completed"])], &["level", "degree", "school", "end"],
            &["level", "degree", "field", "school", "start", "end", "grade", "courses", "activities", "highlights", "status", "semester", "note"]),
        "add_achievement" => add_entry(a, "achievements", &[("kind", &ACH_KINDS)], &["title", "kind", "date"], &["title", "kind", "date", "note", "link"]),
        "add_tech" => add_entry(a, "stack", &[("category", &STACK_CATS), ("tier", &TIERS)], &["name", "category", "tier"],
            &["name", "category", "tier", "projects", "first_seen", "last_used", "recent", "note"]),
        "add_claim_gap" => add_entry(a, "claim_gaps", &[], &["name", "where", "evidence"], &["name", "where", "evidence", "action"]),
        "add_project" => add_project(a),
        "update_project" => update_project(a),
        "init" => {
            if !file().exists() {
                save("me", &fill::skeleton())?;
            }
            Ok(json!(format!("profile at {}", file().display())))
        }
        _ => Err(format!("unknown op {op}")),
    }
}

const COMMITS_Q: &str = r#"query{repository(owner:"OWNER",name:"NAME"){defaultBranchRef{target{...on Commit{history(first:COUNT){nodes{oid abbreviatedOid messageHeadline committedDate additions deletions changedFilesIfAvailable parents(first:4){nodes{oid}} author{name avatarUrl user{login}}}}}}}}}"#;

fn owner() -> Result<String, String> {
    let mut st = load("state");
    if let Some(o) = st["owner"].as_str() {
        return Ok(o.to_string());
    }
    let out = Command::new("gh").args(["api", "user", "-q", ".login"]).output().map_err(|e| format!("gh not available: {e}"))?;
    let o = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if o.is_empty() {
        return Err("gh is not logged in (run `gh auth login`)".into());
    }
    locked(|| {
        st = load("state");
        st["owner"] = json!(o);
        save("state", &st)
    })?;
    Ok(o)
}

/// Newest-first history of the default branch with parents, so the UI can lay out the branch graph.
fn fetch_commits(owner: &str, name: &str, n: u64) -> Result<Vec<Value>, String> {
    let safe = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !safe(owner) || !safe(name) {
        return Err(format!("unsafe repo name {owner}/{name}"));
    }
    let q = COMMITS_Q.replace("OWNER", owner).replace("NAME", name).replace("COUNT", &n.clamp(1, 100).to_string());
    let out = Command::new("gh").args(["api", "graphql", "-f", &format!("query={q}")]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let nodes = &v["data"]["repository"]["defaultBranchRef"]["target"]["history"]["nodes"];
    Ok(arr(nodes).iter().map(|c| json!({
        "sha": c["oid"], "short": c["abbreviatedOid"], "msg": c["messageHeadline"], "date": c["committedDate"],
        "author": c["author"]["user"]["login"].as_str().or(c["author"]["name"].as_str()).unwrap_or("unknown"),
        "name": c["author"]["name"], "avatar": c["author"]["avatarUrl"],
        "add": c["additions"], "del": c["deletions"], "files": c["changedFilesIfAvailable"],
        "parents": arr(&c["parents"]["nodes"]).iter().map(|p| p["oid"].clone()).collect::<Vec<_>>(),
    })).collect())
}

fn store_commits(map: &mut Map<String, Value>, name: &str, nodes: Vec<Value>) {
    map.insert(name.into(), json!({"fetched": now(), "nodes": nodes}));
}

/// One repo's history. Cached in profile.json; pass refresh=true to pull again.
fn commits(a: &Value) -> R {
    let name = s(a, "repo");
    if !load("projects").get(name).is_some() {
        return Err(format!("unknown repo {name}"));
    }
    let n = a["limit"].as_u64().unwrap_or(100);
    let cached = load("commits");
    let stale = cached.get(name).map_or(true, |c| arr(&c["nodes"]).len() < (n as usize).min(30));
    if a["refresh"].as_bool().unwrap_or(false) || stale {
        let nodes = fetch_commits(&owner()?, name, n)?;
        return locked(|| {
            let mut all = load("commits").as_object().cloned().unwrap_or_default();
            store_commits(&mut all, name, nodes);
            put("commits", json!(all))?;
            Ok(all[name].clone())
        });
    }
    Ok(cached[name].clone())
}

/// Latest commits for every non-fork repo (default 30 each), six gh calls at a time.
fn commits_all(a: &Value) -> R {
    let o = owner()?;
    let n = a["limit"].as_u64().unwrap_or(30);
    let names: Vec<String> = load("projects").as_object().into_iter().flatten().filter(|(_, p)| p["fork"] != true).map(|(k, _)| k.clone()).collect();
    let (mut ok, mut failed) = (0, vec![]);
    let mut fetched: Vec<(String, Vec<Value>)> = vec![];
    for chunk in names.chunks(6) {
        let results: Vec<(String, Result<Vec<Value>, String>)> = std::thread::scope(|sc| {
            let hs: Vec<_> = chunk.iter().map(|nm| (nm.clone(), sc.spawn(|| fetch_commits(&o, nm, n)))).collect();
            hs.into_iter().map(|(nm, h)| (nm, h.join().unwrap_or(Err("panic".into())))).collect()
        });
        for (nm, r) in results {
            match r {
                Ok(nodes) => { fetched.push((nm, nodes)); ok += 1; }
                Err(e) => failed.push(format!("{nm}: {}", e.lines().next().unwrap_or(""))),
            }
        }
    }
    locked(|| {
        let mut all = load("commits").as_object().cloned().unwrap_or_default();
        for (nm, nodes) in fetched {
            store_commits(&mut all, &nm, nodes);
        }
        put("commits", json!(all))
    })?;
    Ok(json!({"repos": ok, "failed": failed}))
}

/// Recent commits across every cached repo, newest first.
fn feed(a: &Value) -> R {
    let mut v: Vec<Value> = vec![];
    for (name, c) in load("commits").as_object().into_iter().flatten() {
        for n in arr(&c["nodes"]) {
            let mut n = n.clone();
            n["repo"] = json!(name);
            v.push(n);
        }
    }
    v.sort_by(|x, y| s(y, "date").cmp(s(x, "date")));
    v.truncate(a["limit"].as_u64().unwrap_or(150) as usize);
    Ok(json!(v))
}

const JOB_TYPES: [&str; 7] = ["Full-time", "Part-time", "Internship", "Freelance", "Contract", "Volunteer", "Open source"];
const ACH_KINDS: [&str; 6] = ["Hackathon", "Competition", "Course", "Certification", "Award", "Event"];
const STACK_CATS: [&str; 6] = ["Frontend & UI", "Backend, data & auth", "AI / ML", "Mobile, desktop & extensions", "Tooling & testing", "Languages"];
const TIERS: [&str; 5] = ["Core", "Regular", "Working", "Tried", "Past"];
const PROJ_CATS: [&str; 5] = ["Showcase", "Hackathon", "Local-only", "Private", "Older"];
const PROJ_VIS: [&str; 2] = ["Public", "Keep off profiles"];
const WORK_MODES: [&str; 3] = ["On-site", "Remote", "Hybrid"];
const EDU_LEVELS: [&str; 5] = ["Degree", "Diploma", "Higher secondary", "Secondary", "Certification"];

fn valid_date(v: &str) -> bool {
    let d = |s: &str| s.chars().all(|c| c.is_ascii_digit());
    v == "Present" || (v.len() == 4 && d(v)) || (v.len() == 7 && v.as_bytes()[4] == b'-' && d(&v[..4]) && d(&v[5..]))
}

/// Typed append into me/<list>: required fields, enum checks, date format, unknown keys dropped.
fn add_entry(a: &Value, list: &str, enums: &[(&str, &[&str])], required: &[&str], keys: &[&str]) -> R {
    // Clients often send a bare year as a number; treat it as the string it means.
    let mut a = a.clone();
    for k in ["start", "end", "date"] {
        if let Some(n) = a[k].as_u64() {
            a[k] = json!(n.to_string());
        }
    }
    let a = &a;
    for k in required {
        if s(a, k).is_empty() {
            return Err(format!("{k} is required"));
        }
    }
    for (k, opts) in enums {
        if !s(a, k).is_empty() && !opts.contains(&s(a, k)) {
            return Err(format!("{k} must be one of: {}", opts.join(", ")));
        }
    }
    for k in ["start", "end", "date"] {
        if !s(a, k).is_empty() && !valid_date(s(a, k)) {
            return Err(format!("{k} must be YYYY-MM, YYYY or Present"));
        }
    }
    let entry: Map<String, Value> = a.as_object().into_iter().flatten().filter(|(k, v)| keys.contains(&k.as_str()) && !v.is_null()).map(|(k, v)| (k.clone(), v.clone())).collect();
    let mut me = load("me");
    if !me[list].is_array() {
        me[list] = json!([]);
    }
    // same identity as an existing entry => already stored; report it instead of adding a duplicate
    let identity: &[&str] = match list {
        "experience" => &["role", "org", "start"],
        "education" => &["degree", "school", "end"],
        "achievements" => &["title", "date"],
        "stack" => &["name", "category"],
        "claim_gaps" => &["name"],
        _ => &[],
    };
    let same = |x: &Value| !identity.is_empty() && identity.iter().all(|k| x.get(*k).map(text).unwrap_or_default().trim().to_lowercase() == entry.get(*k).map(text).unwrap_or_default().trim().to_lowercase());
    if let Some(i) = me[list].as_array().and_then(|l| l.iter().position(same)) {
        return Ok(json!(format!("already stored at me/{list}/{i}, nothing added (use set me/{list}/{i}/<field> to change it)")));
    }
    me[list].as_array_mut().unwrap().push(json!(entry));
    save("me", &me)?;
    Ok(json!(format!("added to me/{list}: {}", s(a, if list == "experience" { "role" } else { "degree" }))))
}

/// Add or update a project that is not (only) a GitHub repo: local-only work, hackathon entries, private business projects.
/// Merges into projects/<name> so synced repo data and your edits both survive.
fn add_project(a: &Value) -> R {
    let name = s(a, "name");
    if name.is_empty() || name.contains('/') {
        return Err("name is required and cannot contain /".into());
    }
    for (k, opts) in [("category", &PROJ_CATS[..]), ("visibility", &PROJ_VIS[..])] {
        if !s(a, k).is_empty() && !opts.contains(&s(a, k)) {
            return Err(format!("{k} must be one of: {}", opts.join(", ")));
        }
    }
    if s(a, "category").is_empty() || s(a, "summary").is_empty() {
        return Err("category and summary are required".into());
    }
    let mut p = load("projects");
    let e = p.as_object_mut().unwrap().entry(name).or_insert(json!({"pinned": false}));
    for k in ["category", "summary", "status", "when", "live_url", "local_path", "visibility", "note", "repo", "license", "stack"] {
        if let Some(v) = a.get(k).filter(|v| !v.is_null()) {
            e[k] = v.clone();
        }
    }
    save("projects", &p)?;
    Ok(json!(format!("project {name} saved")))
}

/// Edit what the UI shows for an existing project (usually a synced GitHub repo): pitch, bullets, stack, pin.
fn update_project(a: &Value) -> R {
    let name = s(a, "name");
    let mut p = load("projects");
    let e = p.get_mut(name).ok_or_else(|| format!("unknown project {name} (run sync, or use add_project for one that is not on GitHub)"))?;
    for (k, opts) in [("category", &PROJ_CATS[..]), ("visibility", &PROJ_VIS[..])] {
        if !s(a, k).is_empty() && !opts.contains(&s(a, k)) {
            return Err(format!("{k} must be one of: {}", opts.join(", ")));
        }
    }
    let mut changed = vec![];
    for k in ["tagline", "summary", "category", "status", "when", "homepage", "live_url", "visibility", "note", "local_path", "stack", "bullets", "pinned"] {
        if let Some(v) = a.get(k).filter(|v| !v.is_null()) {
            if matches!(k, "stack" | "bullets") && !v.as_array().is_some_and(|l| l.iter().all(|x| x.is_string())) {
                return Err(format!("{k} must be a list of strings"));
            }
            if k == "pinned" && !v.is_boolean() {
                return Err("pinned must be true or false".into());
            }
            e[k] = v.clone();
            changed.push(k);
        }
    }
    if changed.is_empty() {
        return Err("pass at least one field to change: tagline, summary, category, status, when, homepage, visibility, note, stack, bullets, pinned".into());
    }
    save("projects", &p)?;
    Ok(json!(format!("{name} updated: {}", changed.join(", "))))
}

const RELEASES: &str = "https://api.github.com/repos/EthanRodrigues001/profileinator/releases/latest";

fn version_parts(v: &str) -> Vec<u64> {
    v.trim_start_matches('v').split(['.', '-']).map_while(|x| x.parse().ok()).collect()
}

/// Is a newer release published? Used by the dashboard's update banner (and the desktop app's installer).
fn update_check() -> R {
    let current = env!("CARGO_PKG_VERSION");
    let ag = ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).user_agent("hq-update-check").build();
    let rel: Value = ag.get(RELEASES).call().map_err(|e| format!("could not reach GitHub: {e}"))?.into_json().map_err(|e| e.to_string())?;
    let latest = s(&rel, "tag_name").trim_start_matches('v').to_string();
    Ok(json!({"current": current, "latest": latest, "newer": version_parts(&latest) > version_parts(current),
        "url": rel["html_url"], "notes": rel["body"], "published": rel["published_at"]}))
}

fn repos(a: &Value) -> R {
    let (q, lang) = (s(a, "q").to_lowercase(), s(a, "lang").to_lowercase());
    let st = load("state");
    let mut v: Vec<Value> = load("projects").as_object().into_iter().flatten()
        .filter(|(n, p)| {
            (q.is_empty() || (n.to_lowercase() + s(p, "desc") + s(p, "tagline")).to_lowercase().contains(&q))
                && (lang.is_empty() || p["langs"].as_object().is_some_and(|m| m.keys().any(|k| k.to_lowercase() == lang)))
                && (!a["pinned"].as_bool().unwrap_or(false) || p["pinned"] == true)
        })
        .map(|(n, p)| {
            let live = st["links"][site(p)]["status"].clone();
            json!({"name": n, "pinned": p["pinned"] == true, "private": p["private"], "fork": p["fork"], "stars": p["stars"],
                   "pushed": p["pushed"], "primary": p["primary"], "desc": p["desc"], "tagline": p["tagline"], "stack": p["stack"], "category": p["category"], "visibility": p["visibility"], "summary": p["summary"], "status": p["status"], "when": p["when"], "local_path": p["local_path"], "note": p["note"], "bullets": p["bullets"], "created": p["created"], "url": p["url"], "topics": p["topics"],
                   "homepage": site(p), "live": live, "langs": p["langs"]})
        })
        .collect();
    v.sort_by(|x, y| s(y, "pushed").cmp(s(x, "pushed")));
    v.truncate(a["limit"].as_u64().unwrap_or(500) as usize);
    Ok(json!(v))
}

/// Pull every repo through the user's existing `gh` login, merging into projects.json
/// without touching fields the user owns (pinned, tagline, bullets, stack, notes).
fn sync() -> R {
    let out = Command::new("gh")
        .args(["repo", "list", "--limit", "300", "--json",
               "name,description,homepageUrl,isFork,isPrivate,languages,primaryLanguage,pushedAt,createdAt,repositoryTopics,stargazerCount,url"])
        .output()
        .map_err(|e| format!("gh not available: {e}"))?;
    if !out.status.success() {
        return Err(format!("gh failed (run `gh auth login`): {}", String::from_utf8_lossy(&out.stderr)));
    }
    let list: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    locked(|| {
    let mut p = load("projects");
    let mut n = 0;
    for r in arr(&list) {
        let langs: Map<String, Value> = arr(&r["languages"]).iter()
            .filter_map(|l| Some((l["node"]["name"].as_str()?.to_string(), l["size"].clone()))).collect();
        let topics: Vec<Value> = arr(&r["repositoryTopics"]).iter()
            .filter_map(|t| t["name"].as_str().or(t["topic"]["name"].as_str()).map(|x| json!(x))).collect();
        let e = p.as_object_mut().unwrap().entry(s(r, "name")).or_insert(json!({}));
        for (k, v) in [("url", r["url"].clone()), ("desc", r["description"].clone()), ("homepage", r["homepageUrl"].clone()),
            ("private", r["isPrivate"].clone()), ("fork", r["isFork"].clone()), ("stars", r["stargazerCount"].clone()),
            ("pushed", r["pushedAt"].clone()), ("created", r["createdAt"].clone()), ("primary", r["primaryLanguage"]["name"].clone()),
            ("langs", json!(langs)), ("topics", json!(topics))] {
            e[k] = v;
        }
        n += 1;
    }
    save("projects", &p)?;
    let mut st = load("state");
    st["synced"] = json!(now());
    save("state", &st)?;
    Ok(json!(format!("synced {n} repos")))
    })
}

fn link_urls() -> Vec<String> {
    let mut u: Vec<String> = arr(&load("me")["links"]).iter().map(|l| s(l, "url").to_string()).collect();
    for (_, p) in load("projects").as_object().into_iter().flatten().filter(|(_, p)| p["pinned"] == true) {
        u.push(site(p).into());
        if p["private"] != true {
            u.push(s(p, "url").into());
        }
    }
    u.retain(|x| x.starts_with("http"));
    u.sort();
    u.dedup();
    u
}
fn check_one(url: &str) -> Value {
    let ag = ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).user_agent("hq-link-check/0.1").build();
    let t = Instant::now();
    let (code, status) = match ag.get(url).call() {
        Ok(r) => (r.status(), "ok"),
        Err(ureq::Error::Status(c, _)) => (c, if matches!(c, 401 | 403 | 429 | 999) { "gated" } else { "dead" }),
        Err(_) => (0, "down"),
    };
    json!({"code": code, "status": status, "ms": t.elapsed().as_millis() as u64, "checked": ymd(now())})
}
fn check_links() -> R {
    let urls = link_urls();
    let mut res = Map::new();
    for chunk in urls.chunks(8) {
        std::thread::scope(|sc| {
            let hs: Vec<_> = chunk.iter().map(|u| (u, sc.spawn(|| check_one(u)))).collect();
            for (u, h) in hs {
                res.insert(u.clone(), h.join().unwrap_or(json!({"status": "down"})));
            }
        });
    }
    locked(|| {
        let mut st = load("state");
        st["links"] = json!(res.clone());
        save("state", &st)
    })?;
    let bad: Vec<_> = res.iter().filter(|(_, v)| v["status"] == "dead" || v["status"] == "down").map(|(k, v)| format!("{k} ({})", v["code"])).collect();
    Ok(json!({"checked": res.len(), "broken": bad, "gated": res.iter().filter(|(_, v)| v["status"] == "gated").map(|(k, _)| k).collect::<Vec<_>>()}))
}

fn autofill(a: &Value) -> R {
    let me = load("me");
    let id = &me["identity"];
    let name = s(id, "name");
    let (first, last) = name.split_once(' ').unwrap_or((name, ""));
    let mut m = Map::new();
    for (k, v) in [("full_name", name), ("first_name", first), ("last_name", last), ("legal_name", s(id, "legal_name")),
        ("email", s(id, "email")), ("phone", s(id, "phone")), ("location", s(id, "location")),
        ("headline", s(id, "headline")), ("summary", s(id, "summary"))] {
        if !v.is_empty() { m.insert(k.into(), json!(v)); }
    }
    arr(&me["links"]).iter().for_each(|l| { m.insert(s(l, "id").into(), json!(s(l, "url"))); });
    if let Some(e) = arr(&me["education"]).first() {
        m.insert("school".into(), json!(s(e, "school")));
        m.insert("degree".into(), json!(s(e, "degree")));
        m.insert("field_of_study".into(), json!(s(e, "field")));
        m.insert("grad_year".into(), json!(s(e, "end")));
    }
    if let Some(x) = arr(&me["experience"]).into_iter().find(|x| s(x, "end") == "Present") {
        m.insert("current_role".into(), json!(s(x, "role")));
        m.insert("current_company".into(), json!(s(x, "org")));
    }
    let mut missing: Vec<String> = vec![];
    for (k, v) in me["answers"].as_object().into_iter().flatten() {
        if v.is_null() { missing.push(k.clone()) } else { m.insert(k.clone(), v.clone()); }
    }
    if let Some(f) = a["fields"].as_array() {
        let want: Vec<&str> = f.iter().filter_map(Value::as_str).collect();
        m.retain(|k, _| want.contains(&k.as_str()));
        missing.retain(|k| want.contains(&k.as_str()));
        for k in want {
            if !m.contains_key(k) && !missing.iter().any(|x| x == k) {
                missing.push(k.to_string());
            }
        }
    }
    Ok(json!({"values": m, "missing": missing}))
}

fn pinned() -> Vec<(String, Value)> {
    let mut v: Vec<_> = load("projects").as_object().into_iter().flatten().filter(|(_, p)| p["pinned"] == true).map(|(n, p)| (n.clone(), p.clone())).collect();
    v.sort_by(|a, b| s(&b.1, "pushed").cmp(s(&a.1, "pushed")));
    v
}
fn join(v: &Value) -> String {
    arr(v).iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")
}
fn brief() -> String {
    let (me, st) = (load("me"), load("state"));
    let id = &me["identity"];
    if s(id, "name").is_empty() {
        return "PROFILE IS EMPTY. Call `onboarding` and follow it: it lists what to ask the user and which tools store each answer.".to_string();
    }
    let mut o = format!("# {} ({})\n{} · {}\n{}\nTarget: {}\n\n", s(id, "name"), s(id, "pronouns"), s(id, "headline"), s(id, "location"), s(id, "summary"), s(&me, "target"));
    o += "## Links\n";
    for l in arr(&me["links"]) {
        o += &format!("- {}: {} [{}]\n", s(l, "label"), s(l, "url"), st["links"][s(l, "url")]["status"].as_str().unwrap_or("unchecked"));
    }
    let avoid = join(&me["positioning"]["avoid"]);
    if !avoid.is_empty() {
        o += &format!("Avoid: {avoid}\n");
    }
    o += "\n## Education\n";
    for e in arr(&me["education"]) {
        let acts: Vec<String> = arr(&e["activities"]).iter().map(|x| format!("{} @ {}: {}", s(x, "role"), s(x, "org"), s(x, "note"))).collect();
        o += &format!("- {} {}, {} ({}–{}) {} | courses: {} | activities: {}\n", s(e, "degree"), s(e, "field"), s(e, "school"), s(e, "start"), s(e, "end"), s(e, "grade"), join(&e["courses"]), acts.join("; "));
    }
    o += "\n## Experience\n";
    for e in arr(&me["experience"]) {
        o += &format!("- {} @ {} [{}] ({}–{}) work: {} | stack: {} | learned: {}\n", s(e, "role"), s(e, "org"), s(e, "type"), s(e, "start"), s(e, "end"), join(&e["highlights"]), join(&e["stack"]), join(&e["learned"]));
    }
    o += "\n## Achievements\n";
    arr(&me["achievements"]).iter().for_each(|x| o += &if x.is_string() { format!("- {}\n", text(x)) } else { format!("- {} ({}, {})\n", s(x, "title"), s(x, "kind"), s(x, "date")) });
    let tier = |name: &str| arr(&me["stack"]).iter().filter(|x| s(x, "tier") == name).map(|x| s(x, "name")).collect::<Vec<_>>().join(", ");
    if !arr(&me["stack"]).is_empty() {
        o += &format!("\n## Stack by evidence\nCore: {}\nRegular: {}\nWorking: {}\n", tier("Core"), tier("Regular"), tier("Working"));
    }
    let gaps = arr(&me["claim_gaps"]).iter().map(|x| s(x, "name")).collect::<Vec<_>>().join(", ");
    if !gaps.is_empty() {
        o += &format!("Do not claim (no evidence): {gaps}\n");
    }
    o += "\n## Pinned projects\n";
    for (n, p) in pinned() {
        let stack = if p["stack"].is_array() { join(&p["stack"]) } else { s(&p, "primary").into() };
        let t = if s(&p, "tagline").is_empty() { s(&p, "desc") } else { s(&p, "tagline") };
        o += &format!("- {n}: {t} | {stack} | {}\n", if site(&p).is_empty() { s(&p, "url") } else { site(&p) });
    }
    o += &format!("\n## Skills\nStrong: {}\nWorking: {}\nNo evidence (don't claim): {}\n", join(&me["skills"]["strong"]), join(&me["skills"]["working"]), join(&me["skills"]["no_evidence"]));
    o += "\n## Recent notes\n";
    read_log().iter().rev().filter(|l| s(l, "kind") != "change").take(5).for_each(|l| o += &format!("- {} {}\n", s(l, "date"), s(l, "text")));
    let miss = autofill(&json!({})).map(|v| v["missing"].clone()).unwrap_or_default();
    let dead = st["links"].as_object().map(|m| m.values().filter(|v| v["status"] == "dead" || v["status"] == "down").count()).unwrap_or(0);
    o += &format!("\n## Gaps\nUnanswered autofill fields: {}\nBroken links: {dead}\n", join(&miss));
    o
}

/// The whole profile as one markdown document, so an agent that knows nothing can load everything in a single call.
fn dossier() -> String {
    if s(&load("me")["identity"], "name").is_empty() {
        return brief();
    }
    let (me, st) = (load("me"), load("state"));
    let id = &me["identity"];
    let pos = &me["positioning"];
    let mut o = format!("# {} ({}): full dossier\n{} · {} · {} · {}\n\n{}\n", s(id, "name"), s(id, "pronouns"), s(id, "headline"), s(id, "location"), s(id, "email"), s(id, "phone"), s(id, "summary"));
    o += &format!("Target: {}\n", if s(pos, "direction").is_empty() { s(&me, "target") } else { s(pos, "direction") });
    for h in arr(&pos["headlines"]) { o += &format!("Headline ({}): {}\n", s(h, "label"), s(h, "text")); }
    for x in arr(&pos["summaries"]) { o += &format!("Summary ({}): {}\n", s(x, "label"), s(x, "text")); }
    let avoid = join(&pos["avoid"]);
    if !avoid.is_empty() { o += &format!("AVOID: {avoid}\n"); }

    o += "\n## Links\n";
    for l in arr(&me["links"]) {
        o += &format!("- {}: {} [{}]{}\n", s(l, "label"), s(l, "url"), st["links"][s(l, "url")]["status"].as_str().unwrap_or("unchecked"), if s(l, "note").is_empty() { String::new() } else { format!(" {}", s(l, "note")) });
    }

    o += "\n## Experience\n";
    for e in arr(&me["experience"]) {
        let ctx = [s(e, "type"), s(e, "mode"), s(e, "location"), s(e, "visibility")].iter().filter(|x| !x.is_empty()).cloned().collect::<Vec<_>>().join(", ");
        o += &format!("- {} @ {} [{}] ({}–{})\n", s(e, "role"), s(e, "org"), ctx, s(e, "start"), s(e, "end"));
        for (k, v) in [("note", s(e, "note").to_string()), ("work", join(&e["highlights"])), ("stack", join(&e["stack"])), ("learned", join(&e["learned"]))] {
            if !v.is_empty() { o += &format!("  {k}: {v}\n"); }
        }
    }

    o += "\n## Education\n";
    for e in arr(&me["education"]) {
        o += &format!("- {} {}, {} ({}–{}) {} {} {}\n", s(e, "degree"), s(e, "field"), s(e, "school"), s(e, "start"), s(e, "end"), s(e, "status"), s(e, "semester"), s(e, "grade"));
        if !arr(&e["courses"]).is_empty() { o += &format!("  courses: {}\n", join(&e["courses"])); }
        for a in arr(&e["activities"]) { o += &format!("  position: {} @ {}: {}\n", s(a, "role"), s(a, "org"), s(a, "note")); }
        if !arr(&e["highlights"]).is_empty() { o += &format!("  highlights: {}\n", join(&e["highlights"])); }
    }

    o += "\n## Achievements\n";
    arr(&me["achievements"]).iter().for_each(|x| o += &if x.is_string() { format!("- {}\n", text(x)) } else { format!("- {} ({}, {}) {}\n", s(x, "title"), s(x, "kind"), s(x, "date"), s(x, "note")) });

    o += "\n## Skills\n";
    if !arr(&pos["skill_order"]).is_empty() { o += &format!("Honest order, strongest first: {}\n", join(&pos["skill_order"])); }
    o += &format!("Strong: {}\nWorking: {}\nNo evidence (never claim): {}\n", join(&me["skills"]["strong"]), join(&me["skills"]["working"]), join(&me["skills"]["no_evidence"]));
    let stack = arr(&me["stack"]);
    if !stack.is_empty() {
        o += "\n### Evidence by area (Core 15+ projects, Regular 5-14, Working 2-4, Tried 1, Past = old)\n";
        let mut cats: Vec<&str> = vec![];
        stack.iter().for_each(|x| if !cats.contains(&s(x, "category")) { cats.push(s(x, "category")) });
        for c in cats {
            let in_cat: Vec<&&Value> = stack.iter().filter(|x| s(x, "category") == c).collect();
            let tiers = ["Core", "Regular", "Working", "Tried", "Past"].iter().filter_map(|t| {
                let names: Vec<&str> = in_cat.iter().filter(|x| s(x, "tier") == *t).map(|x| s(x, "name")).collect();
                (!names.is_empty()).then(|| format!("{t}: {}", names.join(", ")))
            }).collect::<Vec<_>>().join(" | ");
            o += &format!("- {c}: {tiers}\n");
        }
    }
    let gaps = arr(&me["claim_gaps"]);
    if !gaps.is_empty() {
        o += "\n### Claims with no evidence\n";
        gaps.iter().for_each(|x| o += &format!("- {} (on {}): {} -> {}\n", s(x, "name"), s(x, "where"), s(x, "evidence"), s(x, "action")));
    }

    let all = load("projects");
    let proj = |name: &str, p: &Value| {
        let t = [s(p, "tagline"), s(p, "summary"), s(p, "desc")].into_iter().find(|x| !x.is_empty()).unwrap_or("");
        let stk = if p["stack"].is_array() { join(&p["stack"]) } else { s(p, "primary").to_string() };
        format!("{name}: {t} | {stk}{}{}", if site(p).is_empty() { String::new() } else { format!(" | {}", site(p)) }, if s(p, "when").is_empty() { String::new() } else { format!(" | {}", s(p, "when")) })
    };
    o += "\n## Projects\n### Pinned (on the resume)\n";
    for (n, p) in pinned() {
        o += &format!("- {}\n", proj(&n, &p));
        let b = join(&p["bullets"]);
        if !b.is_empty() { o += &format!("  bullets: {b}\n"); }
    }
    if let Some(map) = all.as_object() {
        for cat in ["Showcase", "Hackathon", "Local-only"] {
            let rows: Vec<String> = map.iter().filter(|(_, p)| s(p, "category") == cat && p["pinned"] != true).map(|(n, p)| format!("- {}\n", proj(n, p))).collect();
            if !rows.is_empty() { o += &format!("### {cat}\n{}", rows.concat()); }
        }
        for (cat, note) in [("Private", " (business work, keep off public profiles)"), ("Older", " (2020-2024)")] {
            let names: Vec<&str> = map.iter().filter(|(_, p)| s(p, "category") == cat).map(|(n, _)| n.as_str()).collect();
            if !names.is_empty() { o += &format!("### {cat}{note}\n{}\n", names.join(", ")); }
        }
        let other = map.values().filter(|p| s(p, "category").is_empty() && p["pinned"] != true).count();
        o += &format!("### Other repositories\n{other} uncategorised repos on GitHub (use `repos` or `ask` for any of them)\n");
    }

    o += "\n## Standard answers\n";
    for (k, v) in me["answers"].as_object().into_iter().flatten() {
        o += &format!("- {}: {}\n", k.replace('_', " "), if v.is_null() { "UNANSWERED, ask the user".to_string() } else { text(v) });
    }
    let log_all = read_log();
    let notes: Vec<&Value> = log_all.iter().filter(|l| s(l, "kind") != "change").collect();
    if !notes.is_empty() {
        o += "\n## Decisions and notes (latest first)\n";
        notes.iter().rev().take(12).for_each(|l| o += &format!("- {} [{}] {}\n", s(l, "date"), s(l, "kind"), s(l, "text")));
    }
    let dead = st["links"].as_object().map(|m| m.values().filter(|v| v["status"] == "dead" || v["status"] == "down").count()).unwrap_or(0);
    o += &format!("\nBroken links: {dead}\n");
    o
}

fn export(what: &str) -> String {
    if what == "json" {
        return serde_json::to_string_pretty(&json!({"me": load("me"), "projects": pinned().into_iter().collect::<Map<_, _>>()})).unwrap();
    }
    if what != "resume" {
        return brief();
    }
    let me = load("me");
    let id = &me["identity"];
    let mut o = format!("# {}\n{} · {} · {}\n{}\n\n", s(id, "name"), s(id, "email"), s(id, "phone"), s(id, "location"), s(id, "headline"));
    arr(&me["links"]).iter().filter(|l| l["resume"] == true).for_each(|l| o += &format!("{}: {}  \n", s(l, "label"), s(l, "url")));
    o += &format!("\n## Summary\n{}\n\n## Experience\n", s(id, "summary"));
    let bullets = |v: &Value| arr(v).iter().filter_map(|b| b.as_str()).map(|b| format!("- {b}\n")).collect::<String>();
    for e in arr(&me["experience"]).iter().filter(|e| e["public"] != false) {
        o += &format!("**{}**, {} · {} ({}–{})\n{}Stack: {}\n\n", s(e, "role"), s(e, "org"), s(e, "type"), s(e, "start"), s(e, "end"), bullets(&e["highlights"]), join(&e["stack"]));
    }
    o += "\n## Projects\n";
    for (n, p) in pinned() {
        o += &format!("**{n}** · {} · {}\n{}\n", join(&p["stack"]), site(&p), arr(&p["bullets"]).iter().filter_map(|b| b.as_str()).map(|b| format!("- {b}\n")).collect::<String>());
    }
    o += &format!("\n## Education\n{}\n\n## Skills\n{}\n", arr(&me["education"]).iter().map(|e| format!("{} {}, {} ({}–{})", s(e, "degree"), s(e, "field"), s(e, "school"), s(e, "start"), s(e, "end"))).collect::<Vec<_>>().join("\n"), join(&me["skills"]["strong"]));
    o
}

fn integrations() -> Value {
    let gh = Command::new("gh").args(["auth", "status"]).output().map(|o| o.status.success()).unwrap_or(false);
    json!([
        {"id": "github", "status": if gh { "connected" } else { "run `gh auth login`" }, "note": "repos, languages, topics via gh CLI (no token stored by hq)"},
        {"id": "links", "status": "ready", "note": "HTTP health check for profile and pinned-project links"},
        {"id": "linkedin", "status": "planned", "note": "no public API; import the official data export zip (Profile.csv, Positions.csv) into me/"},
        {"id": "resume", "status": "planned", "note": "export resume -> open-resume / Typst / PDF renderer"},
        {"id": "portfolio", "status": "planned", "note": "push me/ + pinned projects into portfolio/site/lib/config.tsx"}
    ])
}

// ---------- MCP (stdio JSON-RPC) ----------
fn tool(n: &str, d: &str, p: Value, req: &[&str]) -> Value {
    json!({"name": n, "description": d, "inputSchema": {"type": "object", "properties": p, "required": req}})
}
fn tools() -> Value {
    let (str_, any) = (json!({"type": "string"}), json!({}));
    json!([
        tool("brief", "Everything known about the user as markdown. Default: a compact overview (~1.5k tokens). full=true: the complete dossier in one call (~4k tokens): every role, school, project, technology tier, claim, answer and decision. Use full=true when you know nothing about the user and want it all at once.",
            json!({"full": {"type": "boolean"}}), &[]),
        tool("get", "Read JSON at a path like me/identity or projects/Typeset. Empty path returns everything.", json!({"path": str_}), &[]),
        tool("set", "Write a JSON value at a path (me/... or projects/...). Creates parents. Use for facts the user confirmed.", json!({"path": str_, "value": any}), &["path", "value"]),
        tool("append", "Append a value to an array at a path, e.g. me/achievements.", json!({"path": str_, "value": any}), &["path", "value"]),
        tool("del", "Delete the value at a path.", json!({"path": str_}), &["path"]),
        tool("note", "Log a decision, preference or fact worth remembering across chats.", json!({"text": str_, "kind": str_}), &["text"]),
        tool("log", "Recent notes and changes.", json!({"limit": {"type": "integer"}}), &[]),
        tool("search", "Case-insensitive search over all stored facts, projects and notes.", json!({"q": str_}), &["q"]),
        tool("repos", "List repos (name, stars, languages, live status). Filters: q, lang, pinned, limit.", json!({"q": str_, "lang": str_, "pinned": {"type": "boolean"}, "limit": {"type": "integer"}}), &[]),
        tool("pin", "Pin or unpin a repo so it is included in resume, portfolio and autofill output.", json!({"repo": str_, "on": {"type": "boolean"}}), &["repo"]),
        tool("sync", "Refresh all repos from GitHub using the local gh login.", json!({}), &[]),
        tool("check_links", "HTTP-check every profile link and pinned-project URL; returns broken and login-gated ones.", json!({}), &[]),
        tool("links", "Last link-check results.", json!({}), &[]),
        tool("autofill", "Values for form fields (name, email, links, summary, answers bank) plus a `missing` list to ask the user about.", json!({"fields": {"type": "array", "items": str_}}), &[]),
        tool("export", "Render: resume (markdown), json (structured), brief.", json!({"what": {"type": "string", "enum": ["resume", "json", "brief"]}}), &[]),
        tool("add_experience", "Append a work experience entry. Dates: YYYY-MM, YYYY or Present. highlights = work done (bullets), stack = tech used, learned = skills gained.",
            json!({"role": str_, "org": str_, "type": {"type": "string", "enum": JOB_TYPES}, "mode": {"type": "string", "enum": WORK_MODES}, "location": str_,
                   "start": str_, "end": str_, "highlights": {"type": "array", "items": str_}, "stack": {"type": "array", "items": str_}, "learned": {"type": "array", "items": str_}}),
            &["role", "org", "type", "start", "end"]),
        tool("add_education", "Append an education entry. degree is the credential (B.Tech, 12th HSC), field the subject (Computer Engineering, Science). activities = clubs and positions held there.",
            json!({"level": {"type": "string", "enum": EDU_LEVELS}, "degree": str_, "field": str_, "school": str_, "start": str_, "end": str_, "grade": str_,
                   "courses": {"type": "array", "items": str_}, "highlights": {"type": "array", "items": str_},
                   "activities": {"type": "array", "items": {"type": "object", "properties": {"role": str_, "org": str_, "note": str_}, "required": ["role"]}}}),
            &["level", "degree", "school", "end"]),
        tool("commits", "Commit history (newest first, with parents, authors, +/- lines) of one repo's default branch via the gh login. Cached; refresh=true re-pulls.",
            json!({"repo": str_, "limit": {"type": "integer"}, "refresh": {"type": "boolean"}}), &["repo"]),
        tool("commits_all", "Pull the latest commits (default 30 each) for every non-fork repo so the feed and activity views have data.", json!({"limit": {"type": "integer"}}), &[]),
        tool("feed", "Recent commits across all cached repos, newest first.", json!({"limit": {"type": "integer"}}), &[]),
        tool("add_achievement", "Append an achievement. kind: Hackathon, Competition, Course, Certification, Award or Event. date: YYYY-MM or YYYY.",
            json!({"title": str_, "kind": {"type": "string", "enum": ACH_KINDS}, "date": str_, "note": str_, "link": str_}), &["title", "kind", "date"]),
        tool("add_tech", "Append one technology to the evidence-based stack. tier: Core (15+ projects, current), Regular (5-14), Working (2-4, recent), Tried (once), Past (not touched recently). projects = number of projects using it; recent = project names.",
            json!({"name": str_, "category": {"type": "string", "enum": STACK_CATS}, "tier": {"type": "string", "enum": TIERS}, "projects": {"type": "integer"},
                   "first_seen": str_, "last_used": str_, "recent": {"type": "array", "items": str_}, "note": str_}), &["name", "category", "tier"]),
        tool("add_claim_gap", "Record a skill that is claimed on a profile but has no code evidence, with what to do about it. Never claim these.",
            json!({"name": str_, "where": str_, "evidence": str_, "action": str_}), &["name", "where", "evidence"]),
        tool("add_project", "Add or update a project that is not only a GitHub repo (local-only, hackathon, private). Merges into an existing project of the same name.",
            json!({"name": str_, "category": {"type": "string", "enum": PROJ_CATS}, "summary": str_, "stack": {"type": "array", "items": str_}, "status": str_, "when": str_,
                   "live_url": str_, "local_path": str_, "repo": str_, "license": str_, "visibility": {"type": "string", "enum": PROJ_VIS}, "note": str_}), &["name", "category", "summary"]),
        tool("update_project", "Edit an existing project (a synced GitHub repo or one from add_project): tagline, summary, bullets (resume lines), stack, category, status, homepage, visibility, note, pinned.",
            json!({"name": str_, "tagline": str_, "summary": str_, "bullets": {"type": "array", "items": str_}, "stack": {"type": "array", "items": str_}, "category": {"type": "string", "enum": PROJ_CATS},
                   "status": str_, "when": str_, "homepage": str_, "visibility": {"type": "string", "enum": PROJ_VIS}, "note": str_, "pinned": {"type": "boolean"}}), &["name"]),
        tool("onboarding", "Setup checklist for a new or incomplete profile: what is done, what is missing, exactly what to ask the user and which tool stores each answer. Call this first when brief says the profile is empty, and again after each section.", json!({}), &[]),
        tool("set_identity", "Set identity fields (validated). Merges: only the fields you pass change.",
            json!({"name": str_, "legal_name": str_, "pronouns": str_, "location": str_, "email": str_, "phone": str_, "headline": str_, "summary": str_}), &[]),
        tool("add_link", "Add or update a profile link by id (github, linkedin, portfolio, x, resume_url, cal...). URL must be https://, http:// or mailto:. resume=true puts it on the resume.",
            json!({"id": str_, "label": str_, "url": str_, "resume": {"type": "boolean"}, "note": str_}), &["id", "label", "url"]),
        tool("set_answer", "Store a standard application answer, e.g. notice_period, expected_salary, work_authorization, willing_to_relocate, earliest_start_date. Key is snake_case; value null marks it unanswered.",
            json!({"key": str_, "value": any}), &["key", "value"]),
        tool("add_skill", "Add a skill to strong, working or no_evidence. Only add what the user confirmed or the stack evidence supports.",
            json!({"group": {"type": "string", "enum": ["strong", "working", "no_evidence"]}, "name": str_}), &["group", "name"]),
        tool("set_positioning", "Set the target role (direction), headline and summary variants ({label,text}), things to avoid, and the honest skill order. Only the keys you pass change.",
            json!({"direction": str_, "headlines": {"type": "array", "items": {"type": "object"}}, "summaries": {"type": "array", "items": {"type": "object"}}, "avoid": {"type": "array", "items": str_}, "skill_order": {"type": "array", "items": str_}}), &[]),
        tool("scan_stack", "Derive the evidence-based tech stack from the user's own GitHub repos (package.json, requirements.txt, Cargo.toml plus language bytes): which technologies, how many projects, first and last use, and a tier (Core, Regular, Working, Tried, Past). Run after sync. Undoable.", json!({}), &[]),
        tool("update_check", "Is a newer Profileinator release published? Returns current and latest version and the release notes.", json!({}), &[]),
        tool("github_status", "Is the GitHub CLI installed and signed in, as whom, and how many repos are stored.", json!({}), &[]),
        tool("github_connect", "Import from GitHub: if gh is signed in, fills name/bio/link, syncs repos and scans the tech stack; if not, starts browser sign-in and returns a one-time code.", json!({}), &[]),
        tool("ask", "Answer a question about the person from the knowledge graph. Hybrid retrieval: keyword + synonyms + local semantic embeddings, fused, then widened along graph edges (e.g. backend experience, anything with Rust, what did the ML Head role involve). Prefer this over search for questions; returns matches with ids plus connected nodes.",
            json!({"q": str_, "depth": {"type": "integer", "description": "hops to widen, 1-3 (default 1)"}, "limit": {"type": "integer", "description": "matches to return (default 6)"}, "json": {"type": "boolean"}}), &["q"]),
        tool("graph_neighbors", "Traverse from a node (label or id) and list what it connects to, grouped by hop. Optional rel filter such as USES, USED, AT, EVIDENCED_BY, MENTIONS.",
            json!({"node": str_, "depth": {"type": "integer"}, "rel": str_}), &["node"]),
        tool("graph_path", "Shortest chain of relationships between two nodes, e.g. how Next.js connects to a company you worked at. Edges marked (derived) were inferred by matching, others are stated in the data.",
            json!({"from": str_, "to": str_}), &["from", "to"]),
        tool("graph_explain", "Everything known about one node: facts, where it is stored (so you can edit it with set), and all connections by relation.",
            json!({"node": str_, "json": {"type": "boolean"}}), &["node"]),
        tool("graph_stats", "Size of the knowledge graph, node and relation counts, most connected nodes, isolated nodes and whether semantic search is on.", json!({}), &[]),
        tool("undo", "Reverse the most recent tracked writes (set, append, del, pin, typed add_* tools, notes). n = how many. GitHub sync, commits and link checks are not tracked.",
            json!({"n": {"type": "integer"}}), &[]),
        tool("history", "List recent tracked writes, newest first, so you know what undo would reverse.", json!({"limit": {"type": "integer"}}), &[]),
        tool("where", "Path of the single profile.json document.", json!({}), &[]),
        tool("integrations", "Status of GitHub, LinkedIn and other integrations.", json!({}), &[])
    ])
}
/// One JSON-RPC message in, the reply out (None for notifications). Shared by the stdio and HTTP transports.
fn rpc(m: &Value) -> Option<Value> {
    let id = m.get("id").cloned()?;
    let p = &m["params"];
    let res = match s(&m, "method") {
        "initialize" => json!({"protocolVersion": p["protocolVersion"].as_str().unwrap_or("2024-11-05"), "capabilities": {"tools": {}},
            "serverInfo": {"name": "hq", "version": "0.1.0"},
            "instructions": "If `brief` says the profile is empty or incomplete, call `onboarding` and follow it section by section: ask the user, never invent, store with the typed tools. Profile HQ for the user: one knowledge graph about them (roles, education, projects, technologies, achievements, claims, decisions). Call `brief` first for the overview. For any question, use `ask` (semantic + keyword + graph), then `graph_neighbors`, `graph_path` or `graph_explain` to dig. Never invent facts: read before you answer. Store confirmed facts with the typed add_* tools or `set`/`append`, record decisions with `note`, and fix mistakes with `undo`. Use `autofill` for forms and ask the user about anything in `missing`."}),
        "tools/list" => json!({"tools": tools()}),
        "tools/call" => match call(s(p, "name"), &p["arguments"]) {
            Ok(v) => json!({"content": [{"type": "text", "text": text(&v)}]}),
            Err(e) => json!({"isError": true, "content": [{"type": "text", "text": e}]}),
        },
        _ => json!({}),
    };
    Some(json!({"jsonrpc": "2.0", "id": id, "result": res}))
}

fn mcp() {
    for line in std::io::stdin().lock().lines().map_while(Result::ok) {
        let Ok(m) = serde_json::from_str::<Value>(&line) else { continue };
        if let Some(r) = rpc(&m) {
            println!("{r}");
            let _ = std::io::stdout().flush();
        }
    }
}

// ---------- local web UI (serves the Next.js static export) ----------
fn asset(url: &str) -> Option<(&'static str, Vec<u8>)> {
    let exe = std::env::current_exe().unwrap_or_default();
    let mut cands: Vec<PathBuf> = std::env::var("HQ_UI").map(PathBuf::from).into_iter().collect();
    cands.push(exe.with_file_name("ui"));
    cands.extend(exe.ancestors().nth(4).map(|p| p.join("ui/out"))); // source checkout layout
    let root = cands.into_iter().find(|c| c.join("index.html").exists()).unwrap_or_default();
    let path = url.split(['?', '#']).next()?.trim_matches('/');
    if path.split('/').any(|s| s == "..") {
        return None;
    }
    let mut f = root.join(if path.is_empty() { "index.html" } else { path });
    if f.is_dir() {
        f = f.join("index.html");
    } else if !f.exists() {
        f = root.join(format!("{path}.html"));
    }
    let ct = match f.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8", Some("js") => "text/javascript", Some("css") => "text/css",
        Some("svg") => "image/svg+xml", Some("json") => "application/json", Some("woff2") => "font/woff2",
        Some("png") => "image/png", Some("ico") => "image/x-icon", Some("txt") => "text/plain", _ => "application/octet-stream",
    };
    std::fs::read(&f).ok().map(|b| (ct, b))
}
fn serve(port: u16, open: bool) {
    let url = format!("http://127.0.0.1:{port}");
    let srv = Arc::new(tiny_http::Server::http(format!("127.0.0.1:{port}")).unwrap_or_else(|e| { eprintln!("cannot bind {port}: {e}"); std::process::exit(1) }));
    eprintln!("hq ui on {url}");
    if open {
        let _ = if cfg!(windows) {
            Command::new("cmd").args(["/C", "start", "msedge", &format!("--app={url}")]).spawn()
        } else if cfg!(target_os = "macos") {
            Command::new("open").arg(&url).spawn()
        } else {
            Command::new("xdg-open").arg(&url).spawn()
        };
    }
    for mut rq in srv.incoming_requests() {
        std::thread::spawn(move || {
            let hdr = |n: &str| rq.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(n)).map(|h| h.value.to_string()).unwrap_or_default();
            let host_ok = [format!("127.0.0.1:{port}"), format!("localhost:{port}")].contains(&hdr("Host"));
            let (code, ctype, body) = if !host_ok {
                (403, "text/plain", "bad host".to_string())
            } else if *rq.method() == tiny_http::Method::Get {
                match asset(rq.url()) {
                    Some((ct, bytes)) => {
                        let h = tiny_http::Header::from_bytes("Content-Type", ct).unwrap();
                        let _ = rq.respond(tiny_http::Response::from_data(bytes).with_header(h));
                        return;
                    }
                    None => (404, "text/plain", "UI not built: run `npm run build` in profileinator/ui".into()),
                }
            } else if rq.url() == "/mcp" && *rq.method() == tiny_http::Method::Post {
                // MCP over HTTP for clients that take a URL. JSON content type forces a CORS preflight, which we never answer, so web pages cannot write here.
                if !hdr("Content-Type").starts_with("application/json") {
                    (415, "text/plain", "send application/json".to_string())
                } else {
                    let mut b = String::new();
                    let _ = rq.as_reader().read_to_string(&mut b);
                    match serde_json::from_str::<Value>(&b) {
                        Ok(m) => match rpc(&m) {
                            Some(r) => (200, "application/json", r.to_string()),
                            None => (202, "text/plain", String::new()),
                        },
                        Err(_) => (400, "text/plain", "bad json".to_string()),
                    }
                }
            } else if let (Some(op), tiny_http::Method::Post, true) = (rq.url().strip_prefix("/api/").map(String::from), rq.method().clone(), !hdr("x-hq").is_empty()) {
                let mut b = String::new();
                let _ = rq.as_reader().read_to_string(&mut b);
                let args = serde_json::from_str(&b).unwrap_or(json!({}));
                match call(&op, &args) {
                    Ok(v) => (200, "application/json", json!({"ok": v}).to_string()),
                    Err(e) => (200, "application/json", json!({"err": e}).to_string()),
                }
            } else {
                (404, "text/plain", "not found".into())
            };
            let h = tiny_http::Header::from_bytes("Content-Type", ctype).unwrap();
            let _ = rq.respond(tiny_http::Response::from_string(body).with_status_code(code).with_header(h));
        });
    }
}

// ---------- CLI ----------
fn cli(op: &str, rest: &[String]) -> Value {
    if rest.len() == 1 && rest[0].trim_start().starts_with('{') {
        return serde_json::from_str(&rest[0]).unwrap_or(json!({}));
    }
    let key = match op { "get" | "set" | "append" | "del" => "path", "pin" => "repo", "note" => "text", "search" => "q", "export" => "what", "log" => "limit", _ => "q" };
    let (mut m, mut pos) = (Map::new(), 0);
    for x in rest {
        if let Some((k, v)) = x.split_once('=').filter(|(k, _)| k.chars().all(|c| c.is_alphanumeric() || c == '_')) {
            m.insert(k.into(), serde_json::from_str(v).unwrap_or(json!(v)));
        } else {
            let v = if pos == 0 { json!(x) } else { serde_json::from_str(x).unwrap_or(json!(x)) };
            m.insert(if pos == 0 { key } else { "value" }.into(), if key == "limit" { serde_json::from_str(x).unwrap_or(json!(10)) } else { v });
            pos += 1;
        }
    }
    json!(m)
}

/// Install the skill and register hq with Claude Code. Returns human-readable lines and whether the agent is connected.
fn setup_core() -> (Vec<String>, bool) {
    let exe = std::env::current_exe().unwrap_or_default();
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default();
    let skill_dir = PathBuf::from(&home).join(".claude").join("skills").join("profileinator");
    let mut out = vec![];
    let mut ok = false;
    match std::fs::create_dir_all(&skill_dir).and_then(|_| std::fs::write(skill_dir.join("SKILL.md"), include_str!("../../skills/profileinator/SKILL.md"))) {
        Ok(_) => out.push(format!("skill installed: {}", skill_dir.join("SKILL.md").display())),
        Err(e) => out.push(format!("could not install the skill ({e}); copy skills/profileinator to ~/.claude/skills/")),
    }
    let mut cmd = Command::new("claude");
    cmd.arg("--version");
    if cmd.output().is_ok_and(|o| o.status.success()) {
        match Command::new("claude").args(["mcp", "add", "--scope", "user", "hq", "--"]).arg(&exe).arg("mcp").output() {
            Ok(o) if o.status.success() => { ok = true; out.push("MCP server registered with Claude Code (user scope): hq".into()) }
            Ok(o) => {
                let e = format!("{}{}", String::from_utf8_lossy(&o.stderr), String::from_utf8_lossy(&o.stdout));
                if e.contains("already exists") { ok = true; out.push("MCP server already registered with Claude Code: hq".into()) } else { out.push(format!("claude mcp add said: {}", e.trim())) }
            }
            Err(e) => out.push(format!("could not run claude: {e}")),
        }
    } else {
        out.push("Claude Code CLI not found. For other agents add this MCP config (stdio), or point URL-based clients at http://127.0.0.1:4777/mcp while `hq ui` is running:".into());
        out.push(serde_json::to_string_pretty(&json!({"mcpServers": {"hq": {"command": exe.display().to_string(), "args": ["mcp"]}}})).unwrap());
    }
    let _ = locked(|| run("init", &json!({})));
    (out, ok)
}

/// One command for a new user: install the skill for Claude Code and register this binary as an MCP server.
fn setup() {
    let (lines, _) = setup_core();
    for l in lines { println!("{l}"); }
    println!("
Data file: {}
Now open Claude Code and say: set up my profile", file().display());
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        None | Some("help") | Some("-h") => println!("hq <setup|init|where|onboarding|brief|get|set|append|del|note|log|search|repos|pin|sync|check_links|links|autofill|export|integrations|ui|mcp> [args]\n  data: $HQ_DATA or the OS config dir (run `hq where`); `hq init` creates an empty profile"),
        Some("mcp") => mcp(),
        Some("setup") => setup(),
        Some("ui") => serve(args.get(1).and_then(|p| p.parse().ok()).unwrap_or(4777), !args.iter().any(|a| a == "--no-open")),
        Some(op) => match call(op, &cli(op, &args[1..])) {
            Ok(v) => println!("{}", if v.is_string() { text(&v) } else { serde_json::to_string_pretty(&v).unwrap() }),
            Err(e) => { eprintln!("error: {e}"); std::process::exit(1) }
        },
    }
}
