//! Knowledge graph about the person, derived from profile.json (never stored separately, so it can't drift), plus retrieval:
//! lexical match (with a small thesaurus) and local semantic match are fused with reciprocal-rank fusion to pick seed nodes,
//! then the answer is widened along edges. Every edge records whether it was `stated` in the data or `derived` by matching.
use crate::embed;
use crate::store::*;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};

pub struct Node {
    pub id: String,
    pub kind: &'static str,
    pub label: String,
    pub text: String,
    pub facts: Vec<(String, String)>,
    /// Where this lives in profile.json, so a client can `set` it.
    pub src: String,
}
pub struct Edge {
    pub a: usize,
    pub b: usize,
    pub rel: &'static str,
    pub how: &'static str,
}
pub struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    ids: HashMap<String, usize>,
    /// per node: (neighbour, edge index)
    pub adj: Vec<Vec<(usize, usize)>>,
}

// ---------- text helpers ----------
fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}
/// Names that are the same technology spelled differently collapse to one key.
fn canon(name: &str) -> String {
    let k = norm(name);
    match k.as_str() {
        "postgresql" | "neonpostgres" => "postgres".into(),
        "tailwindcss" => "tailwind".into(),
        "nextdotjs" => "nextjs".into(),
        "nodedotjs" => "nodejs".into(),
        "googlegeminiapi" | "geminiapi" | "googlegemini" => "gemini".into(),
        "framermotion" => "motion".into(),
        "reactjs" => "react".into(),
        "vercelaisdkgemini" => "aisdk".into(),
        _ => k,
    }
}
/// "Python (scikit-learn, XGBoost)" -> Python, scikit-learn, XGBoost; "Expo / React Native" -> Expo, React Native.
fn parts(name: &str) -> Vec<String> {
    let mut out = vec![];
    for chunk in name.split(['(', ')', '+', ',']) {
        let sides: Vec<&str> = chunk.split('/').map(str::trim).collect();
        // "PyTorch/Keras" is two things, "shadcn/ui" is one
        if sides.len() > 1 && sides.iter().all(|s| s.chars().count() > 2 && !s.eq_ignore_ascii_case("ui")) {
            out.extend(sides.iter().map(|s| s.to_string()));
        } else if !chunk.trim().is_empty() {
            out.push(chunk.trim().to_string());
        }
    }
    out.into_iter().filter(|p| !p.is_empty()).collect()
}
fn word_hit(hay: &str, needle: &str) -> bool {
    !needle.is_empty() && hay.match_indices(needle).any(|(i, m)| {
        let before = i == 0 || !hay[..i].chars().next_back().is_some_and(char::is_alphanumeric);
        let after = !hay[i + m.len()..].chars().next().is_some_and(char::is_alphanumeric);
        before && after
    })
}
fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}…", s.chars().take(n).collect::<String>().trim_end()) }
}
fn list(v: &Value) -> Vec<String> {
    arr(v).iter().filter_map(|x| x.as_str().map(String::from)).collect()
}

// ---------- building ----------
impl Graph {
    fn add(&mut self, kind: &'static str, key: &str, label: &str, text: &str, src: &str) -> usize {
        let id = format!("{kind}:{}", if key.is_empty() { norm(label) } else { key.to_string() });
        if let Some(&i) = self.ids.get(&id) {
            if !text.is_empty() && !self.nodes[i].text.contains(text) {
                self.nodes[i].text.push_str(" · ");
                self.nodes[i].text.push_str(text);
            }
            return i;
        }
        self.nodes.push(Node { id: id.clone(), kind, label: label.to_string(), text: text.to_string(), facts: vec![], src: src.to_string() });
        self.adj.push(vec![]);
        self.ids.insert(id, self.nodes.len() - 1);
        self.nodes.len() - 1
    }
    fn fact(&mut self, i: usize, k: &str, v: &str) {
        if !v.is_empty() && !self.nodes[i].facts.iter().any(|(a, _)| a == k) {
            self.nodes[i].facts.push((k.into(), v.into()));
        }
    }
    fn link(&mut self, a: usize, b: usize, rel: &'static str, how: &'static str) {
        if a == b || self.edges.iter().any(|e| e.a == a && e.b == b && e.rel == rel) {
            return;
        }
        let ei = self.edges.len();
        self.edges.push(Edge { a, b, rel, how });
        self.adj[a].push((b, ei));
        self.adj[b].push((a, ei));
    }
    fn techs(&mut self, name: &str, src: &str) -> Vec<usize> {
        parts(name).iter().map(|p| self.add("tech", &canon(p), p, "", src)).collect()
    }
    fn find(&self, kind: &str, key: &str) -> Option<usize> {
        self.ids.get(&format!("{kind}:{key}")).copied()
    }
}

pub fn build() -> Graph {
    let (me, pr) = (load("me"), load("projects"));
    let mut g = Graph { nodes: vec![], edges: vec![], ids: HashMap::new(), adj: vec![] };
    let id = &me["identity"];
    let root = g.add("person", "me", if s(id, "name").is_empty() { "Me" } else { s(id, "name") },
        &format!("{} {} {} {}", s(id, "headline"), s(id, "summary"), s(id, "location"), s(&me, "target")), "me/identity");
    for k in ["location", "email", "pronouns", "headline", "legal_name"] {
        g.fact(root, k, s(id, k));
    }
    if !s(&me, "target").is_empty() || !s(&me["positioning"], "direction").is_empty() {
        let dir = if s(&me["positioning"], "direction").is_empty() { s(&me, "target") } else { s(&me["positioning"], "direction") };
        let goal = g.add("goal", "target", "Target role", dir, "me/positioning/direction");
        g.link(root, goal, "TARGETS", "stated");
    }

    // links
    for (i, l) in arr(&me["links"]).iter().enumerate() {
        let n = g.add("link", &norm(s(l, "id")), s(l, "label"), &format!("{} {}", s(l, "url"), s(l, "note")), &format!("me/links/{i}"));
        g.fact(n, "url", s(l, "url"));
        g.link(root, n, "HAS_LINK", "stated");
    }

    // experience
    for (i, e) in arr(&me["experience"]).iter().enumerate() {
        let label = format!("{} @ {}", s(e, "role"), s(e, "org"));
        let text = format!("{} {} {}–{} {} work: {} learned: {} {}", s(e, "type"), s(e, "mode"), s(e, "start"), s(e, "end"), s(e, "location"),
            list(&e["highlights"]).join("; "), list(&e["learned"]).join("; "), s(e, "note"));
        let r = g.add("experience", &format!("{i}"), &label, &text, &format!("me/experience/{i}"));
        for (k, v) in [("type", s(e, "type")), ("start", s(e, "start")), ("end", s(e, "end")), ("visibility", s(e, "visibility"))] {
            g.fact(r, k, v);
        }
        g.link(root, r, "HELD", "stated");
        let org = g.add("org", &norm(s(e, "org")), s(e, "org"), "", &format!("me/experience/{i}/org"));
        g.link(r, org, "AT", "stated");
        for t in list(&e["stack"]) {
            for ti in g.techs(&t, &format!("me/experience/{i}/stack")) {
                g.link(r, ti, "USED", "stated");
            }
        }
        for t in list(&e["learned"]) {
            for ti in g.techs(&t, &format!("me/experience/{i}/learned")) {
                g.link(r, ti, "LEARNED", "stated");
            }
        }
    }

    // education (+ positions held there)
    for (i, e) in arr(&me["education"]).iter().enumerate() {
        let label = format!("{} {}", s(e, "degree"), s(e, "field")).trim().to_string();
        let text = format!("{} at {} {}–{} {} {} courses: {} {}", s(e, "level"), s(e, "school"), s(e, "start"), s(e, "end"), s(e, "status"), s(e, "semester"),
            list(&e["courses"]).join(", "), list(&e["highlights"]).join("; "));
        let ed = g.add("education", &format!("{i}"), &label, &text, &format!("me/education/{i}"));
        g.link(root, ed, "STUDIED", "stated");
        let school = g.add("org", &norm(s(e, "school")), s(e, "school"), "", &format!("me/education/{i}/school"));
        g.link(ed, school, "AT", "stated");
        for c in list(&e["courses"]) {
            for ti in g.techs(&c, &format!("me/education/{i}/courses")) {
                g.link(ed, ti, "COVERED", "stated");
            }
        }
        for (j, a) in arr(&e["activities"]).iter().enumerate() {
            let role = g.add("experience", &format!("edu{i}-{j}"), &format!("{} @ {}", s(a, "role"), s(a, "org")), s(a, "note"), &format!("me/education/{i}/activities/{j}"));
            g.link(ed, role, "HAD_ROLE", "stated");
            g.link(root, role, "HELD", "stated");
            if !s(a, "org").is_empty() {
                let club = g.add("org", &norm(s(a, "org")), s(a, "org"), "", &format!("me/education/{i}/activities/{j}/org"));
                g.link(role, club, "AT", "stated");
                g.link(club, school, "PART_OF", "derived");
            }
        }
    }

    // achievements
    for (i, a) in arr(&me["achievements"]).iter().enumerate() {
        let (title, kind, date, note) = if a.is_string() { (text(a), String::new(), String::new(), String::new()) } else { (s(a, "title").into(), s(a, "kind").into(), s(a, "date").into(), s(a, "note").into()) };
        let n = g.add("achievement", &format!("{i}"), &title, &format!("{kind} {date} {note}"), &format!("me/achievements/{i}"));
        g.fact(n, "kind", &kind);
        g.fact(n, "date", &date);
        g.link(root, n, "EARNED", "stated");
    }

    // evidence-based stack
    let mut areas: HashMap<String, usize> = HashMap::new();
    for (i, t) in arr(&me["stack"]).iter().enumerate() {
        let ti = g.add("tech", &canon(s(t, "name")), s(t, "name"), &format!("{} {} tier {} used in {} projects", s(t, "category"), s(t, "note"), s(t, "tier"), t["projects"]), &format!("me/stack/{i}"));
        for (k, v) in [("tier", s(t, "tier")), ("area", s(t, "category")), ("first_seen", s(t, "first_seen")), ("last_used", s(t, "last_used"))] {
            g.fact(ti, k, v);
        }
        if t["projects"].is_number() {
            g.fact(ti, "projects", &t["projects"].to_string());
        }
        if !s(t, "category").is_empty() {
            let area = *areas.entry(s(t, "category").into()).or_insert_with(|| g.add("area", &norm(s(t, "category")), s(t, "category"), "technology area", ""));
            g.link(ti, area, "IN_AREA", "stated");
        }
    }
    for g_ in ["strong", "working", "no_evidence"] {
        for (i, name) in list(&me["skills"][g_]).iter().enumerate() {
            for ti in g.techs(name, &format!("me/skills/{g_}/{i}")) {
                g.fact(ti, "claim", g_);
            }
        }
    }
    for (i, name) in list(&me["positioning"]["skill_order"]).iter().enumerate() {
        for ti in g.techs(name, &format!("me/positioning/skill_order/{i}")) {
            g.fact(ti, "rank", &format!("{} of your honest skill order", i + 1));
        }
    }

    // projects
    if let Some(map) = pr.as_object() {
        for (name, p) in map {
            let text = format!("{} {} {} {} {} {} {} {}", s(p, "tagline"), s(p, "desc"), s(p, "summary"), s(p, "category"), s(p, "status"), s(p, "when"), s(p, "note"), list(&p["bullets"]).join("; "));
            let pn = g.add("project", &norm(name), name, &text, &format!("projects/{name}"));
            for (k, v) in [("category", s(p, "category")), ("visibility", s(p, "visibility")), ("primary", s(p, "primary")), ("site", if s(p, "live_url").is_empty() { s(p, "homepage") } else { s(p, "live_url") }),
                ("when", s(p, "when")), ("local_path", s(p, "local_path"))] {
                g.fact(pn, k, v);
            }
            if p["pinned"] == true {
                g.fact(pn, "pinned", "yes (on resume and profile)");
            }
            for t in list(&p["stack"]) {
                for ti in g.techs(&t, &format!("projects/{name}/stack")) {
                    g.link(pn, ti, "USES", "stated");
                }
            }
            if !s(p, "primary").is_empty() {
                let ti = g.add("tech", &canon(s(p, "primary")), s(p, "primary"), "", "");
                g.link(pn, ti, "WRITTEN_IN", "derived");
            }
            if !s(p, "category").is_empty() {
                let area = g.add("area", &norm(s(p, "category")), &format!("{} projects", s(p, "category")), "project category", "");
                g.link(pn, area, "IN", "stated");
            } else {
                // not categorised in the data: group by what GitHub says, so no repo floats alone
                let (key, label) = if p["fork"] == true { ("forks", "Forks") } else if p["private"] == true { ("privaterepos", "Private repos") } else { ("otherrepos", "Other repos") };
                let area = g.add("area", key, label, "repositories without a category", "");
                g.link(pn, area, "IN", "derived");
            }
        }
    }
    // tech -> projects named in its `recent` list
    for t in arr(&me["stack"]) {
        let Some(ti) = g.find("tech", &canon(s(t, "name"))) else { continue };
        for r in list(&t["recent"]) {
            let k = norm(r.split('(').next().unwrap_or(&r));
            if k.len() < 3 { continue; }
            if let Some(pi) = g.find("project", &k).or_else(|| (0..g.nodes.len()).find(|&i| g.nodes[i].kind == "project" && k.len() >= 5 && (norm(&g.nodes[i].label).starts_with(&k) || k.starts_with(&norm(&g.nodes[i].label))))) {
                g.link(ti, pi, "EVIDENCED_BY", "derived");
            }
        }
    }
    // experience/organisation that is the same thing as a project (LYX UI the role, Lyx-Ui the repo)
    let orgs: Vec<usize> = (0..g.nodes.len()).filter(|&i| g.nodes[i].kind == "org").collect();
    for o in orgs {
        let k = norm(&g.nodes[o].label);
        if k.len() < 4 { continue; }
        let hit = (0..g.nodes.len()).find(|&i| g.nodes[i].kind == "project" && (norm(&g.nodes[i].label) == k || (norm(&g.nodes[i].label).starts_with(&k) && k.len() >= 5)));
        if let Some(pi) = hit { g.link(o, pi, "SAME_AS", "derived"); }
    }

    // listed skills that nothing else links to
    let loose: Vec<usize> = (0..g.nodes.len()).filter(|&i| g.nodes[i].kind == "tech" && g.adj[i].is_empty()).collect();
    for ti in loose {
        g.link(root, ti, "LISTS", "stated");
    }

    // claims with no evidence
    for (i, c) in arr(&me["claim_gaps"]).iter().enumerate() {
        let n = g.add("claim", &format!("{i}"), &format!("Claim: {}", s(c, "name")), &format!("listed on {} evidence: {} action: {}", s(c, "where"), s(c, "evidence"), s(c, "action")), &format!("me/claim_gaps/{i}"));
        g.fact(n, "action", s(c, "action"));
        g.link(root, n, "SHOULD_NOT_CLAIM", "stated");
        for ti in g.techs(s(c, "name"), "") {
            g.link(n, ti, "ABOUT", "derived");
        }
    }

    // standard answers (a preference or fact per key, answered or not)
    for (k, v) in me["answers"].as_object().into_iter().flatten() {
        let val = if v.is_null() { "unanswered".to_string() } else { text(v) };
        let n = g.add("answer", &norm(k), &k.replace('_', " "), &val, &format!("me/answers/{k}"));
        g.fact(n, "value", &val);
        g.link(root, n, "ANSWERS", "stated");
    }

    // things to avoid, and decisions made in past chats; both link to whatever they mention
    let mentionable: Vec<(usize, String)> = g.nodes.iter().enumerate().filter(|(_, n)| matches!(n.kind, "tech" | "project" | "org") && n.label.chars().count() >= 4).map(|(i, n)| (i, n.label.to_lowercase())).collect();
    for (i, a) in list(&me["positioning"]["avoid"]).iter().enumerate() {
        let n = g.add("avoid", &format!("{i}"), a, "avoid claiming or doing this", &format!("me/positioning/avoid/{i}"));
        g.link(root, n, "AVOIDS", "stated");
        for (ti, lab) in &mentionable {
            if word_hit(&a.to_lowercase(), lab) { g.link(n, *ti, "MENTIONS", "derived"); }
        }
    }
    for (i, l) in read_log().iter().enumerate().filter(|(_, l)| s(l, "kind") != "change") {
        let txt = s(l, "text");
        let n = g.add("decision", &format!("{i}"), &clip(txt, 70), &format!("{} {} {txt}", s(l, "kind"), s(l, "date")), &format!("log/{i}"));
        g.link(root, n, "DECIDED", "stated");
        for (ti, lab) in &mentionable {
            if word_hit(&txt.to_lowercase(), lab) { g.link(n, *ti, "MENTIONS", "derived"); }
        }
    }
    g
}

// ---------- retrieval ----------
const STOP: &[&str] = ["a", "an", "the", "of", "and", "or", "for", "with", "in", "on", "to", "is", "are", "was", "what", "which", "who", "how", "do", "does", "did", "i", "my", "me", "have", "has", "had", "about", "any", "tell", "show", "list", "give", "that", "this", "from", "by", "at", "it", "be", "can", "you", "your"].as_slice();

/// Words a question may use that the data states differently. Each entry widens a query term into related terms at half weight.
const THESAURUS: &[(&str, &[&str])] = &[
    ("backend", &["server", "api", "express", "node", "fastapi", "postgres", "neon", "drizzle", "database", "firebase", "appwrite", "supabase"]),
    ("frontend", &["ui", "react", "next", "tailwind", "shadcn", "css", "component", "design"]),
    ("ai", &["llm", "gemini", "agent", "agents", "ml", "machine", "learning", "model", "sdk", "xgboost"]),
    ("ml", &["machine", "learning", "xgboost", "scikit", "pandas", "pytorch", "keras", "model", "prediction"]),
    ("database", &["postgres", "neon", "drizzle", "firebase", "supabase", "mongodb", "sql", "redis", "dexie"]),
    ("mobile", &["expo", "native", "nativewind", "android", "ios", "app"]),
    ("desktop", &["tauri", "electron", "rust", "app"]),
    ("devops", &["vercel", "docker", "aws", "ci", "github", "deploy", "actions"]),
    ("cloud", &["vercel", "aws", "docker", "deploy"]),
    ("research", &["intern", "internship", "model", "ml"]),
    ("leadership", &["lead", "head", "mentor", "mentored", "club"]),
    ("mentoring", &["mentor", "mentored", "junior", "juniors", "head", "club"]),
    ("mentor", &["mentored", "junior", "juniors", "head", "club", "lead"]),
    ("education", &["btech", "degree", "school", "college", "sem", "student"]),
    ("college", &["btech", "degree", "education", "student"]),
    ("study", &["btech", "degree", "school", "college", "sem", "education", "student"]),
    ("studied", &["btech", "degree", "school", "college", "sem", "education", "student"]),
    ("university", &["btech", "degree", "education"]),
    ("job", &["experience", "role", "freelance", "intern", "company", "work"]),
    ("work", &["experience", "role", "freelance", "intern", "company"]),
    ("career", &["experience", "role", "target", "freelance", "intern"]),
    ("hackathon", &["competition", "ideathon", "event", "achievement"]),
    ("award", &["achievement", "competition", "hackathon"]),
    ("contact", &["email", "phone", "link", "linkedin", "github"]),
    ("weakness", &["claim", "evidence", "avoid", "gap"]),
    ("gap", &["claim", "evidence", "avoid"]),
    ("strength", &["core", "strong", "regular", "tier"]),
    ("expert", &["core", "strong", "tier"]),
    ("salary", &["expected", "ctc", "compensation", "answer"]),
    ("visa", &["work", "authorization", "answer"]),
    ("relocate", &["relocation", "willing", "answer"]),
];

/// Words that name a kind of node. "backend experience" should lead with roles and projects, not just technologies.
const KIND_WORDS: &[(&str, &str)] = &[
    ("experience", "experience"), ("job", "experience"), ("role", "experience"), ("work", "experience"), ("intern", "experience"), ("internship", "experience"),
    ("project", "project"), ("built", "project"), ("build", "project"), ("app", "project"), ("shipped", "project"),
    ("skill", "tech"), ("tech", "tech"), ("technology", "tech"), ("stack", "tech"), ("tool", "tech"), ("language", "tech"),
    ("education", "education"), ("degree", "education"), ("college", "education"), ("study", "education"),
    ("achievement", "achievement"), ("award", "achievement"), ("hackathon", "achievement"), ("competition", "achievement"),
    ("claim", "claim"), ("link", "link"), ("answer", "answer"), ("decision", "decision"), ("avoid", "avoid"),
];

/// Edit distance between two short words.
fn lev(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i];
        for j in 1..=b.len() {
            cur.push((prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1])));
        }
        prev = cur;
    }
    prev[b.len()]
}

fn stem(w: &str) -> String {
    for suf in ["ing", "ed", "es", "s"] {
        if w.len() > suf.len() + 3 && w.ends_with(suf) {
            return w[..w.len() - suf.len()].to_string();
        }
    }
    w.to_string()
}
fn words(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric() && !matches!(c, '.' | '+' | '#')).map(|w| w.trim_matches('.').to_string()).filter(|w| w.len() >= 2).collect()
}

/// Query terms with weights: the user's own words at 1.0, thesaurus expansions at 0.5.
fn query_terms(q: &str) -> Vec<(String, f32)> {
    let mut out: Vec<(String, f32)> = vec![];
    for w in words(q).into_iter().filter(|w| !STOP.contains(&w.as_str())) {
        let st = stem(&w);
        for (k, rel) in THESAURUS {
            if *k == st || *k == w {
                out.extend(rel.iter().map(|r| (r.to_string(), 0.5)));
            }
        }
        out.push((st, 1.0));
    }
    let mut seen = HashSet::new();
    out.retain(|(t, _)| seen.insert(t.clone()));
    out
}

pub struct Hit {
    pub idx: usize,
    pub score: f32,
}

/// Rank nodes for a question: lexical channel, optional semantic channel, fused by reciprocal rank.
pub fn rank(g: &Graph, q: &str) -> (Vec<Hit>, String) {
    rank_with(g, q, true)
}

/// `semantic = false` is for resolving a typed node name: a typo should say "no match", not return the nearest meaning.
pub fn rank_with(g: &Graph, q: &str, semantic: bool) -> (Vec<Hit>, String) {
    let mut terms = query_terms(q);
    let n = g.nodes.len() as f32;
    let label_words: Vec<Vec<String>> = g.nodes.iter().map(|x| words(&x.label).iter().map(|w| stem(w)).collect()).collect();
    let text_words: Vec<Vec<String>> = g.nodes.iter().map(|x| words(&format!("{} {}", x.text, x.facts.iter().map(|(k, v)| format!("{k} {v}")).collect::<Vec<_>>().join(" "))).iter().map(|w| stem(w)).collect()).collect();
    let hit = |ws: &[String], t: &str| ws.iter().any(|w| w == t || (t.len() >= 3 && w.starts_with(t)));
    // typo tolerance: a word that matches nothing is replaced by its closest words in the data (within 1-2 edits)
    let vocab: HashSet<&str> = label_words.iter().chain(text_words.iter()).flatten().map(String::as_str).collect();
    let mut fixed: Vec<(String, String)> = vec![];
    let mut extra: Vec<(String, f32)> = vec![];
    for (t, w) in &terms {
        let known = (0..g.nodes.len()).any(|i| hit(&label_words[i], t) || hit(&text_words[i], t));
        if *w < 1.0 || known || t.chars().count() < 5 {
            continue;
        }
        let max = if t.chars().count() >= 8 { 2 } else { 1 };
        let mut best: (usize, Vec<&str>) = (usize::MAX, vec![]);
        for v in &vocab {
            if v.chars().count().abs_diff(t.chars().count()) > max { continue; }
            let d = lev(t, v);
            if d <= max {
                if d < best.0 { best = (d, vec![v]); } else if d == best.0 { best.1.push(v); }
            }
        }
        best.1.sort();
        for v in best.1.iter().take(3) { extra.push((v.to_string(), 0.8)); }
        if let Some(v) = best.1.first() { fixed.push((t.clone(), v.to_string())); }
    }
    terms.extend(extra);
    let df: HashMap<&str, f32> = terms.iter().map(|(t, _)| (t.as_str(), (0..g.nodes.len()).filter(|&i| hit(&label_words[i], t) || hit(&text_words[i], t)).count() as f32)).collect();
    let qn = norm(q);
    let mut lex: Vec<(usize, f32)> = (0..g.nodes.len()).filter_map(|i| {
        let mut sc = 0.0;
        for (t, w) in &terms {
            let idf = (1.0 + n / (1.0 + df[t.as_str()])).ln();
            if hit(&label_words[i], t) { sc += w * idf * 3.0 } else if hit(&text_words[i], t) { sc += w * idf }
        }
        if !qn.is_empty() && norm(&g.nodes[i].label) == qn { sc += 20.0 }
        (sc > 0.0 && g.nodes[i].kind != "person").then_some((i, sc))
    }).collect();
    lex.sort_by(|a, b| b.1.total_cmp(&a.1));

    // semantic channel (skipped quietly when the local model isn't available)
    let items: Vec<(String, String)> = g.nodes.iter().map(|x| (x.id.clone(), clip(&format!("{} ({}): {}", x.label, x.kind, x.text), 500))).collect();
    let mut mode = "lexical only".to_string();
    let mut sem: Vec<(usize, f32)> = vec![];
    if let Some(vecs) = semantic.then(|| embed::vectors(&items)).flatten() {
        if let Some(qv) = embed::embed(&[q.to_string()]).and_then(|mut v| v.pop()) {
            sem = (0..g.nodes.len()).filter(|&i| g.nodes[i].kind != "person").filter_map(|i| vecs.get(&g.nodes[i].id).map(|v| (i, embed::cosine(&qv, v)))).filter(|(_, c)| *c > 0.15).collect();
            sem.sort_by(|a, b| b.1.total_cmp(&a.1));
            if std::env::var("HQ_DEBUG").is_ok() {
                eprintln!("semantic top: {:?}", sem.iter().take(4).map(|(i, c)| (g.nodes[*i].label.clone(), (*c * 100.0).round() / 100.0)).collect::<Vec<_>>());
            }
            let floor = sem.first().map_or(0.0, |(_, c)| (c * 0.7).max(0.28));
            sem.retain(|(_, c)| *c >= floor);
            // static embeddings give an unrelated question a "nearest" node too, so a meaning-only match must be convincing
            // unless the keyword channel agrees with it
            let lexical: HashSet<usize> = lex.iter().map(|x| x.0).collect();
            sem.retain(|(i, c)| *c >= 0.45 || lexical.contains(i));
            mode = format!("lexical + semantic ({})", embed::status());
        }
    }
    let mut fused: HashMap<usize, f32> = HashMap::new();
    for (r, (i, _)) in lex.iter().take(60).enumerate() {
        *fused.entry(*i).or_default() += 1.0 / (60.0 + r as f32);
    }
    for (r, (i, _)) in sem.iter().take(60).enumerate() {
        *fused.entry(*i).or_default() += 1.0 / (60.0 + r as f32);
    }
    if !fixed.is_empty() {
        mode += &format!(" · read as {}", fixed.iter().map(|(a, b)| format!("“{a}”→“{b}”")).collect::<Vec<_>>().join(", "));
    }
    let asked: Vec<&str> = words(q).iter().filter_map(|w| KIND_WORDS.iter().find(|(k, _)| *k == stem(w)).map(|(_, kind)| *kind)).collect();
    let mut hits: Vec<Hit> = fused.into_iter().map(|(idx, score)| Hit { idx, score: if asked.contains(&g.nodes[idx].kind) { score * 1.7 } else { score } }).collect();
    hits.sort_by(|a, b| b.score.total_cmp(&a.score));
    (hits, mode)
}

// ---------- traversal & rendering ----------
fn card(n: &Node) -> String {
    let facts = n.facts.iter().take(5).map(|(k, v)| format!("{k}: {}", clip(v, 60))).collect::<Vec<_>>().join(" · ");
    let body = clip(n.text.trim(), 230);
    [body, facts].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" | ")
}

/// Connections of one node, grouped by relation and direction, each group capped.
fn connections(g: &Graph, i: usize, cap: usize) -> Vec<String> {
    let mut groups: Vec<(String, Vec<String>)> = vec![];
    for &(j, ei) in &g.adj[i] {
        let e = &g.edges[ei];
        let key = format!("{}{}", e.rel, if e.a == i { "→" } else { "←" });
        let lab = format!("{}{}", g.nodes[j].label, if e.how == "derived" { " (derived)" } else { "" });
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, v)) => v.push(lab),
            None => groups.push((key, vec![lab])),
        }
    }
    groups.iter().map(|(k, v)| {
        let shown = v.iter().take(cap).cloned().collect::<Vec<_>>().join(", ");
        format!("{k} {shown}{}", if v.len() > cap { format!(" (+{} more)", v.len() - cap) } else { String::new() })
    }).collect()
}

/// Resolve a user-typed node reference: exact id, exact label, then best lexical match. Ambiguity is reported, not guessed.
pub fn resolve(g: &Graph, q: &str) -> Result<usize, String> {
    if let Some(&i) = g.ids.get(q) {
        return Ok(i);
    }
    let k = norm(q);
    let exact: Vec<usize> = (0..g.nodes.len()).filter(|&i| norm(&g.nodes[i].label) == k || canon(&g.nodes[i].label) == canon(q)).collect();
    if exact.len() == 1 {
        return Ok(exact[0]);
    }
    if exact.len() > 1 {
        // a repo and the org of the same name, or a tech and a project: take the most specific kind
        const PRIORITY: [&str; 12] = ["tech", "project", "experience", "education", "achievement", "claim", "answer", "link", "decision", "avoid", "goal", "org"];
        let best = exact.iter().copied().min_by_key(|&i| PRIORITY.iter().position(|k| *k == g.nodes[i].kind).unwrap_or(99)).unwrap();
        return Ok(best);
    }
    let ranked = rank_with(g, q, false).0;
    let cands: Vec<usize> = ranked.iter().take(5).map(|h| h.idx).collect();
    match cands.as_slice() {
        [] => Err(format!("no node matches “{q}”")),
        [one] => Ok(*one),
        many => {
            // a clear winner is accepted; a near tie is reported so the caller can pick by id
            if ranked.len() >= 2 && ranked[0].score > ranked[1].score * 1.25 {
                return Ok(ranked[0].idx);
            }
            let list = many.iter().take(6).map(|&i| format!("{} [{}] id={}", g.nodes[i].label, g.nodes[i].kind, g.nodes[i].id)).collect::<Vec<_>>().join("\n");
            Err(format!("“{q}” is ambiguous. Pick one by id:\n{list}"))
        }
    }
}

pub fn ask(q: &str, depth: usize, limit: usize, as_json: bool) -> Result<Value, String> {
    let g = build();
    let (hits, mode) = rank(&g, q);
    let want = limit.clamp(1, 20);
    let cap = ((want + 1) / 2).max(2);
    let mut per: HashMap<&str, usize> = HashMap::new();
    let mut seeds: Vec<&Hit> = vec![];
    for h in &hits {
        let c = per.entry(g.nodes[h.idx].kind).or_default();
        if *c < cap && seeds.len() < want { *c += 1; seeds.push(h); }
    }
    for h in &hits {
        if seeds.len() >= want { break; }
        if !seeds.iter().any(|s| s.idx == h.idx) { seeds.push(h); }
    }
    seeds.sort_by(|a, b| b.score.total_cmp(&a.score));
    if seeds.is_empty() {
        let msg = format!("No match for “{q}”. Try other words, `search` for exact paths, or `graph_stats` to see what is stored.");
        // json callers (the UI) always get the same shape, matches or not
        return Ok(if as_json { json!({"mode": mode, "seeds": [], "neighbors": [], "text": msg}) } else { json!(msg) });
    }
    // widen along edges, discounting by distance and skipping the person hub
    let mut reach: HashMap<usize, (f32, usize)> = HashMap::new();
    let seed_set: HashSet<usize> = seeds.iter().map(|h| h.idx).collect();
    for h in &seeds {
        let mut seen: HashMap<usize, usize> = HashMap::from([(h.idx, 0)]);
        let mut dq = VecDeque::from([h.idx]);
        while let Some(u) = dq.pop_front() {
            let d = seen[&u];
            if d >= depth.clamp(1, 3) { continue; }
            for &(v, _) in &g.adj[u] {
                if seen.contains_key(&v) || g.nodes[v].kind == "person" { continue; }
                seen.insert(v, d + 1);
                dq.push_back(v);
                if !seed_set.contains(&v) {
                    let sc = h.score * 0.5f32.powi(d as i32 + 1);
                    let e = reach.entry(v).or_insert((0.0, d + 1));
                    e.0 += sc;
                    e.1 = e.1.min(d + 1);
                }
            }
        }
    }
    let mut near: Vec<(usize, f32, usize)> = reach.into_iter().map(|(i, (s, d))| (i, s, d)).collect();
    near.sort_by(|a, b| b.1.total_cmp(&a.1));
    near.truncate(limit.clamp(1, 20) * 2);

    let mut o = format!("ask “{q}” · {mode} · {} matches\n\n## Matches\n", seeds.len());
    for (r, h) in seeds.iter().enumerate() {
        let n = &g.nodes[h.idx];
        o += &format!("{}. [{}] {} (id {})\n   {}\n", r + 1, n.kind, n.label, n.id, card(n));
        let cons = connections(&g, h.idx, 6);
        if !cons.is_empty() {
            o += &format!("   links: {}\n", cons.iter().take(5).cloned().collect::<Vec<_>>().join(" ; "));
        }
    }
    if !near.is_empty() {
        o += "\n## Also connected\n";
        for (i, _, d) in near.iter().take(limit.clamp(1, 20)) {
            let n = &g.nodes[*i];
            o += &format!("- [{}] {} ({} hop{}) {}\n", n.kind, n.label, d, if *d == 1 { "" } else { "s" }, clip(&card(n), 110));
        }
    }
    o += "\nFollow up with graph_neighbors, graph_path or graph_explain using an id above.\n";
    if as_json {
        // the UI highlights these ids on the graph and shows the same text the MCP tool returns
        return Ok(json!({"mode": mode, "seeds": seeds.iter().map(|h| g.nodes[h.idx].id.clone()).collect::<Vec<_>>(),
                         "neighbors": near.iter().map(|(i, _, _)| g.nodes[*i].id.clone()).collect::<Vec<_>>(), "text": o}));
    }
    Ok(json!(o))
}

pub fn explain(node: &str, as_json: bool) -> Result<Value, String> {
    let g = build();
    let i = resolve(&g, node)?;
    let n = &g.nodes[i];
    if as_json {
        let links: Vec<Value> = g.adj[i].iter().map(|&(j, ei)| {
            let e = &g.edges[ei];
            json!({"rel": e.rel, "dir": if e.a == i { "out" } else { "in" }, "how": e.how, "id": g.nodes[j].id, "label": g.nodes[j].label, "kind": g.nodes[j].kind})
        }).collect();
        return Ok(json!({"id": n.id, "kind": n.kind, "label": n.label, "text": n.text, "facts": n.facts.iter().map(|(k, v)| json!({"k": k, "v": v})).collect::<Vec<_>>(), "src": n.src, "links": links}));
    }
    let mut o = format!("# {} [{}] id {}\n", n.label, n.kind, n.id);
    if !n.text.trim().is_empty() { o += &format!("{}\n", n.text.trim()); }
    for (k, v) in &n.facts { o += &format!("- {k}: {v}\n"); }
    if !n.src.is_empty() { o += &format!("stored at: {} (edit with set)\n", n.src); }
    o += &format!("\n## Connections ({})\n", g.adj[i].len());
    for c in connections(&g, i, 14) { o += &format!("- {c}\n"); }
    Ok(json!(o))
}

pub fn neighbors(node: &str, depth: usize, rel: &str) -> Result<Value, String> {
    let g = build();
    let i = resolve(&g, node)?;
    let depth = depth.clamp(1, 3);
    let mut seen: HashMap<usize, usize> = HashMap::from([(i, 0)]);
    let mut dq = VecDeque::from([i]);
    let mut by_hop: Vec<Vec<String>> = vec![vec![]; depth];
    while let Some(u) = dq.pop_front() {
        let d = seen[&u];
        if d >= depth { continue; }
        for &(v, ei) in &g.adj[u] {
            let e = &g.edges[ei];
            if (!rel.is_empty() && !e.rel.eq_ignore_ascii_case(rel)) || seen.contains_key(&v) || g.nodes[v].kind == "person" { continue; }
            seen.insert(v, d + 1);
            dq.push_back(v);
            by_hop[d].push(format!("{} —{}{}→ {} [{}]{}", g.nodes[u].label, e.rel, if e.a == u { "" } else { " (reverse)" }, g.nodes[v].label, g.nodes[v].kind, if e.how == "derived" { " (derived)" } else { "" }));
        }
    }
    let mut o = format!("# neighbors of {} [{}]{}\n", g.nodes[i].label, g.nodes[i].kind, if rel.is_empty() { String::new() } else { format!(" via {rel}") });
    for (h, v) in by_hop.iter().enumerate() {
        if v.is_empty() { continue; }
        o += &format!("\n## {} hop{} ({})\n", h + 1, if h == 0 { "" } else { "s" }, v.len());
        for l in v.iter().take(40) { o += &format!("- {l}\n"); }
        if v.len() > 40 { o += &format!("- … {} more\n", v.len() - 40); }
    }
    Ok(json!(o))
}

pub fn path(from: &str, to: &str) -> Result<Value, String> {
    let g = build();
    let (a, b) = (resolve(&g, from)?, resolve(&g, to)?);
    let mut prev: HashMap<usize, (usize, usize)> = HashMap::new();
    let mut dq = VecDeque::from([a]);
    let mut seen = HashSet::from([a]);
    while let Some(u) = dq.pop_front() {
        if u == b { break; }
        for &(v, ei) in &g.adj[u] {
            // paths through the person hub connect everything to everything; they say nothing
            if seen.contains(&v) || (g.nodes[v].kind == "person" && v != b) { continue; }
            seen.insert(v);
            prev.insert(v, (u, ei));
            dq.push_back(v);
        }
    }
    if !prev.contains_key(&b) && a != b {
        return Ok(json!(format!("No path between {} and {} (apart from through you).", g.nodes[a].label, g.nodes[b].label)));
    }
    let mut chain = vec![b];
    let mut hops = vec![];
    let mut cur = b;
    while cur != a {
        let (p, ei) = prev[&cur];
        hops.push(ei);
        chain.push(p);
        cur = p;
    }
    chain.reverse();
    hops.reverse();
    let mut o = format!("{} hop{}: {}", hops.len(), if hops.len() == 1 { "" } else { "s" }, g.nodes[chain[0]].label);
    for (k, ei) in hops.iter().enumerate() {
        let e = &g.edges[*ei];
        let forward = e.a == chain[k];
        o += &format!(" —{}{}→ {}{}", e.rel, if forward { "" } else { " (reverse)" }, g.nodes[chain[k + 1]].label, if e.how == "derived" { " (derived)" } else { "" });
    }
    Ok(json!(o))
}

pub fn stats() -> Value {
    let g = build();
    let mut kinds: HashMap<&str, usize> = HashMap::new();
    g.nodes.iter().for_each(|n| *kinds.entry(n.kind).or_default() += 1);
    let mut rels: HashMap<&str, usize> = HashMap::new();
    g.edges.iter().for_each(|e| *rels.entry(e.rel).or_default() += 1);
    let mut hubs: Vec<(usize, usize)> = (0..g.nodes.len()).filter(|&i| g.nodes[i].kind != "person").map(|i| (g.adj[i].len(), i)).collect();
    hubs.sort_by(|a, b| b.cmp(a));
    json!({
        "nodes": g.nodes.len(), "edges": g.edges.len(),
        "derived_edges": g.edges.iter().filter(|e| e.how == "derived").count(),
        "by_kind": kinds, "by_relation": rels,
        "hubs": hubs.iter().take(8).map(|(d, i)| format!("{} [{}] {} links", g.nodes[*i].label, g.nodes[*i].kind, d)).collect::<Vec<_>>(),
        "isolated": (0..g.nodes.len()).filter(|&i| g.adj[i].is_empty()).map(|i| g.nodes[i].label.clone()).collect::<Vec<_>>(),
        "semantic": embed::status(),
    })
}

/// Everything the UI needs to draw the graph.
pub fn export() -> Value {
    let g = build();
    json!({
        "nodes": g.nodes.iter().enumerate().map(|(i, n)| json!({"id": n.id, "kind": n.kind, "label": n.label, "deg": g.adj[i].len()})).collect::<Vec<_>>(),
        "edges": g.edges.iter().map(|e| json!({"a": g.nodes[e.a].id, "b": g.nodes[e.b].id, "rel": e.rel, "how": e.how})).collect::<Vec<_>>(),
    })
}
