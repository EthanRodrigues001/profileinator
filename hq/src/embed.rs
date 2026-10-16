//! Local semantic embeddings. Static Model2Vec vectors: no GPU, no server, ~30 MB downloaded once from Hugging Face and
//! cached on disk. If the model can't load (offline first run, feature off, HQ_SEMANTIC=off) every caller falls back to
//! lexical retrieval, so nothing depends on this module succeeding.
use crate::store::dir;
use serde_json::{json, Value};
use std::collections::HashMap;
#[cfg(feature = "semantic")]
use std::sync::OnceLock;

const MODEL: &str = "minishlab/potion-base-8M";

#[cfg(feature = "semantic")]
static MODEL_CELL: OnceLock<Result<model2vec_rs::model::StaticModel, String>> = OnceLock::new();

#[cfg(feature = "semantic")]
fn model() -> Result<&'static model2vec_rs::model::StaticModel, String> {
    if std::env::var("HQ_SEMANTIC").is_ok_and(|v| v == "off") {
        return Err("disabled with HQ_SEMANTIC=off".into());
    }
    MODEL_CELL
        .get_or_init(|| {
            let id = std::env::var("HQ_EMBED_MODEL").unwrap_or_else(|_| MODEL.into());
            model2vec_rs::model::StaticModel::from_pretrained(&id, None, None, None).map_err(|e| format!("model {id} unavailable: {e}"))
        })
        .as_ref()
        .map_err(|e| e.clone())
}

#[cfg(not(feature = "semantic"))]
fn model() -> Result<&'static (), String> {
    Err("built without the `semantic` feature".into())
}

/// "on (potion-base-8M)" or "off (reason)". Triggers the one-time model load.
pub fn status() -> String {
    match model() {
        Ok(_) => format!("on ({})", MODEL.rsplit('/').next().unwrap_or(MODEL)),
        Err(e) => format!("off ({e})"),
    }
}

pub fn embed(texts: &[String]) -> Option<Vec<Vec<f32>>> {
    #[cfg(feature = "semantic")]
    {
        model().ok().map(|m| m.encode(texts))
    }
    #[cfg(not(feature = "semantic"))]
    {
        let _ = texts;
        None
    }
}

pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let (mut dot, mut na, mut nb) = (0.0, 0.0, 0.0);
    for (x, y) in a.iter().zip(b) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na.sqrt() * nb.sqrt()) }
}

fn hash(s: &str) -> u64 {
    // FNV-1a: stable across runs, which is what the cache needs
    s.bytes().fold(0xcbf29ce484222325, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3))
}

fn cache_path() -> std::path::PathBuf {
    dir().join("profile.index.json")
}

/// Vectors for `(id, text)` pairs, reusing the on-disk cache for texts that haven't changed. The cache is derived data:
/// delete it any time and it is rebuilt. Returns None when embeddings are unavailable.
pub fn vectors(items: &[(String, String)]) -> Option<HashMap<String, Vec<f32>>> {
    model().ok()?;
    let cached: Value = std::fs::read_to_string(cache_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}));
    let same_model = cached["model"] == MODEL;
    let mut out: HashMap<String, Vec<f32>> = HashMap::new();
    let mut missing: Vec<&(String, String)> = vec![];
    for it in items {
        let h = hash(&it.1).to_string();
        let hit = same_model.then(|| &cached["nodes"][&it.0]).filter(|n| n["h"] == h.as_str());
        match hit.and_then(|n| n["v"].as_array()) {
            Some(v) => { out.insert(it.0.clone(), v.iter().filter_map(|x| x.as_f64().map(|f| f as f32)).collect()); }
            None => missing.push(it),
        }
    }
    if !missing.is_empty() {
        let texts: Vec<String> = missing.iter().map(|m| m.1.clone()).collect();
        let vecs = embed(&texts)?;
        for (it, v) in missing.iter().zip(vecs) {
            out.insert(it.0.clone(), v);
        }
        let nodes: serde_json::Map<String, Value> = items.iter().filter_map(|it| {
            out.get(&it.0).map(|v| (it.0.clone(), json!({"h": hash(&it.1).to_string(), "v": v.iter().map(|x| (*x * 1e4).round() / 1e4).collect::<Vec<_>>()})))
        }).collect();
        let _ = std::fs::create_dir_all(dir());
        let _ = std::fs::write(cache_path(), json!({"model": MODEL, "nodes": nodes}).to_string());
    }
    Some(out)
}

