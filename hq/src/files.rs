//! Local file store: profile picture, resume versions and screenshots linked to projects, roles and achievements.
//! Bytes live in `<data dir>/files/<id>.<ext>`; metadata is the `files` list in profile.json. Nothing leaves the machine.
use crate::store::*;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

type R = Result<Value, String>;

pub const KINDS: [&str; 4] = ["avatar", "resume", "screenshot", "other"];
const LINK_TYPES: [&str; 5] = ["project", "experience", "education", "achievement", "me"];
pub const MAX_BYTES: u64 = 40 * 1024 * 1024;

pub fn dir_path() -> PathBuf {
    dir().join("files")
}

fn new_id() -> String {
    static N: AtomicU64 = AtomicU64::new(0);
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut h: u64 = 0xcbf29ce484222325;
    for b in format!("{t}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)).bytes() {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

pub fn mime_for(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", "gif" => "image/gif", "svg" => "image/svg+xml",
        "pdf" => "application/pdf", "txt" | "md" => "text/plain; charset=utf-8", "json" => "application/json",
        "doc" => "application/msword", "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "mp4" => "video/mp4", "webm" => "video/webm", _ => "application/octet-stream",
    }
}

fn ext_of(name: &str) -> String {
    name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).filter(|e| !e.is_empty() && e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric())).unwrap_or_else(|| "bin".into())
}

/// 64-bit content fingerprint (FNV-1a) used to spot duplicate uploads.
fn fingerprint(b: &[u8]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for x in b { h = (h ^ *x as u64).wrapping_mul(0x100000001b3); }
    format!("{h:016x}")
}

/// Space used by stored files, by kind, and groups of identical files.
pub fn storage() -> R {
    let l = list();
    let mut by_kind: std::collections::BTreeMap<String, (u64, u64)> = Default::default();
    let mut groups: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    let mut total = 0u64;
    for f in &l {
        let size = f["size"].as_u64().unwrap_or(0);
        total += size;
        let e = by_kind.entry(s(f, "kind").to_string()).or_default();
        e.0 += 1; e.1 += size;
        let sha = if s(f, "sha").is_empty() {
            std::fs::read(dir_path().join(format!("{}.{}", s(f, "id"), s(f, "ext")))).map(|b| fingerprint(&b)).unwrap_or_default()
        } else { s(f, "sha").to_string() };
        if !sha.is_empty() { groups.entry(sha).or_default().push(s(f, "id").to_string()); }
    }
    let dupes: Vec<Vec<String>> = groups.into_values().filter(|g| g.len() > 1).collect();
    Ok(json!({"files": l.len(), "bytes": total, "by_kind": by_kind.iter().map(|(k, (n, b))| (k.clone(), json!({"files": n, "bytes": b}))).collect::<serde_json::Map<_, _>>(), "duplicates": dupes}))
}

fn list() -> Vec<Value> {
    load("files").as_array().cloned().unwrap_or_default()
}

fn validate_link(l: &Value) -> Result<Value, String> {
    let (t, r) = (s(l, "type"), s(l, "ref"));
    if !LINK_TYPES.contains(&t) {
        return Err(format!("link type must be one of: {}", LINK_TYPES.join(", ")));
    }
    if r.is_empty() && t != "me" {
        return Err("link needs a ref (project name, or the role/degree/achievement title)".into());
    }
    Ok(json!({"type": t, "ref": r}))
}

/// Store bytes as a new file. `kind` decides the slot: one avatar (the newest wins), many resume versions, many screenshots.
pub fn add_bytes(name: &str, bytes: &[u8], kind: &str, link: Option<&Value>, note: &str, label: &str) -> R {
    if !KINDS.contains(&kind) {
        return Err(format!("kind must be one of: {}", KINDS.join(", ")));
    }
    if bytes.is_empty() {
        return Err("file is empty".into());
    }
    if bytes.len() as u64 > MAX_BYTES {
        return Err(format!("file is larger than {} MB", MAX_BYTES / 1024 / 1024));
    }
    let ext = ext_of(name);
    if kind == "avatar" || kind == "screenshot" {
        if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif") {
            return Err(format!("{kind} must be an image (png, jpg, webp or gif)"));
        }
    }
    let link = match link.filter(|l| !l.is_null()) { Some(l) => Some(validate_link(l)?), None => None };
    let id = new_id();
    std::fs::create_dir_all(dir_path()).map_err(|e| e.to_string())?;
    std::fs::write(dir_path().join(format!("{id}.{ext}")), bytes).map_err(|e| e.to_string())?;
    let mut entry = json!({"id": id, "name": name, "ext": ext, "mime": mime_for(&ext), "size": bytes.len(), "kind": kind, "added": now(), "note": note, "label": label, "links": [], "sha": fingerprint(bytes)});
    if let Some(l) = link { entry["links"] = json!([l]); }
    locked(|| {
        let mut l = list();
        if kind == "resume" {
            // the newest upload becomes the current version
            for x in l.iter_mut().filter(|x| s(x, "kind") == "resume") { x["current"] = json!(false); }
            entry["current"] = json!(true);
            let n = l.iter().filter(|x| s(x, "kind") == "resume").count() + 1;
            if label.is_empty() { entry["label"] = json!(format!("v{n}")); }
        }
        l.push(entry.clone());
        save("files", &json!(l))
    })?;
    if kind == "avatar" {
        locked(|| { let mut me = load("me"); me["identity"]["avatar"] = json!(id); save("me", &me) })?;
    }
    Ok(entry)
}

/// Copy a file from disk (used by agents and the CLI).
pub fn add_from_path(a: &Value) -> R {
    let path = s(a, "path");
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err(format!("not a file: {path}"));
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!("file is larger than {} MB", MAX_BYTES / 1024 / 1024));
    }
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    let name = if s(a, "name").is_empty() { p.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string() } else { s(a, "name").to_string() };
    let kind = if s(a, "kind").is_empty() { "other" } else { s(a, "kind") };
    add_bytes(&name, &bytes, kind, a.get("link"), s(a, "note"), s(a, "label"))
}

pub fn files(a: &Value) -> R {
    let (kind, rt, rf) = (s(a, "kind"), s(a, "ref_type"), s(a, "ref"));
    let out: Vec<Value> = list().into_iter().filter(|f| {
        (kind.is_empty() || s(f, "kind") == kind)
            && (rt.is_empty() || arr(&f["links"]).iter().any(|l| s(l, "type") == rt && (rf.is_empty() || s(l, "ref") == rf)))
    }).collect();
    Ok(json!(out))
}

pub fn file_update(a: &Value) -> R {
    let id = s(a, "id");
    let link = match a.get("link").filter(|l| !l.is_null()) { Some(l) => Some(validate_link(l)?), None => None };
    let unlink = match a.get("unlink").filter(|l| !l.is_null()) { Some(l) => Some(validate_link(l)?), None => None };
    locked(|| {
        let mut l = list();
        let i = l.iter().position(|f| s(f, "id") == id).ok_or_else(|| format!("no file {id}"))?;
        for k in ["name", "note", "label"] {
            if let Some(v) = a.get(k).and_then(Value::as_str) { l[i][k] = json!(v); }
        }
        if let Some(k) = a.get("kind").and_then(Value::as_str) {
            if !KINDS.contains(&k) { return Err(format!("kind must be one of: {}", KINDS.join(", "))); }
            l[i]["kind"] = json!(k);
        }
        if a["current"].as_bool() == Some(true) {
            let kind = s(&l[i], "kind").to_string();
            for x in l.iter_mut().filter(|x| s(x, "kind") == kind) { x["current"] = json!(false); }
            l[i]["current"] = json!(true);
        }
        let mut links = l[i]["links"].as_array().cloned().unwrap_or_default();
        if let Some(n) = link { if !links.contains(&n) { links.push(n); } }
        if let Some(u) = unlink { links.retain(|x| x != &u); }
        l[i]["links"] = json!(links);
        let out = l[i].clone();
        save("files", &json!(l))?;
        Ok(out)
    })
}

/// Permanently remove a file and its bytes.
pub fn file_delete(a: &Value) -> R {
    let id = s(a, "id");
    locked(|| {
        let mut l = list();
        let i = l.iter().position(|f| s(f, "id") == id).ok_or_else(|| format!("no file {id}"))?;
        let f = l.remove(i);
        let _ = std::fs::remove_file(dir_path().join(format!("{}.{}", id, s(&f, "ext"))));
        save("files", &json!(l))?;
        Ok(json!(format!("deleted {}", s(&f, "name"))))
    })
}

/// Bytes and content type for GET /files/<id>.
pub fn read(id: &str) -> Option<(String, Vec<u8>, String)> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    let f = list().into_iter().find(|f| s(f, "id") == id)?;
    let bytes = std::fs::read(dir_path().join(format!("{id}.{}", s(&f, "ext")))).ok()?;
    Some((s(&f, "mime").to_string(), bytes, s(&f, "name").to_string()))
}

/// Make a stored image the profile picture.
pub fn set_avatar(a: &Value) -> R {
    let id = s(a, "id");
    if !list().iter().any(|f| s(f, "id") == id && matches!(s(f, "kind"), "avatar" | "screenshot")) {
        return Err(format!("no image file {id}"));
    }
    locked(|| {
        let mut me = load("me");
        me["identity"]["avatar"] = json!(id);
        save("me", &me)
    })?;
    Ok(json!("profile picture set"))
}
