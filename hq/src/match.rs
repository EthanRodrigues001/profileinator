//! Match a job description against the profile, locally: which requirements the profile can back, which it can't,
//! and which the user said to avoid. Vocabulary = technologies named anywhere in the profile plus a built-in list.
use crate::graph;
use crate::store::*;
use serde_json::{json, Value};

type R = Result<Value, String>;

const COMMON: &[&str] = &[
    "python", "java", "javascript", "typescript", "go", "golang", "rust", "c++", "c#", "ruby", "php", "kotlin", "swift", "scala", "sql", "nosql", "graphql", "rest", "grpc",
    "react", "next.js", "vue", "angular", "svelte", "node.js", "express", "django", "flask", "fastapi", "spring", "rails", "laravel", ".net", "tailwind", "css", "html",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions", "ci/cd", "linux", "bash",
    "postgresql", "postgres", "mysql", "mongodb", "redis", "kafka", "rabbitmq", "elasticsearch", "dynamodb", "snowflake", "bigquery", "spark", "airflow", "dbt",
    "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "llm", "langchain", "rag", "machine learning", "deep learning", "nlp", "computer vision",
    "react native", "flutter", "android", "ios", "figma", "git", "agile", "scrum", "microservices", "websocket", "oauth", "prisma", "drizzle", "supabase", "firebase", "vercel",
];

fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric() || matches!(c, '+' | '#')).collect()
}

/// Is `term` present in `hay` as a whole word (not inside a longer word)?
fn has_word(hay: &str, term: &str) -> bool {
    let mut from = 0;
    while let Some(i) = hay[from..].find(term) {
        let a = from + i;
        let b = a + term.len();
        let before = hay[..a].chars().next_back().map_or(true, |c| !c.is_alphanumeric());
        let after = hay[b..].chars().next().map_or(true, |c| !c.is_alphanumeric() || (c == '.' && hay[b + 1..].chars().next().map_or(true, |d| !d.is_alphanumeric())));
        if before && after { return true; }
        from = a + term.len().max(1);
    }
    false
}

pub fn match_job(a: &Value) -> R {
    let text = s(a, "text");
    if text.trim().len() < 20 {
        return Err("paste the job description (at least a couple of sentences)".into());
    }
    let jd = text.to_lowercase();
    let me = load("me");
    let g = graph::build();

    // vocabulary: built-in terms plus the labels of every technology the profile knows
    let mut vocab: Vec<String> = COMMON.iter().map(|x| x.to_string()).collect();
    for n in g.nodes.iter().filter(|n| n.kind == "tech") { vocab.push(n.label.to_lowercase()); }
    vocab.sort();
    vocab.dedup();

    let avoid_rules: Vec<String> = arr(&me["positioning"]["avoid"]).iter().filter_map(|x| x.as_str().map(String::from)).collect();
    let no_evidence: Vec<String> = arr(&me["skills"]["no_evidence"]).iter().filter_map(|x| x.as_str().map(String::from)).chain(arr(&me["claim_gaps"]).iter().map(|c| s(c, "name").to_string())).collect();

    // skills you listed count as evidence too, not only scanned technologies
    let skills: Vec<String> = ["strong", "working"].iter().flat_map(|k| arr(&me["skills"][*k]).iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>())
        .chain(arr(&me["positioning"]["skill_order"]).iter().filter_map(|x| x.as_str().map(String::from))).collect();
    let alias = |t: &str| -> Vec<String> {
        let mut v = vec![t.to_string()];
        for (a, b) in [("postgresql", "postgres"), ("golang", "go"), ("nodejs", "node"), ("nextjs", "next"), ("kubernetes", "k8s"), ("javascript", "js"), ("typescript", "ts")] {
            if t == a { v.push(b.to_string()); }
            if t == b { v.push(a.to_string()); }
        }
        v
    };
    let mut found: Vec<Value> = vec![];
    for term in &vocab {
        if term.len() < 2 || !has_word(&jd, term) { continue; }
        let t = norm(term);
        // evidence: technology nodes whose label matches, with how widely they are used
        let ev: Vec<&graph::Node> = g.nodes.iter().filter(|n| n.kind == "tech" && { let l = norm(&n.label); l == t || (t.len() > 3 && (l.contains(&t) || t.contains(&l) && l.len() > 3)) }).collect();
        let avoided = avoid_rules.iter().any(|r| r.to_lowercase().split(|c: char| !c.is_alphanumeric() && c != '+' && c != '#').any(|w| !w.is_empty() && norm(w) == t));
        let unproven = no_evidence.iter().any(|n| { let x = norm(n); x == t || (x.len() > 3 && t.len() > 3 && (x.contains(&t) || t.contains(&x))) });
        let skill = skills.iter().find(|sk| { let x = norm(sk); alias(&t).iter().any(|a| a.len() > 1 && (x == *a || (a.len() > 3 && x.contains(a.as_str())) || x.split(|c: char| !c.is_alphanumeric()).any(|w| w == a))) });
        let (status, why) = if avoided { ("avoid", "your profile says not to lead with this".to_string()) }
            else if unproven && ev.is_empty() && skill.is_none() { ("gap", "listed as a claim you can't back".to_string()) }
            else if ev.is_empty() && skill.is_some() { ("backed", format!("{} (a skill you listed)", skill.unwrap())) }
            else if !ev.is_empty() {
                let n = ev[0];
                let used = n.facts.iter().find(|(k, _)| k == "projects").map(|(_, v)| format!("{v} projects")).unwrap_or_else(|| "in your stack".into());
                ("backed", format!("{} ({used})", n.label))
            } else { ("gap", "not found anywhere in your profile".to_string()) };
        found.push(json!({"term": term, "status": status, "evidence": why, "node": ev.first().map(|n| n.id.clone())}));
    }
    // longest terms first so "next.js" is not also reported as "js"
    found.sort_by(|x, y| s(x, "status").cmp(s(y, "status")).then(s(x, "term").cmp(s(y, "term"))));
    let backed = found.iter().filter(|x| s(x, "status") == "backed").count();
    let gaps = found.iter().filter(|x| s(x, "status") == "gap").count();
    let avoid = found.iter().filter(|x| s(x, "status") == "avoid").count();
    let scored = backed + gaps;
    Ok(json!({"score": if scored == 0 { 0 } else { backed * 100 / scored }, "backed": backed, "gaps": gaps, "avoid": avoid, "requirements": found,
              "note": "Only technologies and tools are matched. Judge experience level and soft requirements yourself."}))
}
