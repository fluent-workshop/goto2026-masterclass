# Skill Audit Report

Audit target: `skills/adhd`, `skills/cc-dispatch`, `skills/code-review`,
`skills/grill-me`, `skills/humanizer`, `skills/product-manager`,
`skills/scripting`, `skills/specdocs`, and `skills/web-scraping`.

Rubric source: `.cc-dispatch/loops/loop-018-skill-audit/references/`.

## Executive Summary

The skill ecosystem has useful domain knowledge and several strong procedural
workflows, but it is not yet compliant with the skill-creator guidelines. The
highest-risk issue is frontmatter quality: 5 of 9 descriptions exceed the
160-byte hard cap, 6 descriptions are unquoted or multi-line, and one skill name
does not follow the lowercase hyphenated naming convention. These are not style
preferences; the description guide says over-cap descriptions are rejected by
`skill_workshop`, and descriptions are the primary trigger surface.

The second systemic issue is gating. Several skills depend on real binaries,
credentials, or configured integrations (`bun`, `claude`, `tmux`, `codex`,
`coderabbit`/`cr`, `gh`, `jq`, `openclaw`, `uv`, `op`, Playwright-like browser
support, Notion/Linear integrations), but no reviewed skill uses
`metadata.openclaw.requires`. The gating guide says skills with unmet gates
should be hidden so they do not burn tokens, trigger incorrectly, or confuse the
agent.

Progressive disclosure is mixed. Most `SKILL.md` files are under the 500-line
body target, and `cc-dispatch`, `scripting`, `specdocs`, and `web-scraping` use
support files. However, some bodies still carry large pattern catalogs or long
code examples that should move into `references/`, and `cc-dispatch` includes a
vendored `node_modules/` tree inside the skill folder.

Overall health: promising, but frontmatter and gating need a cleanup pass before
these skills can be treated as production-quality OpenClaw skills.

## Score Summary

| Skill | Score | Primary Reason |
|---|---|---|
| `adhd` | Major Rewrite | 640-byte unquoted description, extra frontmatter, ungated core binaries |
| `cc-dispatch` | Needs Polish | Valid length, but no explicit use-when trigger, ungated binaries, bundled `node_modules` |
| `code-review` | Needs Polish | Valid length, but dependency-heavy and ungated; body carries operational details that need references |
| `grill-me` | Needs Polish | Valid length and useful body, but description lacks explicit use-when wording and body has stale/future material |
| `humanizer` | Major Rewrite | 303-byte multi-line description, pattern catalog belongs in references, companion TTS file is not discoverable |
| `product-manager` | Major Rewrite | Invalid skill name, no use-when trigger, wrong metadata namespace, generic body |
| `scripting` | Major Rewrite | 281-byte unquoted description and too much long-form reference content in body |
| `specdocs` | Major Rewrite | 305-byte multi-line description; otherwise strong progressive disclosure |
| `web-scraping` | Major Rewrite | 175-byte unquoted description, extra frontmatter, body near limit with long code examples |

## Cross-Cutting Recommendations

1. Normalize all frontmatter through `skill_workshop`:
   - Quote every `description`.
   - Keep every description under 160 bytes.
   - Put "Use when..." or equivalent trigger contexts in the description itself.
   - Remove non-gating frontmatter fields such as `license`.
   - Rename `Product Manager` to a valid lowercase hyphen name such as
     `product-manager`.

2. Add `metadata.openclaw` only where it is needed:
   - Use `requires.bins` for hard binary dependencies.
   - Use `requires.env` and `primaryEnv` for required API keys.
   - Use `requires.config` for integrations that are controlled by
     `openclaw.json`.
   - Keep `metadata.openclaw` as single-line JSON.

3. Move long examples and catalogs into `references/`:
   - Keep `SKILL.md` focused on trigger-adjacent workflow and routing.
   - Link every reference from `SKILL.md` with clear "read when..." guidance.
   - Add tables of contents to reference files over 100 lines.

4. Prefer scripts for repeatable deterministic work:
   - Skills that repeatedly scaffold, validate, extract, or parse should ship a
     script rather than asking the agent to rewrite logic from prose.
   - Reference scripts with `{baseDir}` so the path resolves regardless of
     current working directory.

5. Remove bundled dependency trees:
   - `skills/cc-dispatch/node_modules/` should not live inside the skill. Keep
     `package.json` and lockfiles if needed; install dependencies outside the
     packaged skill content.

## Per-Skill Findings

## `adhd`

Score: Major Rewrite

Findings:
- Description is 640 bytes, far above the 160-byte hard cap.
- Description is unquoted, while the description guide says descriptions must be
  single-line quoted values.
- Frontmatter includes `license: MIT`; the skill-creator reference says the
  frontmatter should be limited to `name` and `description`, with gating metadata
  used only when needed.
- Core workflow requires `bun` and `claude`; the body also references MCP config
  and repo read access. These are real dependencies and should be gated.
- `scripts/adhd.ts` is a good use of scripting for deterministic orchestration,
  but the script does not include the `/// <reference types="bun-types" />`
  convention shown in the scripting guide.
- Body is under 500 lines and explains the generator/critic split well. The why
  is strong.
- Script invocations use `skills/adhd/scripts/adhd.ts` instead of `{baseDir}`.

Recommendations:
- Replace the description with a quoted under-cap trigger description, for
  example:
  `"Run parallel grounded ideation for open-ended architecture, design, strategy, naming, or fuzzy debugging. Use on /adhd or ADHD mode."`
- Add gating for core binaries, for example:
  `metadata: {"openclaw":{"requires":{"bins":["bun","claude"]}}}`
- Remove `license` from frontmatter; keep attribution in the body or a reference.
- Update command examples to `bun run {baseDir}/scripts/adhd.ts ...`.
- Add the Bun triple-slash type reference to `scripts/adhd.ts`.

## `cc-dispatch`

Score: Needs Polish

Findings:
- Description is 130 bytes, so it passes the hard cap.
- Description is concrete, but it does not explicitly say "Use when..." or name
  realistic trigger requests. The body has a "When to use it" section, but the
  description guide says trigger information belongs in the description because
  the body is loaded only after trigger.
- The skill depends on `bun`, `tmux`, `claude`, and `openclaw`; some paths also
  use `gh`. None are gated with `metadata.openclaw`.
- Progressive disclosure is mostly good: the body is 111 lines and routes to
  `references/goal-scoping.md`, `references/authoring-loops.md`, and
  `references/internals.md`.
- `skills/cc-dispatch/node_modules/` is present inside the skill folder. The
  skill-creator reference says skills should contain only essential support
  files; vendored dependency trees are clutter and packaging risk.
- The script set is appropriate, but several command examples use
  `skills/cc-dispatch/scripts/cc-dispatch.ts` instead of `{baseDir}`.

Recommendations:
- Use an explicit under-cap description, for example:
  `"Dispatch Claude Code in tmux for substantial scoped work: loops, compact/continue handoffs, goal scoping, hooks, notify, and wake."`
- Add gates for required binaries, likely:
  `metadata: {"openclaw":{"requires":{"bins":["bun","tmux","claude","openclaw"]}}}`
  If GitHub issue import is central rather than optional, include `gh`; otherwise
  keep that path explicitly optional in the body.
- Remove `node_modules/` from the skill folder.
- Convert command examples to `{baseDir}` paths.

## `code-review`

Score: Needs Polish

Findings:
- Description is 126 bytes and quoted, so it passes the hard cap.
- Description names PR review requests, but it under-describes the commit-range
  review workflow that the body supports.
- The skill is dependency-heavy: it references `cc-dispatch`, `tmux`, `codex`,
  `sonarqube`, CodeRabbit CLI (`cr`), `jq`, `gh`, npm installation, and GitHub
  authentication. None are represented in `metadata.openclaw`.
- The body correctly explains why blind review matters and why sentinel files are
  preferred over PID polling.
- Much of the Codex, SonarQube, CodeRabbit, and commit-range operational detail
  could be split into references to keep the main body more navigable.
- It references `sessions_spawn` only to reject it for this use case; that is a
  useful tool-specific caveat.

Recommendations:
- Expand the under-cap description slightly to include commit ranges, for
  example:
  `"Run multi-source code review for PRs or commit ranges using CC, Codex, SonarQube, CodeRabbit, and GitHub comments."`
- Decide the minimum viable gated path. If the skill should only appear when the
  full pipeline is available, gate on `bun`, `tmux`, `claude`, `codex`,
  `coderabbit` or `cr`, `gh`, and `jq`. If partial review is acceptable, split
  optional reviewers into references and make the description honest about the
  core path.
- Move detailed reviewer-specific commands into references such as
  `references/codex-review.md`, `references/coderabbit.md`, and
  `references/commit-range-review.md`.
- Replace repo-relative script paths with `{baseDir}` where the skill calls its
  own bundled scripts.

## `grill-me`

Score: Needs Polish

Findings:
- Description is 139 bytes and quoted, so it passes the hard cap.
- Description is concrete, but the trigger phrases live in the body instead of
  the description. The guide says description is the primary trigger surface.
- Body is 174 lines, well under 500, and gives a clear one-question-at-a-time
  workflow with rationale.
- The skill references the `message` tool by name for Discord button output,
  which satisfies the "reference built-in tools" criterion.
- The "Future Directions" section is not operational instruction and should not
  live in `SKILL.md`; the skill-creator reference warns against auxiliary
  process/context documents that do not directly support execution.
- The body says to scan "available tools, skills, and integrations" instead of
  naming common built-in lookup tools. This is intentionally flexible, but it is
  less tool-specific than the writing guide prefers.

Recommendations:
- Use an explicit under-cap description, for example:
  `"Interview the user one question at a time to stress-test plans or decisions. Use on /grill-me or grill me about a topic."`
- Remove or move "Future Directions" out of the skill.
- Keep the dynamic foraging model, but add a short concrete list of built-in tool
  families to check first, such as `memory_search`, `web_search`, and project
  file reads, while preserving the tiered cost model.

## `humanizer`

Score: Major Rewrite

Findings:
- Description is 303 bytes, above the 160-byte hard cap.
- Description uses a YAML block scalar (`description: >`), but the description
  guide says descriptions must be single-line quoted values.
- Body is 326 lines and below the hard 500-line target, but most of it is a long
  47-pattern catalog. The progressive-disclosure guidance says long examples and
  deep patterns should move into `references/`.
- `TTS.md` is a companion file at the skill root with its own frontmatter, but
  `SKILL.md` does not route to it. It is not in `references/`, and it is not a
  valid discoverable skill folder on its own.
- The process is imperative enough, and the body explains why AI text patterns
  matter.
- The body contains many non-ASCII punctuation examples by design. That is
  defensible for this domain, but the skill should distinguish examples from
  output rules clearly.

Recommendations:
- Replace the description with a single-line under-cap version, for example:
  `"Edit text to remove AI-writing tells and make it sound human. Use on humanize, de-slop, make this sound human, or TTS prep."`
- Move the pattern catalog into `references/ai-writing-patterns.md` and keep a
  short detection workflow in `SKILL.md`.
- Move `TTS.md` to `references/tts.md` and add "Read when preparing text for
  voice, podcasts, briefings, or TTS output."
- If the pattern catalog remains over 100 lines, add a table of contents.

## `product-manager`

Score: Major Rewrite

Findings:
- `name: Product Manager` violates the skill naming rule: use lowercase letters,
  digits, and hyphens only.
- Description is 103 bytes but unquoted.
- Description does not include trigger contexts or "Use when..." phrasing.
- Frontmatter uses `metadata: {"clawdbot":...}` instead of the documented
  `metadata.openclaw` schema. The rubric only defines `metadata.openclaw` gates.
- Body is only 49 lines, but it is mostly generic PM advice. The skill-creator
  reference says not to encode what the base model already knows; skills should
  capture non-obvious workflows, edge cases, tool integrations, schemas, or
  output formats.
- The body has no explicit output templates, tool guidance, or decision workflow.

Recommendations:
- Rename the skill to `product-manager` and make the folder/frontmatter match.
- Use a quoted under-cap trigger description, for example:
  `"Guide product discovery, prioritization, roadmaps, and requirements. Use for product strategy or PM tradeoff questions."`
- Remove or convert `metadata.clawdbot`; use `metadata.openclaw` only if there
  are real gates.
- Rebuild the body around concrete PM workflows: discovery interview, PRD input
  gathering, prioritization scoring, roadmap tradeoff review, and stakeholder
  decision memo format.
- Add explicit output formats or templates if this skill is meant to produce PM
  artifacts.

## `scripting`

Score: Major Rewrite

Findings:
- Description is 281 bytes, above the 160-byte hard cap.
- Description is unquoted.
- Body is 329 lines and under 500, but it embeds long Bun and Python examples
  directly. The scripting reference itself says scripts and deep examples belong
  in references when they are long.
- `references/bun-template.md` exists and is useful, but the main body repeats a
  large amount of template-level material instead of routing to the reference.
- The skill includes dependencies and tools such as `bun`, `uv`, `op`, Typer,
  Rich, and SonarQube. As a standards skill, not all should be gates, but the
  optional SonarQube section should be clearly non-gating or moved to a reference.
- The body is mostly imperative and explains why Bun/TypeScript is preferred.

Recommendations:
- Replace the description with a quoted under-cap version, for example:
  `"Write or review Bun/TypeScript skill scripts and CLI helpers. Use for script structure, arg parsing, secrets, and standards."`
- Keep the body to language selection, required conventions, and reference
  routing. Move Python details and SonarQube quality scanning to references.
- Keep `references/bun-template.md` and route to it prominently.
- If future revisions add scripts for validation/scaffolding, gate those scripts
  on `bun` or `uv` as appropriate.

## `specdocs`

Score: Major Rewrite

Findings:
- Description is 305 bytes, above the 160-byte hard cap.
- Description uses a YAML block scalar (`description: >`), but the guide requires
  a single-line quoted description.
- Body is 97 lines and uses templates/references well. This is one of the better
  progressive-disclosure examples in the set.
- Template files and `references/prd-example-excerpt.md` are properly separated
  from the main body.
- The body references optional Notion, GitHub, and Linear workflows. These
  dependencies are explicitly described as optional, but GitHub/Linear tracker
  operations should name exact tools consistently and should be gated if made
  required.
- `templates/rfd-template.md` exists, but the `SKILL.md` description and workflow
  only mention PRDs and ADRs. That makes the bundled RFD template hard to
  discover.

Recommendations:
- Replace the description with a quoted under-cap version, for example:
  `"Draft or review PRDs, ADRs, and project specs from templates. Use for feature scope or technical decision documents."`
- Either add RFD routing to the description/body or remove `templates/rfd-template.md`
  from this skill.
- Keep Notion sync explicitly optional, or gate a separate sync-specific path on
  the relevant integration configuration.
- Add exact tool guidance for GitHub/Linear issue publishing where the workflow
  requires it.

## `web-scraping`

Score: Major Rewrite

Findings:
- Description is 175 bytes, above the 160-byte hard cap.
- Description is unquoted.
- Frontmatter includes `license: MIT`; keep attribution outside frontmatter.
- Body is 439 lines, below 500 but close. It contains long command sequences and
  full code examples that should move into references.
- The skill has one reference, `references/browser-auth.md`, and links it from
  the body. That is good progressive disclosure.
- The body says "Write a script" for batch extraction but does not ship a reusable
  starter script or template. The scripting guide recommends scripts for
  deterministic, repetitive operations.
- It uses tool names such as browser, `curl`, Python, Bun/TypeScript, and
  Playwright/Puppeteer. Built-in browser usage is clear enough, but optional
  external binaries and libraries are not gated.
- The skill asks the user for a working directory before creating files. That may
  be appropriate for broad scraping tasks, but it weakens autonomous execution
  when the user already gave a path or repo context.

Recommendations:
- Replace the description with a quoted under-cap version, for example:
  `"Scrape or extract structured website data. Use for crawling URLs, browser exploration, HTTP extraction, auth, and reporting."`
- Remove `license` from frontmatter and keep attribution in a Source section.
- Move long Phase 5 code examples into references such as
  `references/http-extraction.md` and `references/media-assets.md`.
- Add a reusable extraction script or script template under `scripts/`, especially
  for canary testing, rate-limited fetches, raw cache writes, and report generation.
- Gate only hard dependencies. If the skill requires `curl`, `python3`, or `bun`
  for its default path, declare them. If multiple alternatives are valid, use
  `anyBins`.
