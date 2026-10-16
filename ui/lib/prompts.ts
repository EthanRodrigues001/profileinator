/** Ready-to-paste prompts for any MCP-capable agent (Claude, ChatGPT, Cursor...) connected to the `hq` server. */
export type AgentPrompt = { id: string; title: string; when: string; text: string };

/** The one prompt a new user needs: works with or without pasted text. */
export const SETUP_PROMPT = `Use the hq MCP server (my personal profile memory) to set up my whole profile in one go.
1. Call brief, then onboarding, and follow its checklist.
2. If I pasted a resume, LinkedIn text or notes below, import everything from it first; otherwise interview me one section at a time.
3. Store every answer with the typed tools (set_identity, add_link, add_experience, add_education, add_achievement, add_skill, set_positioning, set_answer, update_project). Never invent facts: leave unknown things empty and ask me.
4. Call onboarding again after each section, finish with graph_stats, and tell me what is still missing.

My notes (optional): `;

export const PROMPTS: AgentPrompt[] = [
  {
    id: "setup",
    title: "Set up my whole profile",
    when: "First run. The agent interviews you one section at a time.",
    text: `Use the hq MCP server to set up my profile. Call brief, then onboarding, and follow its checklist one section at a time: ask me each question, store my answers with the typed tools (set_identity, add_link, add_experience, add_education, add_achievement, set_positioning, add_skill, set_answer), and call onboarding again after each section. Never invent facts: if I don't know something, leave it empty. When done, call graph_stats and tell me what is still missing.`,
  },
  {
    id: "paste",
    title: "Import from my resume or LinkedIn text",
    when: "Paste your resume or LinkedIn About/Experience text after the prompt.",
    text: `Use the hq MCP server. Read the text below and store everything in it as structured data: set_identity, add_link, add_experience (one per role, with highlights, stack and learned), add_education (with courses and activities), add_achievement, add_tech. Use only what the text says. Call onboarding first so you don't duplicate what exists, list anything ambiguous before saving it, and finish with graph_stats.

--- paste your text here ---`,
  },
  {
    id: "add",
    title: "Add a role, project or achievement",
    when: "Anytime something new happens.",
    text: `Use the hq MCP server. I want to add this to my profile: <describe it>. Check with ask that it isn't stored yet, store it with the matching typed tool (add_experience, add_project, add_achievement, add_education), then confirm what the graph now connects it to with graph_explain.`,
  },
  {
    id: "form",
    title: "Fill a job application",
    when: "Open the form, then paste this into an agent that can use your browser.",
    text: `Use the hq MCP server to fill this application. Call autofill for the standard fields, ask me about everything in "missing" and store my answers with set_answer, use ask for anything role-specific, and never claim a skill listed under claim gaps or no_evidence. Show me the final answers before submitting.`,
  },
  {
    id: "tailor",
    title: "Tailor my resume to a job",
    when: "Paste the job description after the prompt.",
    text: `Use the hq MCP server. Call brief with full=true, then ask for the evidence behind each requirement in the job description below. Write a one-page resume using only stored facts, favour pinned projects that match, and list the requirements I cannot honestly claim.

--- paste the job description here ---`,
  },
];
