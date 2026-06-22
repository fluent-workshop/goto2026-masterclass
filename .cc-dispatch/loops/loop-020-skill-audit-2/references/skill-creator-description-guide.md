# Description Guide

The `description` frontmatter field is the primary triggering mechanism for OpenClaw skills. The agent scans skill descriptions at the start of each session and decides whether to consult a skill based on its description. Getting this right determines whether your skill actually fires.

---

## Hard Constraints

- **160-byte hard cap.** Descriptions over 160 bytes are rejected by `skill_workshop`. Count bytes, not characters (ASCII = 1 byte each; multi-byte Unicode chars cost more).
- **No multi-line values.** The frontmatter parser accepts single-line descriptions only. No YAML block scalars.
- **Must be quoted.** Always quote the value: `description: "..."` not `description: ...`

---

## Token Cost Formula

Every eligible skill adds tokens to every agent turn. The cost is deterministic:

```
total_overhead = 195 + Σ per_skill
per_skill      = 97 + len(name) + len(description) + len(filepath)
```

At ~4 chars/token, a skill with a 100-char description costs roughly **50 tokens per turn**. With 20 skills loaded, that's ~1,000 tokens per turn in overhead — before you've written a single word of your message.

**Keep descriptions short and specific.** Vague filler ("helps with various tasks") wastes tokens without improving triggering.

---

## What Makes a Good Description

The agent sees a list of skill names + descriptions and decides which (if any) to load for the current task. It won't load a skill "just in case." The description has to make the relevance obvious.

**Three things a good description does:**

1. **States what the skill does** — concrete, not abstract. "Extracts structured data from websites via browser exploration → HTTP batch extraction" beats "helps with web data".
2. **Names when to use it** — include trigger contexts or phrases. "Use when the user asks to scrape, crawl, extract, or download data from a URL" is better than leaving it implied.
3. **Leans slightly pushy** — if the skill is relevant, the description should make that obvious. Undertriggering (agent ignores the skill when it should use it) is a more common failure than overtriggering.

---

## Good vs. Bad Examples

### Too vague
```yaml
description: "Helps with data extraction tasks."
```
Agent sees: "helps with ... tasks" — could apply to almost anything. Won't trigger reliably.

### Better
```yaml
description: "Scrape and extract structured data from websites — browser exploration, DOM signal detection, HTTP batch extraction, auth handling, rate limiting, and output reporting."
```
Agent sees: specific capability, specific techniques, specific output. Triggers when the user asks about scraping.

### With trigger phrases
```yaml
description: "Create or update OpenClaw skills — SKILL.md authoring, skill_workshop proposal lifecycle, simulation testing, and iteration. Use when the user wants to capture a reusable workflow, build a new skill, or improve an existing skill."
```
Explicit "use when" clause. Leaves no ambiguity about when this skill applies.

### Overcrowded (over 160 bytes — will be rejected)
```yaml
description: "A comprehensive skill for all your web scraping needs including browser automation, structured data extraction from HTML pages using CSS selectors, API endpoint discovery, authentication handling with session cookies and CSRF tokens, rate limiting, retry logic, and output formatting in JSON, CSV, and markdown formats."
```
Count the bytes. This won't even make it into skill_workshop.

---

## Manual Iteration Approach

Without an automated description optimizer, use this loop:

1. **Write your first description.** Aim for 80–120 bytes — leaves room to iterate.
2. **Pick 5 trigger prompts** — realistic things a user would say that should activate this skill.
3. **Pick 3 should-not-trigger prompts** — adjacent tasks that share keywords but need something different.
4. **Ask the agent:** "Given this skill description, would you load this skill for: [prompt]?" — informal, conversational test.
5. **Revise** based on where triggering fails. Add explicit trigger contexts for missed cases. Remove ambiguous language that causes false triggers.
6. Apply the revised description via `skill_workshop(action: "update")`.

Focus on **near-misses** in both directions. "Scrape product data from a website" should trigger a web-scraping skill. "Summarize this website's content" probably shouldn't — it's a different intent even though both touch URLs.

---

## Trigger Phrase Patterns

Include at least one "use when" clause with concrete trigger contexts:

```yaml
description: "Build Wardley maps for strategy and architecture decisions. Use when the user asks to map, visualize, or analyze competitive positioning, technology evolution, or system dependencies."
```

```yaml
description: "Daily briefing compilation and TTS audio production. Use when generating, rendering, or re-rendering the daily briefing, or when the user asks about today's news, digest, or morning update."
```

```yaml
description: "Send messages and manage channels across Discord, Slack, WhatsApp, Telegram, and Signal. Use when the user asks to send, draft, post, or schedule a message on any messaging platform."
```

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| No trigger context — skill never fires | Add "use when the user asks to..." clause |
| Too abstract — skill fires on unrelated tasks | Name the specific domain, tools, or output format |
| Over 160 bytes — rejected by skill_workshop | Cut generic filler; move examples to the body |
| Duplicate of another skill's description | Differentiate explicitly; name when to pick THIS skill over the other |
| Present tense capabilities only, no trigger signal | Add one "use when" clause with concrete user phrases |
