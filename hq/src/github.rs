//! First-run GitHub step: detect an existing `gh` login, or start the browser sign-in, then pull repos and the tech stack.
use crate::store::*;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
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
    let synced = crate::run("sync", &json!({}))?;
    let stack = crate::run("scan_stack", &json!({})).unwrap_or_else(|e| json!(format!("stack scan skipped: {e}")));
    if let Ok(mut g) = LOGIN.lock() { *g = None; }
    Ok(json!({"connected": true, "login": login, "sync": synced, "stack": stack}))
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
