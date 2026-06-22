# Merged Review — skills seed set

**Range:** skills/ (staged, pre-commit) · **Sources:** Codex ✅ CC blind ✅ | CodeRabbit ⬜ (staged, skipped) · SonarQube ⬜ (TS files not yet init'd)
**Date:** 2026-06-20

Both reviewers ran independently with no cross-contamination. Findings below are de-duplicated and cross-attributed. Codex and CC converged on every Critical and most Majors — strong signal.

---

## Verdict

**Not ready to ship as-is.** The scripted skills (cc-dispatch, secret-scan, adhd) are Evie's personal workspace tools with the serial numbers only partially filed off. Three categories of blocker:

1. **Personal data hardcoded in executable paths** — not just docs. `/Users/openclaw`, `divideby0/evie`, and "Cedric" are baked into code that runs on student boxes.
2. **macOS-only assumptions that hard-fail on Ubuntu** — `/opt/homebrew/bin/trufflehog`, `md5 -q`, hardcoded workspace paths.
3. **~12 dangling cross-references** to integrations students won't have (sonarqube, coderabbit, notion, exa, @evie/lib, ticktick, calendly, valkey…).

The instruction-only skills (humanizer, product-manager, grill-me) are the most ship-ready and need only minor cleanup.

---

## CRITICAL

### C1 — `/Users/openclaw/.openclaw/workspace` hardcoded in executable code
**Both reviewers. Highest priority.**
`cc-dispatch/scripts/cc-dispatch.ts:38` — `const WORKSPACE = "/Users/openclaw/.openclaw/workspace"` drives every manifest read/write, log path, and crucially `install-hooks`, which bakes this absolute path into the student's **global** `~/.claude/settings.json`. Every Claude Code session on their Ubuntu box gets a hook pointing at a non-existent macOS path.
`adhd.ts:32` correctly derives its root via `resolve(import.meta.dir, "../../..")` — use that pattern.
**Fix:** derive `WORKSPACE` from `import.meta.dir`, or `process.env.OPENCLAW_WORKSPACE` with a sane fallback. Never hardcode `/Users/openclaw`.

### C2 — `divideby0/evie` as the default launch repo
**Both reviewers.**
`cc-dispatch/scripts/cc-dispatch.ts:39` + `lib/cli.ts:89` + `cc-dispatch.ts:443` — `const DEFAULT_REPO = "divideby0/evie"`. A student running `cc-dispatch launch --task "..."` without `--repo` silently targets the author's private repo.
**Fix:** remove the default entirely. Require `--repo` or `--issue-url`. Error if neither is supplied.

### C3 — "Cedric" hardcoded in active hook notification strings
**Both reviewers.**
`cc-dispatch/scripts/hooks/notify.ts:191,193,195` — live strings sent to the student's Discord on every checkpoint: "Cedric is NOT watching the tmux pane." Also in `cc-dispatch/SKILL.md:98` and `cc-dispatch/references/internals.md:19,22`.
**Fix:** replace with `"the operator"` or parameterize via `OPENCLAW_OPERATOR_NAME` env.

### C4 — Personal Notion database IDs shipped in templates
**Both reviewers.**
`specdocs/SKILL.md:74-75` — "Cedric Personal Research Artifacts" DB ID `3342e80c-...` and EVP ADR DB ID. `specdocs/templates/rfd-template.md:4-5` — direct Notion template + database URLs.
**Fix:** replace with `<YOUR_PRD_DATABASE_ID>` / `<YOUR_RFD_DATABASE_ID>` placeholders. Drop the personal URLs.

### C5 — Personal 1Password vault paths in the scripting convention
**Both reviewers.**
`scripting/SKILL.md:40,76,89,94`; `scripting/references/bun-template.md:13,35,156`; `skill-creator/references/browser-auth-to-http.md:144,150` — `op://Openclaw/EVIE - Service API Key/password` and the `"EVIE - Title Case"` naming convention baked into the template students copy.
**Fix:** genericize to `op://<vault>/<item>/password`. Drop the `EVIE -` prefix entirely.

---

## MAJOR

### M1 — `secret-scan` silently returns "no secrets found" when the scanner fails
**CC (MAJOR-1, MAJOR-2). Most dangerous finding.**
`secret-scan/scripts/lib/trufflehog.ts` — exit code from `Bun.spawn` is never checked. If trufflehog is missing or errors, the function returns `[]` and the script prints "No secrets found." A security tool that silently passes on failure defeats its own purpose. On Ubuntu the default `/opt/homebrew/bin/trufflehog` path doesn't exist, so this failure is guaranteed on every student box.
`secret-scan/scripts/scan.ts:145` — `main()` with no `.catch()`, so spawn ENOENT becomes an unhandled rejection rather than a clean error message.
**Fix:** (a) check `await proc.exited` and throw with stderr on non-zero; (b) default `TRUFFLEHOG_BIN` to bare `"trufflehog"` (PATH resolution); (c) `main().catch((e) => fatal(...))`.

### M2 — `adhd` launches `--dangerously-skip-permissions` unconditionally + missing MCP config
**Both reviewers.**
`adhd/scripts/adhd.ts:189` — `--dangerously-skip-permissions` with no flag/env gate. Also passes `--mcp-config <workspace>/.mcp.json` with hardcoded MCP tool names (exa, ref, firecrawl, serena, basic-memory) that students won't have. Failures are caught per-frame at `:207` so the skill degrades *silently* — returns 0 ideas with no "you're missing MCPs" signal.
**Fix:** gate skip-permissions behind `--allow-dangerous`/`ADHD_ALLOW_DANGEROUS_PERMISSIONS=1`. Tolerate missing `.mcp.json` (omit `--mcp-config` when absent). Document prerequisites clearly.

### M3 — ~12 dangling cross-references to integrations not in the seed set
**Both reviewers.**

| Missing | Referenced in |
|---|---|
| `sonarqube` skill | `scripting/SKILL.md:320-332`, `code-review/SKILL.md:80-83,145` |
| `coderabbit` / `cr` CLI | `code-review/SKILL.md:86-106` |
| `codex` CLI | `code-review/SKILL.md:45-78` |
| `notion` + personal DBs | `specdocs/SKILL.md:48,71-76`, `grill-me/SKILL.md:38,137` |
| `exa`/`ref`/`firecrawl`/`serena`/`basic-memory` MCPs | `adhd/SKILL.md:46,115`, `adhd.ts:79,162` |
| `research`/`knowledge`/`exa` skills | `adhd/SKILL.md:60,118`, `cc-dispatch/SKILL.md:26` |
| `ticktick` | `grill-me/SKILL.md:137` |
| `calendly` + reference impl | `skill-creator/SKILL.md:12`, `skill-creator/references/browser-auth-to-http.md:8,72,188` |
| `valkey` | `grill-me/SKILL.md:174`, `skill-creator/references/browser-auth-to-http.md:123` |
| `@evie/lib` | `scripting/SKILL.md:48,63,69-94`, `bun-template.md`, `lib/brief.ts:157` |

`@evie/lib` is especially critical: the `scripting` skill mandates `import { getSecret } from "@evie/lib/secrets"` for all new scripts. Every script students write per the convention fails to import.
**Fix:** prune or clearly mark sections "requires integrations not in this workspace." Decide the fate of `@evie/lib` — either ship a stub or rewrite the convention to use bare env reads.

### M4 — Legacy hook shells leak personal paths and use macOS-only `md5`
**Both reviewers.**
`cc-dispatch/hooks/{stop.sh,session-end.sh,task-completed.sh}` — documented as "reference only" but ship with `/src/spantree/`, `/src/cedric/`, `trifork-elevate`, `evie-` worktree prefixes, and `md5 -q` (macOS-only). Students won't run them, but they identify the author and will confuse anyone who reads them.
**Fix:** delete from the seed set entirely.

### M5 — `install-hooks` writes to global `~/.claude/settings.json` silently
**CC (in C1), Codex (standalone).**
`cc-dispatch.ts:530-553` — hook install writes an absolute path (broken after C1 fix) into the user's global Claude settings with no confirmation or backup. On a student box this corrupts all their Claude Code sessions.
**Fix:** make hook install explicit (`--confirm` flag), back up `settings.json` first, or scope it to the local repo. Consider shipping `install-hooks` disabled by default in the student workspace.

### M6 — `notify.ts` `--target` vs `--to` flag mismatch
**CC (MIN-1). Worth promoting.**
`notify.ts:167-170` sends `--target`, but the generated brief, SKILL docs, and dispatch use `--to`. Notifications fire-and-forget with errors swallowed — students get no feedback if hooks silently no-op.
**Fix:** verify the correct flag name, standardize across all callers.

### M7 — `product-manager/_meta.json` exposes private client source repo
**Both reviewers.**
`product-manager/_meta.json` — `"source": "trifork-elevate/csf-explorer-prototype"`. Private client/project name.
**Fix:** remove `_meta.json` or replace source with neutral provenance.

---

## MINOR

- **m1** — `specdocs/SKILL.md:14` "Seb called this out on 2026-04-09" and `:94` "Adapted from Sebastian's cc-skills" — internal-team provenance, noise for students.
- **m2** — `cc-dispatch/scripts/lib/brief.ts:153-162` injects Evie-specific constraints into every generated student brief ("Use `@evie/lib`", "Incremental migrations only", "Use `trash` over `rm`"). These are evie-platform house rules; on student repos they're wrong.
- **m3** — `secret-scan/scripts/lib/redact.ts:81-90` — `seen` short-circuit increments `redacted` count without doing a replacement, inflating reported counts. Regex can also over-redact short secrets.
- **m4** — Skills assume `claude` CLI is installed + a Max subscription. Worth a prerequisites note.
- **m5** — `cc-dispatch/sonar-project.properties` uses `evie-skill-cc-dispatch` / `Evie Skill` keys. Rename to course-neutral.
- **m6** — `humanizer/TTS.md:56` uses `github.com/divideby0/repo`. Replace with `github.com/owner/repo`.
- **m7** — `secret-scan/SKILL.md:23,28` and `scan.ts:20` hardcode `~/.openclaw/agents/main/sessions` as the session path with no override.
- **m8** — `cc-dispatch.ts:391` pushes `mention` field not declared in `NotifyEntry` interface.

---

## What's genuinely good (keep)

- **`humanizer`** — comprehensive, self-contained, zero integration dependencies. Most ship-ready skill.
- **`product-manager`** — clean, dependency-free. (Fix `_meta.json` M7.)
- **`grill-me`** — notably **does** document Discord button unreliability with explicit plain-text fallback (`SKILL.md:58,94`). Blemish: TickTick/Notion cross-refs (M3).
- **TypeScript engineering in `cc-dispatch.ts`** — session-name validation, path-traversal guards, one-session-per-cwd locking, TOCTOU-tolerant tmux creation. The engineering is solid; it's portability and PII that block it.

---

## Fix list → loop-008-skills-seed-scrub

**Phase A — De-PII (do first, non-negotiable):**
1. C1: derive WORKSPACE from `import.meta.dir` in cc-dispatch.ts
2. C2: remove `DEFAULT_REPO`, require `--repo`
3. C3: replace "Cedric" in notify.ts + SKILL.md + internals.md with "the operator" / env var
4. C4: replace personal Notion IDs in specdocs with placeholders
5. C5: replace `op://Openclaw/EVIE -` paths with generic examples
6. M4: delete `cc-dispatch/hooks/` dead shell files
7. M7: remove `product-manager/_meta.json`
8. Sweep: `divideby0/`, `trifork-elevate/`, `EVIE -`, internal names in all remaining files

**Phase B — Code quality:**
9. M1: fix secret-scan silent failure (exit code check + PATH binary + `.catch`)
10. M2: gate `--dangerously-skip-permissions` + tolerate missing `.mcp.json`
11. M3: audit all cross-refs; add "requires: [sonarqube, codex, …]" callouts or prune sections; decide `@evie/lib` fate
12. M5: add `--confirm` to `install-hooks`, back up settings.json
13. M6: standardize `--to` vs `--target` in notify.ts

**Phase C — Polish:**
14. Minors m1–m8 as sweep
