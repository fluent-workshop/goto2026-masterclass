# AGENTS.md — GOTO 2026 Masterclass Agent Workspace

This is your workspace. The companion app repo lives at `~/src/goto2026-companion`.
Your tools, skills, and memory files live here in `~/.openclaw/workspace/`.

---

## ⚡ Skills — When and How to Use Them

Your workspace has 11 pre-loaded skills. Each one is a reusable playbook
that tells you *exactly* how to handle a specific type of task. **Before
writing code or improvising a solution, check whether a skill covers it.**

### Quick Reference

| Skill | Invoke when... |
|-------|----------------|
| `humanizer` | Asked to rewrite, polish, or "make this sound more human"; any outbound text going to a real person |
| `code-review` | Asked to review a PR or a commit range; use this to kick off a parallel review pipeline |
| `cc-dispatch` | Delegating a well-scoped coding task to Claude Code in a tmux loop; use for anything > 15 min of work |
| `adhd` | Open-ended design decision where you need divergent ideas first, not a single recommendation |
| `web-scraping` | Asked to scrape, crawl, or extract structured data from a URL |
| `tts` | Asked to speak, read something aloud, or generate audio |
| `grill-me` | User says "grill me on [topic]" — relentless one-question-at-a-time interview mode |
| `product-manager` | Scoping a product decision, writing a roadmap, or prioritizing a backlog |
| `specdocs` | Writing or reviewing a PRD, ADR, or technical spec |
| `skill-creator` | User wants to capture a reusable workflow or build a new OpenClaw skill |
| `scripting` | Writing, refactoring, or reviewing Bun/TypeScript or Python CLI scripts |

### How to load a skill

Skills are at `~/.openclaw/workspace/skills/<name>/SKILL.md`. Read the relevant
one before starting the task — it contains the exact steps, commands, and
conventions to follow.

```
# Example: before doing a code review, read:
~/.openclaw/workspace/skills/code-review/SKILL.md
```

### Updating skills

Skills sync automatically when `goto2026-sync` runs. If you need the latest:

```bash
goto2026-sync
```

---

## First Run

If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure
out who you are, then delete it. You won't need it again.

## Session Startup

Use runtime-provided startup context first. That context may already include:

- `AGENTS.md`, `SOUL.md`, and `USER.md`
- Recent daily memory `memory/YYYY-MM-DD.md`
- `MEMORY.md` when this is the main session

Do not manually re-read startup files unless the provided context is missing
something you need.

## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** `memory/YYYY-MM-DD.md` — raw logs of what happened
- **Long-term:** `MEMORY.md` — curated memories, like a human's long-term memory

Write it down. "Mental notes" don't survive session restarts — files do.

## Make It Yours

This is a starting point. Add your own conventions and rules as you figure
out what works. Push changes back to the repo if they're useful for everyone.
