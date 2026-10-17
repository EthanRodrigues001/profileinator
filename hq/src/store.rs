//! Data layer: the single profile.json document, path helpers, the cross-process lock and the undo history.
use serde_json::{json, Value};
use std::cell::Cell;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// $HQ_DATA, else the OS config dir (never inside the repo, so personal data can't be committed by accident).
pub fn dir() -> PathBuf {
    if let Ok(d) = std::env::var("HQ_DATA") {
        return d.into();
    }
    let env = |k: &str| std::env::var(k).ok().map(PathBuf::from);
    let base = if cfg!(windows) {
        env("APPDATA")
    } else if cfg!(target_os = "macos") {
        env("HOME").map(|h| h.join("Library/Application Support"))
    } else {
        env("XDG_CONFIG_HOME").or_else(|| env("HOME").map(|h| h.join(".config")))
    };
    base.unwrap_or_else(|| ".".into()).join("profileinator")
}
pub fn file() -> PathBuf {
    dir().join("profile.json")
}
/// The whole profile is ONE document: {me, projects, state, log}.
pub fn doc() -> Value {
    std::fs::read_to_string(file()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}))
}
pub fn load(name: &str) -> Value {
    doc().get(name).cloned().unwrap_or(json!({}))
}
pub fn put(name: &str, v: Value) -> Result<(), String> {
    locked(|| {
        let mut d = doc();
        d[name] = v;
        let _ = std::fs::create_dir_all(dir());
        let tmp = dir().join("profile.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(&d).unwrap()).map_err(|e| e.to_string())?;
        std::fs::rename(tmp, file()).map_err(|e| e.to_string())
    })
}
pub fn save(name: &str, v: &Value) -> Result<(), String> {
    put(name, v.clone())
}
pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
pub fn ymd(secs: u64) -> String {
    let z = (secs / 86400) as i64 + 719468;
    let (era, doe) = (z.div_euclid(146097), z.rem_euclid(146097));
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}-{:02}", yoe + era * 400 + (m <= 2) as i64, m, d)
}
thread_local! { static SOURCE: Cell<&'static str> = const { Cell::new("cli") }; }
/// Who is making changes on this thread: "app" (the dashboard), "agent" (MCP) or "cli". Recorded in the activity log.
pub fn set_source(src: &'static str) {
    SOURCE.with(|c| c.set(src));
}
pub fn source() -> &'static str {
    SOURCE.with(|c| c.get())
}

/// Ledger of what agents read, kept in its own small file (usage.json) so reads never rewrite the whole profile.
/// Shape: {"<key>": {"n": reads, "last": unix seconds, "label": "..."}}. Keys are graph node ids ("tech:nextjs"),
/// "path:<profile path>", "ask:<question>", or a tool name such as "brief".
fn usage_file() -> PathBuf {
    dir().join("usage.json")
}
pub fn usage_all() -> Value {
    std::fs::read_to_string(usage_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(json!({}))
}
pub fn usage_bump(key: &str, label: &str) {
    if key.is_empty() { return; }
    locked(|| {
        let mut u = usage_all();
        let e = &mut u[key];
        let n = e["n"].as_u64().unwrap_or(0) + 1;
        *e = json!({"n": n, "last": now(), "label": label});
        // keep the ledger small: drop the least-read, oldest entries past 600
        if let Some(m) = u.as_object_mut() {
            if m.len() > 600 {
                let mut v: Vec<(String, u64, u64)> = m.iter().map(|(k, x)| (k.clone(), x["n"].as_u64().unwrap_or(0), x["last"].as_u64().unwrap_or(0))).collect();
                v.sort_by(|a, b| a.1.cmp(&b.1).then(a.2.cmp(&b.2)));
                for (k, _, _) in v.into_iter().take(100) { m.remove(&k); }
            }
        }
        let _ = std::fs::create_dir_all(dir());
        let tmp = dir().join("usage.tmp");
        if std::fs::write(&tmp, serde_json::to_string(&u).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(tmp, usage_file());
        }
    });
}

/// Append one link-check result to that URL's history (last 10 kept).
pub fn link_history_push(url: &str, result: &Value) {
    let mut st = load("state");
    if !st["link_history"].is_object() { st["link_history"] = json!({}); }
    let mut h = st["link_history"][url].as_array().cloned().unwrap_or_default();
    h.push(json!({"at": now(), "status": result["status"], "code": result["code"], "ms": result["ms"]}));
    if h.len() > 10 { h.drain(..h.len() - 10); }
    st["link_history"][url] = json!(h);
    let _ = save("state", &st);
}

pub fn log(kind: &str, text: &str) {
    locked(|| {
        let mut l = read_log();
        l.push(json!({"ts": now(), "date": ymd(now()), "kind": kind, "text": text, "src": SOURCE.with(|c| c.get())}));
        let _ = put("log", json!(l));
    });
}
pub fn read_log() -> Vec<Value> {
    load("log").as_array().cloned().unwrap_or_default()
}

// ---------- path helpers: "me/identity/email", "projects/Typeset/pinned" ----------
pub fn split(p: &str) -> (String, Vec<String>) {
    let mut it = p.trim_matches('/').split('/').map(String::from);
    (it.next().unwrap_or_default(), it.collect())
}
pub fn get_at<'a>(v: &'a Value, s: &[String]) -> Option<&'a Value> {
    let mut c = v;
    for k in s {
        c = match c {
            Value::Array(a) => a.get(k.parse::<usize>().ok()?)?,
            _ => c.get(k)?,
        };
    }
    Some(c)
}
pub fn set_at(v: &mut Value, s: &[String], val: Value) {
    let Some(k) = s.first() else { return *v = val };
    if let Value::Array(a) = v {
        if k == "-" {
            a.push(Value::Null);
            let l = a.len() - 1;
            return set_at(&mut a[l], &s[1..], val);
        }
        if let Some(i) = k.parse::<usize>().ok().filter(|i| *i < a.len()) {
            return set_at(&mut a[i], &s[1..], val);
        }
    }
    if !v.is_object() {
        *v = json!({});
    }
    set_at(v.as_object_mut().unwrap().entry(k.clone()).or_insert(Value::Null), &s[1..], val)
}
pub fn del_at(v: &mut Value, s: &[String]) -> bool {
    let Some((last, head)) = s.split_last() else { return false };
    let mut c = v;
    for k in head {
        c = match c {
            Value::Array(a) => match k.parse::<usize>().ok().and_then(|i| a.get_mut(i)) { Some(x) => x, None => return false },
            _ => match c.get_mut(k) { Some(x) => x, None => return false },
        };
    }
    match c {
        Value::Array(a) => last.parse::<usize>().ok().filter(|i| *i < a.len()).map(|i| a.remove(i)).is_some(),
        Value::Object(m) => m.remove(last).is_some(),
        _ => false,
    }
}
pub fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}
/// Public site for a project: a user-set `live_url` wins over GitHub's homepage (which may point at a dead domain).
pub fn site(p: &Value) -> &str {
    Some(s(p, "live_url")).filter(|u| !u.is_empty()).unwrap_or(s(p, "homepage"))
}
pub fn arr(v: &Value) -> Vec<&Value> {
    v.as_array().map(|a| a.iter().collect()).unwrap_or_default()
}
pub fn text(v: &Value) -> String {
    v.as_str().map(String::from).unwrap_or_else(|| v.to_string())
}
pub fn flatten(v: &Value, p: String, out: &mut Vec<(String, String)>) {
    match v {
        Value::Object(m) => m.iter().for_each(|(k, x)| flatten(x, format!("{p}/{k}"), out)),
        Value::Array(a) => a.iter().enumerate().for_each(|(i, x)| flatten(x, format!("{p}/{i}"), out)),
        Value::Null => {}
        x => out.push((p.trim_start_matches('/').into(), text(x))),
    }
}


// ---------- cross-process lock ----------
// The desktop app (hq ui) and every MCP client (hq mcp) are separate processes sharing one file. A lock file created with
// `create_new` is an atomic mutex across processes. Locks are re-entrant per thread, and a lock older than 15s is treated
// as left behind by a crash and taken over.
thread_local! { static DEPTH: Cell<u32> = const { Cell::new(0) }; }

struct Guard;
impl Drop for Guard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(lock_path());
    }
}
fn lock_path() -> PathBuf {
    dir().join("profile.lock")
}
fn acquire() -> Guard {
    let _ = std::fs::create_dir_all(dir());
    let started = std::time::Instant::now();
    loop {
        match OpenOptions::new().write(true).create_new(true).open(lock_path()) {
            Ok(mut f) => {
                let _ = write!(f, "{}", std::process::id());
                return Guard;
            }
            Err(_) => {
                let stale = std::fs::metadata(lock_path()).and_then(|m| m.modified()).ok()
                    .and_then(|m| SystemTime::now().duration_since(m).ok()).is_some_and(|age| age > Duration::from_secs(15));
                if stale || started.elapsed() > Duration::from_secs(20) {
                    let _ = std::fs::remove_file(lock_path());
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        }
    }
}
/// Run `f` while holding the file lock. Nested calls on the same thread just run.
pub fn locked<T>(f: impl FnOnce() -> T) -> T {
    if DEPTH.with(Cell::get) > 0 {
        return f();
    }
    let _g = acquire();
    DEPTH.with(|d| d.set(1));
    let out = f();
    DEPTH.with(|d| d.set(0));
    out
}

// ---------- undo history ----------
// Every user-facing write records the smallest thing needed to reverse it: the old value at a path, the index of an
// appended item, or the removed value and its position. Bulk, derived data (GitHub sync, commits, link checks) is not tracked.
const HISTORY_CAP: usize = 300;

/// What a write is about to change, captured before it runs.
pub struct Pre {
    kind: &'static str,
    path: String,
    before: Option<Value>,
    index: Option<usize>,
}

pub fn history_pre(op: &str, a: &Value) -> Option<Pre> {
    let sv = |k: &str| a.get(k).and_then(Value::as_str).unwrap_or("");
    let at = |path: &str| {
        let (f, rest) = split(path);
        get_at(&load(&f), &rest).cloned()
    };
    match op {
        "set" => Some(Pre { kind: "set", path: sv("path").into(), before: at(sv("path")), index: None }),
        "del" => {
            let (_, rest) = split(sv("path"));
            let index = rest.last().and_then(|x| x.parse::<usize>().ok());
            Some(Pre { kind: "del", path: sv("path").into(), before: at(sv("path")), index })
        }
        "pin" => {
            let p = format!("projects/{}/pinned", sv("repo"));
            Some(Pre { kind: "set", before: at(&p), path: p, index: None })
        }
        "add_project" | "update_project" => {
            let p = format!("projects/{}", sv("name"));
            Some(Pre { kind: "set", before: at(&p), path: p, index: None })
        }
        "append" => Some(Pre { kind: "add", path: sv("path").into(), before: None, index: None }),
        "set_identity" | "add_link" | "set_positioning" | "scan_stack" => {
            let p = match op { "set_identity" => "me/identity", "add_link" => "me/links", "set_positioning" => "me/positioning", _ => "me/stack" };
            Some(Pre { kind: "set", before: at(p), path: p.into(), index: None })
        }
        "set_answer" => {
            let p = format!("me/answers/{}", sv("key"));
            Some(Pre { kind: "set", before: at(&p), path: p, index: None })
        }
        "add_skill" => {
            let p = format!("me/skills/{}", sv("group"));
            Some(Pre { kind: "set", before: at(&p), path: p, index: None })
        }
        "add_experience" => Some(Pre { kind: "add", path: "me/experience".into(), before: None, index: None }),
        "add_education" => Some(Pre { kind: "add", path: "me/education".into(), before: None, index: None }),
        "add_achievement" => Some(Pre { kind: "add", path: "me/achievements".into(), before: None, index: None }),
        "add_tech" => Some(Pre { kind: "add", path: "me/stack".into(), before: None, index: None }),
        "add_claim_gap" => Some(Pre { kind: "add", path: "me/claim_gaps".into(), before: None, index: None }),
        "note" => Some(Pre { kind: "add", path: "log".into(), before: None, index: None }),
        _ => None,
    }
}

/// Append the entry for a write that succeeded. `after` is read back from the document so appends know their index.
pub fn history_record(op: &str, pre: Pre) {
    let (f, rest) = split(&pre.path);
    let list = get_at(&load(&f), &rest).cloned().unwrap_or(Value::Null);
    let (index, after) = match pre.kind {
        "add" => {
            let n = list.as_array().map_or(0, Vec::len);
            (n.checked_sub(1), list.as_array().and_then(|a| a.last().cloned()))
        }
        _ => (pre.index, None),
    };
    locked(|| history_push(op, pre, index, after));
}

fn history_push(op: &str, pre: Pre, index: Option<usize>, after: Option<Value>) {
    let mut h = load("history").as_array().cloned().unwrap_or_default();
    let id = h.last().and_then(|e| e["id"].as_u64()).unwrap_or(0) + 1;
    h.push(json!({"id": id, "ts": now(), "date": ymd(now()), "op": op, "kind": pre.kind, "path": pre.path, "before": pre.before, "after": after, "index": index}));
    if h.len() > HISTORY_CAP {
        h.drain(..h.len() - HISTORY_CAP);
    }
    let _ = put("history", json!(h));
}

pub fn history_list(limit: usize) -> Vec<Value> {
    let h = load("history").as_array().cloned().unwrap_or_default();
    h[h.len().saturating_sub(limit)..].iter().rev().map(|e| json!({"id": e["id"], "date": e["date"], "op": e["op"], "path": e["path"], "index": e["index"]})).collect()
}

/// Reverse the most recent `n` tracked writes. Returns a line per undone change.
pub fn undo(n: usize) -> Result<Vec<String>, String> {
    locked(|| {
        let mut h = load("history").as_array().cloned().unwrap_or_default();
        if h.is_empty() {
            return Err("nothing to undo".into());
        }
        let mut done = vec![];
        for _ in 0..n {
            let Some(e) = h.pop() else { break };
            let (f, rest) = split(e["path"].as_str().unwrap_or(""));
            let mut d = load(&f);
            match e["kind"].as_str().unwrap_or("") {
                "set" => match e.get("before").filter(|v| !v.is_null()) {
                    Some(b) => set_at(&mut d, &rest, b.clone()),
                    None => { del_at(&mut d, &rest); }
                },
                "del" => {
                    let b = e["before"].clone();
                    let parent_is_array = rest.len() > 1 && get_at(&d, &rest[..rest.len() - 1]).is_some_and(Value::is_array);
                    match (parent_is_array, e["index"].as_u64()) {
                        (true, Some(i)) => {
                            if let Some(Value::Array(a)) = get_at_mut(&mut d, &rest[..rest.len() - 1]) {
                                a.insert((i as usize).min(a.len()), b);
                            }
                        }
                        _ => set_at(&mut d, &rest, b),
                    }
                }
                _ => {
                    // an added item: remove it from where it was appended (or, if the list moved, the last equal item)
                    if let Some(Value::Array(a)) = get_at_mut(&mut d, &rest) {
                        let after = &e["after"];
                        let idx = e["index"].as_u64().map(|i| i as usize).filter(|i| a.get(*i) == Some(after)).or_else(|| a.iter().rposition(|x| x == after));
                        if let Some(i) = idx { a.remove(i); }
                    }
                }
            }
            put(&f, d)?;
            done.push(format!("undid {} {}", e["op"].as_str().unwrap_or(""), e["path"].as_str().unwrap_or("")));
        }
        put("history", json!(h))?;
        Ok(done)
    })
}

fn get_at_mut<'a>(v: &'a mut Value, s: &[String]) -> Option<&'a mut Value> {
    let mut c = v;
    for k in s {
        c = match c {
            Value::Array(a) => a.get_mut(k.parse::<usize>().ok()?)?,
            _ => c.get_mut(k)?,
        };
    }
    Some(c)
}
