---
name: skill-creator
description: "Create or update OpenClaw skills — SKILL.md authoring, skill_workshop proposal lifecycle, simulation testing, and iteration. Use when the user wants to capture a reusable workflow, build a new skill, improve an existing skill, or understand OpenClaw skill structure and deployment."
---

# Skill Creator

A skill for creating skills. Covers the full lifecycle: capture intent → draft → test → propose via `skill_workshop` → apply → validate → iterate.

Triggers: "make a skill for X", "capture this as a skill", "how do I create a skill", "add a skill that does Y", "update the X skill".

---

## When to Create a Skill

Create a skill when:
- A workflow recurs across sessions and is worth encoding as standing instructions
- The agent needs to reliably follow a specific procedure without re-explanation
- A workflow has real edge cases, auth flows, or step sequences worth capturing
- Multiple agents or team members need the same behavior

Skip it when the task is one-off, the workflow is trivially simple, or the encoding cost outweighs the reuse benefit.

---

## Capture Intent

**From a conversation:** Extract the workflow from the transcript first — tools used and in what sequence, corrections the user made mid-flow, input/output formats observed, edge cases that surfaced. The user confirms gaps before you proceed.

**Fresh start:** Interview the user. Key questions (one at a time):
1. What should this skill enable the agent to do?
2. When should it trigger? What phrases would a user say?
3. What's the expected output format?
4. Are there dependencies (binaries, env vars, APIs)?
5. Should deterministic steps live in a script?

Gather enough to write a complete draft. Don't write test cases until you understand the intent.

---

## OpenClaw Skill Shape

```text
skill-name/
  SKILL.md              required
  references/           optional — docs, patterns, deep context (loaded as needed)
  scripts/              optional — deterministic Bun/TS or shell helpers
  assets/               optional — templates, images, output resources
  examples/             optional — worked examples
  templates/            optional — reusable text/config templates
```

### SKILL.md anatomy

```markdown
---
name: my-skill
description: "What it does and when to use it. Keep under 160 bytes."
---

# My Skill

[Workflow body]
```

Required frontmatter: `name` and `description`. Everything else is optional.

### Progressive disclosure

Skills load in three tiers:
1. **Metadata** (name + description) — always in context; costs ~97 chars + field lengths per skill
2. **SKILL.md body** — loaded when skill triggers; keep under 500 lines
3. **Reference files** — loaded as needed by the agent; unlimited depth

Push long examples, API docs, and deep patterns into `references/`. Keep the body focused on what the agent needs to act immediately.

---

## Built-in Tools

These tools are always available in every OpenClaw session. Reference them by name in skill instructions so the agent knows exactly how to execute. Do not confuse these with optional integrations (MCP servers, external CLIs) that may or may not be configured.

| Tool | Use for |
|---|---|
| `exec` | Shell commands, file ops, run scripts. `host=sandbox` for untrusted code, `pty=true` for TTY UIs. Never use `exec sleep` for timing. |
| `browser` | Web automation. Always `profile="openclaw"` — never `"chrome"`. |
| `web_search` / `web_fetch` | Search the web or fetch a URL as markdown. |
| `cron` | Schedule reminders and recurring tasks. The right tool for anything time-based. |
| `message` | Send to Discord, Slack, WhatsApp, Telegram, Signal channels and users. |
| `nodes` | Camera, screen capture, location, invoke commands on paired devices. |
| `sessions_spawn` | Spawn isolated or forked subagents. Use `sessions_yield` to wait for completion. |
| `canvas` | Render interactive UI — charts, forms, dashboards. |
| `memory_search` / `memory_get` | Search and read the agent's memory files. |
| `skill_workshop` | Skill proposal lifecycle (create / revise / apply). See below. |
| `Read`, `Write`, `Edit`, `apply_patch` | File operations in the workspace. |
| `image_generate`, `tts`, `pdf`, `music_generate`, `video_generate` | Media generation. |
| `gateway` | Config changes and gateway restart. |
| `image` | Analyze images with vision. |
| `session_status` | Current session model, usage, cost. |

When writing skill instructions, tell the agent which tool to reach for and why. Vague instructions produce vague behavior.

---

## Writing the Body

**Use imperative form.** "Fetch the URL with `web_fetch`", "Write results to `output/data.json` using `Write`", "Run the validator with `exec`". Not "you should fetch" or "you can use".

**Explain the why.** Models respond better to understanding than rigid rules. Instead of "ALWAYS rate-limit requests", write: "Rate-limit with bottleneck — sites typically 429 after more than 5 req/sec, and a blocked scrape means starting over." The why makes the instruction generalize; the rule alone doesn't.

**Keep the body under 500 lines.** Move detailed patterns, schemas, and deep examples into `references/`. Put a clear pointer in the body: "For the full auth flow, see `references/browser-auth.md`."

**Define output formats explicitly.** When the skill produces a specific structure, show the exact template:

```markdown
## Report format
Always use this structure:
# [Title]
## What was collected
## Coverage gaps
## Sample records (2–3 examples)
```

**Don't repeat what the base model already knows.** Skip generic advice about "being thorough" or "checking your work". Encode what's non-obvious: brittle command syntax, auth caveats, step ordering that matters, tool-specific gotchas.

---

## The skill_workshop Lifecycle

OpenClaw uses a governed proposal → apply flow for all skill changes. **Never write SKILL.md files directly with `Write`, `Edit`, `exec`, or shell commands.** The `skill_workshop` tool hashes content, runs security scanning, and writes rollback metadata before any live file changes. It is the only safe path.

### Creating a proposal

```
skill_workshop(
  action: "create",
  name: "my-skill",
  description: "Short, specific trigger description. Under 160 bytes.",
  proposal_content: "... full SKILL.md body markdown ..."
)
```

With support files (references, scripts, assets):

```
skill_workshop(
  action: "create",
  name: "my-skill",
  description: "...",
  proposal_content: "...",
  support_files: [
    { path: "references/patterns.md", content: "..." },
    { path: "scripts/helper.ts", content: "..." }
  ]
)
```

Returns a `proposal_id`. Keep it — you need it to revise, inspect, or apply.

### Revising a proposal

```
skill_workshop(
  action: "revise",
  proposal_id: "<id>",
  proposal_content: "... updated SKILL.md body ...",
  support_files: [...]   // include ALL support files, not just changed ones
)
```

Revise before applying whenever simulation reveals gaps or the user gives feedback.

### Updating an existing skill

```
skill_workshop(
  action: "update",
  skill_name: "existing-skill",
  description: "Updated description if changing",
  proposal_content: "... updated SKILL.md body ..."
)
```

Use `update` (not `create`) when the target skill already exists. Update proposals bind to the current skill hash and become stale if the live skill changes after proposal creation.

### Inspecting and listing proposals

```
skill_workshop(action: "list")
skill_workshop(action: "inspect", proposal_id: "<id>")
```

---

## Testing Before Apply (Simulate → Apply)

Before calling apply, walk through 2–3 realistic test prompts manually.

**Simulation steps:**
1. Read the proposal content you just wrote
2. Pick test prompts that represent real user requests — not abstract ("use the skill") but concrete ("download all product listings from example.com and save to output/")
3. Mentally follow the skill's instructions for each prompt — step by step, as if you were an agent receiving them
4. Check: Are steps clear and unambiguous? Does the agent know which tool to reach for? Are edge cases covered? Does the output format make sense?

This is author-bias testing — you wrote the skill so you know what it means. It catches outright gaps: missing steps, ambiguous tool choices, unclear output format, wrong sequencing.

**After apply — higher-confidence validation:**

Spawn an isolated subagent with a test prompt. Don't give it any extra context — just the prompt.

```
sessions_spawn(
  task: "<realistic test prompt for this skill>",
  context: "isolated"
)
```

Compare how the subagent approaches it against what the skill intended. If it diverges significantly, revise and re-apply.

---

## Applying a Proposal

```
skill_workshop(
  action: "apply",
  proposal_id: "<id>"
)
```

**Approval modes:**

- **`approvalPolicy: "pending"` (production default):** The apply call triggers an approval prompt in the chat interface before the file is written. On Discord, this surfaces as a native approval card — tap approve in Discord, no SSH required.
- **`approvalPolicy: "auto"`:** The apply proceeds without a prompt. Appropriate for development and workshop environments where you trust the proposal. Set in `openclaw.json` under `skills.workshop.approvalPolicy`.

After apply, the skill is live in `<workspace>/skills/<name>/SKILL.md`. It becomes active on the next agent turn (or sooner if the skills watcher detects the change).

Limits to know: description cap 160 bytes; body cap 40,000 bytes (configurable via `skills.workshop.maxSkillBytes`); 64 support files per proposal; 256 KB per support file; 2 MB total support files.

---

## Iteration Loop

1. Draft proposal → simulate 2–3 test prompts → revise if gaps found → apply
2. Validate with a real test turn or isolated `sessions_spawn`
3. If the skill needs improvement: `skill_workshop(action: "update")` → revise → apply
4. Repeat until the skill reliably handles its target prompts

Keep iterations small. One focused revision is easier to evaluate than a full rewrite.

---

## Autonomous Proposals

When `skills.workshop.autonomous.enabled: true` in `openclaw.json`, OpenClaw can proactively propose skills from durable conversation patterns — without being asked. The agent spots recurring workflows and drafts proposals automatically. They still need apply; nothing goes live without the gate. Off by default. Useful for "teach the agent about recurring workflows" over time.

---

## Description Quality

The description is the primary triggering mechanism — it determines when the agent reaches for this skill. Bad descriptions mean skills that never activate or activate on the wrong things.

See `references/description-guide.md` for the 160-byte cap, token cost formula, good/bad examples, and manual iteration approach.

Short version: be specific about what the skill does AND when to use it. Include realistic trigger phrases. Lean slightly "pushy" — if the skill is relevant, the description should make that obvious to the agent, not leave it ambiguous.

---

## Gating

When a skill has real dependencies — binaries on PATH, env vars, config flags — use `metadata.openclaw` to gate it. Skills with unmet gates are hidden from the agent: they don't burn tokens, don't confuse triggering, don't appear in the agent's skill list.

See `references/gating.md` for the full `metadata.openclaw` schema including `requires.bins`, `requires.env`, `requires.config`, OS filters, and installer specs.

---

## Scripting

For deterministic, repetitive steps — data extraction, format conversion, validation, bulk operations — write a Bun/TypeScript helper in `scripts/` rather than encoding the logic in prose. Scripts run without being loaded into context, saving tokens. They're also reusable and testable independently.

See `references/scripting.md` for CLI patterns, Bun conventions, and when to choose a script over prose.

---

## ClawHub

To publish a completed skill to the public registry for others to install: see [ClawHub docs](https://clawhub.openclaw.ai). Out of scope here.

---

## Anti-Patterns

- **Never write SKILL.md directly with `Write`/`Edit`/`exec`.** Always `skill_workshop`. It's the only safe path.
- **Don't write vague descriptions.** "Helps with tasks" triggers nothing. Be specific about what the skill does and when.
- **Don't cram everything into the body.** Descriptions over 160 bytes are truncated. Bodies over 500 lines burn tokens on every trigger. Push depth into `references/`.
- **Don't skip simulation.** An untested skill that confuses the agent is worse than no skill.
- **Don't use `exec sleep` for timing.** Use `cron` for anything time-based.
- **Don't use `profile="chrome"` in browser.** Always `profile="openclaw"`.
- **Don't apply without reading the proposal.** The scanner catches security issues; you catch logic gaps.
- **Don't encode what the base model already knows.** Brittle auth flows, tool-specific gotchas, step ordering that matters — yes. Generic advice about being careful — no.
