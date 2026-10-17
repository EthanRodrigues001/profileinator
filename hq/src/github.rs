//! First-run GitHub step: detect an existing `gh` login, or start the browser sign-in, then pull repos and the tech stack.
use crate::store::*;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::Mutex;

type R = Result<Value, String>;

/// Device-flow sign-in started by `github_connect`: the one-time code and whether `gh` is still waiting.
static LOGIN: Mutex<Option<(String, bool)>> = Mutex::new(None);

fn installed() -> bool {
    Command::new("gh").arg("--version").output().is_ok_and(|o| o.status.success())
}

fn user() -> Option<Value> {
    let o = Command::new("gh").args(["api", "user"]).output().ok()?;
    if !o.status.success() {
        return None;
    }
    serde_json::from_slice(&o.stdout).ok().filter(|v: &Value| v["login"].is_string())
}

pub fn status() -> R {
    let pending = LOGIN.lock().ok().and_then(|g| g.clone());
    let projects = load("projects");
    let repos = projects.as_object().map_or(0, |m| m.len());
    if !installed() {
        return Ok(json!({"installed": false, "logged_in": false, "repos": repos,
            "hint": "Install the GitHub CLI from https://cli.github.com, then press Connect again."}));
    }
    let u = user();
    let mut out = json!({"installed": true, "logged_in": u.is_some(), "repos": repos, "synced": load("state")["synced"].clone()});
    if let Some(u) = u {
        out["login"] = u["login"].clone();
        out["name"] = u["name"].clone();
        out["avatar"] = u["avatar_url"].clone();
        for (k, f) in [("bio", "bio"), ("location", "location"), ("company", "company"), ("blog", "blog"), ("followers", "followers"), ("following", "following"),
                       ("public_repos", "public_repos"), ("url", "html_url"), ("since", "created_at")] {
            out[k] = u[f].clone();
        }
        if let Ok(mut g) = LOGIN.lock() { *g = None; }
    } else if let Some((code, waiting)) = pending {
        out["code"] = json!(code);
        out["waiting"] = json!(waiting);
        out["url"] = json!("https://github.com/login/device");
    }
    Ok(out)
}

/// Logged in: import everything. Logged out: start the browser sign-in and hand back the one-time code.
pub fn connect() -> R {
    if !installed() {
        return status();
    }
    let Some(u) = user() else { return start_login() };
    let login = u["login"].as_str().unwrap_or_default().to_string();
    locked(|| {
        let mut me = load("me");
        for (k, v) in [("name", &u["name"]), ("location", &u["location"]), ("email", &u["email"]), ("summary", &u["bio"])] {
            if me["identity"][k].as_str().unwrap_or("").is_empty() {
                if let Some(t) = v.as_str().filter(|t| !t.is_empty()) {
                    me["identity"][k] = json!(t);
                }
            }
        }
        if me["identity"]["name"].as_str().unwrap_or("").is_empty() {
            me["identity"]["name"] = json!(login);
        }
        if !me["links"].is_array() {
            me["links"] = json!([]);
        }
        let has = me["links"].as_array().is_some_and(|l| l.iter().any(|x| s(x, "id") == "github"));
        if !has {
            me["links"].as_array_mut().unwrap().push(json!({"id": "github", "label": "GitHub", "url": format!("https://github.com/{login}"), "resume": true}));
        }
        save("me", &me)?;
        let mut st = load("state");
        st["owner"] = json!(login);
        save("state", &st)
    })?;
    // sync also scans the tech stack
    let synced = crate::run("sync", &json!({}))?;
    if let Ok(mut g) = LOGIN.lock() { *g = None; }
    Ok(json!({"connected": true, "login": login, "sync": synced, "stack": ""}))
}

fn start_login() -> R {
    if let Some((code, true)) = LOGIN.lock().ok().and_then(|g| g.clone()) {
        return Ok(json!({"connected": false, "waiting": true, "code": code, "url": "https://github.com/login/device"}));
    }
    let mut child = Command::new("gh")
        .args(["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https"])
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("could not start gh: {e}"))?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    for pipe in [child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>)].into_iter().flatten() {
        let tx = tx.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                let _ = tx.send(line);
            }
        });
    }
    drop(tx);
    // gh prints "! First copy your one-time code: ABCD-1234" before it opens the browser
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    let mut code = String::new();
    while std::time::Instant::now() < deadline {
        match rx.recv_timeout(std::time::Duration::from_millis(250)) {
            Ok(line) => {
                if let Some(i) = line.find("code:") {
                    code = line[i + 5..].trim().to_string();
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(_) => break,
        }
    }
    if code.is_empty() {
        let _ = child.kill();
        return Err("gh did not give a sign-in code. Run `gh auth login` in a terminal, then press Connect again.".into());
    }
    if let Ok(mut g) = LOGIN.lock() { *g = Some((code.clone(), true)); }
    std::thread::spawn(move || {
        let _ = child.wait();
        for _ in rx {}
        if let Ok(mut g) = LOGIN.lock() { if let Some(x) = g.as_mut() { x.1 = false; } }
    });
    Ok(json!({"connected": false, "waiting": true, "code": code, "url": "https://github.com/login/device"}))
}

/// Release, CI and open issue/PR counts for one repo, cached on the project as `extras`.
pub fn project_extras(a: &Value) -> R {
    let name = s(a, "repo");
    let p = load("projects");
    let proj = p.get(name).ok_or_else(|| format!("unknown repo {name} (run sync first)"))?;
    if !proj["url"].is_string() {
        return Err(format!("{name} is not on GitHub (local-only project), so there are no releases or CI to fetch"));
    }
    let owner = crate::owner()?;
    let safe = |x: &str| !x.is_empty() && x.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !safe(&owner) || !safe(name) {
        return Err(format!("unsafe repo name {owner}/{name}"));
    }
    let q = format!("query{{repository(owner:\"{owner}\",name:\"{name}\"){{issues(states:OPEN){{totalCount}} pullRequests(states:OPEN){{totalCount}} latestRelease{{tagName publishedAt url}}}}}}");
    let out = Command::new("gh").args(["api", "graphql", "-f", &format!("query={q}")]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let r = &v["data"]["repository"];
    // last runs on the default branch; repos without Actions return an empty list
    let branch = if s(proj, "branch").is_empty() { "main" } else { s(proj, "branch") };
    let runs = Command::new("gh").args(["api", &format!("repos/{owner}/{name}/actions/runs?branch={branch}&per_page=7"), "-q",
        "[.workflow_runs[] | {c: .conclusion, s: .status, at: .updated_at}]"]).output().ok().filter(|o| o.status.success())
        .and_then(|o| serde_json::from_slice::<Value>(&o.stdout).ok()).unwrap_or(json!([]));
    let ci: Vec<Value> = arr(&runs).iter().map(|x| json!({"ok": match s(x, "c") { "success" => json!(true), "" | "cancelled" | "skipped" | "neutral" => Value::Null, _ => json!(false) }, "at": x["at"]})).collect();
    let extras = json!({"fetched": now(), "issues": r["issues"]["totalCount"], "prs": r["pullRequests"]["totalCount"],
        "release": if r["latestRelease"].is_null() { Value::Null } else { json!({"tag": r["latestRelease"]["tagName"], "date": r["latestRelease"]["publishedAt"], "url": r["latestRelease"]["url"]}) },
        "ci": ci});
    locked(|| {
        let mut p = load("projects");
        if let Some(e) = p.get_mut(name) { e["extras"] = extras.clone(); }
        save("projects", &p)
    })?;
    Ok(extras)
}

/// Screenshot the live site with a public screenshot service and store it, linked to the project. Sends only the site URL.
pub fn capture_screenshot(a: &Value) -> R {
    let name = s(a, "repo");
    let p = load("projects");
    let proj = p.get(name).ok_or_else(|| format!("unknown project {name}"))?;
    let url = if s(a, "url").is_empty() { site(proj).to_string() } else { s(a, "url").to_string() };
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("this project has no live site URL (set live_url with update_project, or pass url)".into());
    }
    let service = format!("https://image.thum.io/get/width/1440/crop/900/noanimate/{url}");
    let ag = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(40)).user_agent("hq-screenshot").build();
    let resp = ag.get(&service).call().map_err(|e| format!("screenshot service failed: {e}"))?;
    let mut bytes = vec![];
    resp.into_reader().take(crate::files::MAX_BYTES).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    crate::files::add_bytes(&format!("{name}-live.png"), &bytes, "screenshot", Some(&json!({"type": "project", "ref": name})), &format!("Live site {url}"), "Live site")
}
