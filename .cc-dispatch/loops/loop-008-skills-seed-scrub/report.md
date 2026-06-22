# Loop 008 — skills-seed-scrub: Report

- **Status:** ✅ COMPLETE — all phases (A, B, C) executed.
- **Repo:** `goto-2026-masterclass` · branch `main`
- **Agent:** Claude Code (Opus 4.8), autonomous
- **Date:** 2026-06-20
- **Scope:** `skills/` only. `dotfiles/`, `infra/`, and all other dirs untouched.
- **Result:** 19 files edited, 9 files deleted. Modified `.ts` files typecheck clean.

## Done-When checks (all pass)

| Check | Result |
|---|---|
| `git grep "divideby0" skills/` | **0** |
| `git grep "/Users/openclaw" skills/` | **0** |
| `git grep "EVIE -" skills/` | **0** |
| `git grep "trifork-elevate" skills/` | **0** |
| `skills/secret-scan/` exists | **no** (deleted) |
| `skills/cc-dispatch/hooks/` exists | **no** (deleted) |
| `skills/product-manager/_meta.json` exists | **no** (deleted) |
| Modified `.ts` files compile | **clean** (cc-dispatch module + adhd.ts) |

Extra sweeps, also 0: `/opt/homebrew`, `openclaw-workspace`, `cedric@`, `Cedric`,
`Sebastian`, `@evie/lib`, `op://Openclaw`, `evie-platform`, word-boundary `evie`.
(The broad case-insensitive "evie" count of 78 was entirely `r**evie**w` substrings.)

## Phase A — De-PII

| # | Item | Status |
|---|---|---|
| F1 (C1) | `cc-dispatch.ts` `WORKSPACE` now `process.env.OPENCLAW_WORKSPACE ?? resolve(import.meta.dir, "../../..")` — no hardcoded macOS path. | ✅ |
| F2 (C2) | Removed `DEFAULT_REPO = "divideby0/evie"`. `parseLaunchInput` now fatals if neither `--repo` nor `--issue-url` resolves a repo. Updated `cli.ts` help + the legacy-tmux fallback (`repo: "unknown"`). | ✅ |
| F3 (C3) | `notify.ts`: "Cedric" → `${operator}` (`OPENCLAW_OPERATOR_NAME` env, fallback "the operator"). Swept `cc-dispatch/SKILL.md` + `references/internals.md` ("Cedric" → "the operator"). | ✅ |
| F4 (C4) | `specdocs/SKILL.md` Notion DB IDs → `<YOUR_PRD_DATABASE_ID>` / `<YOUR_RFD_DATABASE_ID>` + prerequisites note. `rfd-template.md` Notion URLs → `<YOUR_RFD_TEMPLATE_ID>` / `<YOUR_RFD_DATABASE_ID>`. | ✅ |
| F5 (C5) | `op://Openclaw/EVIE - …` → `op://<vault>/<item>/password` across `scripting/SKILL.md`, `bun-template.md`, `browser-auth-to-http.md`. `EVIE -` naming convention removed. | ✅ |
| F6 (M4) | Deleted `cc-dispatch/hooks/` (`stop.sh`, `session-end.sh`, `task-completed.sh`). | ✅ |
| F7 (M7) | Deleted `product-manager/_meta.json` (`trifork-elevate/...`). | ✅ |
| F8 (sweep) | Full tree swept; all target tokens at 0 (table above). | ✅ |

## Phase B — Code Quality

| # | Item | Status |
|---|---|---|
| F9 (M1) | `skills/secret-scan/` deleted entirely (dropped from seed per Cedric's decision). | ✅ |
| F10 (M2) | `adhd.ts`: `--dangerously-skip-permissions` now gated behind `--allow-dangerous` / `ADHD_ALLOW_DANGEROUS_PERMISSIONS=1`. `--mcp-config` omitted when `.mcp.json` is absent (with a stderr notice). MCP tool-name lists in prompts/grounding genericized. | ✅ |
| F11 (M3) | `@evie/lib` removed from `scripting/SKILL.md` + `bun-template.md` → plain env reads (`process.env.X ?? Bun.env.X`, fatal if missing). Dangling cross-refs: prerequisites callouts added to `code-review/SKILL.md` (Codex/SonarQube/CodeRabbit), `scripting/SKILL.md` (SonarQube), `specdocs/SKILL.md` (Notion), `adhd/SKILL.md` (MCPs). Dead skill refs (`skills/coderabbit/SKILL.md`, `skills/calendly/...`) genericized. | ✅ |
| F12 (M5) | `install-hooks` now requires `--confirm` / `ALLOW_HOOK_INSTALL=1` and backs up `~/.claude/settings.json` → `.bak` before writing. Docs updated (SKILL.md, internals.md). | ✅ |
| F13 (M6) | Standardized on `--to` (the convention everything else used). Changed `notify.ts` and `notify.sh` from `--target` → `--to`. | ✅ |
| F14 (m2) | `brief.ts` `buildConstraints` stripped of Evie house rules (`@evie/lib`, "incremental migrations only", "use `trash` over `rm`") → repo-neutral guidance. | ✅ |

## Phase C — Polish

| # | Item | Status |
|---|---|---|
| F15 | `specdocs/SKILL.md`: removed "Seb called this out on 2026-04-09" and "Adapted from Sebastian's cc-skills" (kept neutral upstream attribution). | ✅ |
| F16 | `cc-dispatch/sonar-project.properties`: `evie-skill-cc-dispatch` → `goto-2026-cc-dispatch`, `Evie Skill` → `GOTO 2026 Skill`. | ✅ |
| F17 | `humanizer/TTS.md`: `github.com/divideby0/repo` → `github.com/owner/repo` (also genericized `@evie/lib` example → `@acme/lib`). | ✅ |
| F18 | secret-scan path fix — **SKIPPED** (secret-scan deleted in F9, per spec). | ⏭️ |

## Notes & judgment calls

- **Minimize-churn skills** (`humanizer`, `product-manager`, `grill-me`): touched only
  their listed items. `grill-me` line 137's concrete missing-integration actions
  (Notion/TickTick) were softened to "your notes or task tracker"; the illustrative
  Notion/Valkey prose (lines 38, 174) was left as-is (no PII, design context).
- **"Evie" persona name:** not in the F8 grep contract, but genericized to "the
  orchestrator" in `adhd/` and `code-review/` (not in the minimize-churn list) since it
  directly supports the "don't leak Evie internals" objective — doc text only, no logic
  change.
- **Two pre-existing type errors** in the staged seed were confirmed present in the
  original blobs BEFORE any edit (typechecked the `git show :path` baseline): an
  over-narrow `updateSession` signature and a stale `@ts-expect-error` on `Bun.spawn`'s
  `detached`. Both fixed with type-only changes (widen to `Partial<SessionEntry>`; drop
  the now-unused directive since `bun-types` is pinned `latest` and types `detached`) so
  the modified files compile clean. No behavior change.
- **Left intentionally:** the `Spantree/cc-skills` upstream URL in `specdocs` (legitimate
  public template attribution, not an internal leak) and the example port numbers in
  `TTS.md` / `browser-auth-to-http.md` (non-sensitive, illustrative, in minimize-churn
  files).
- **Install artifacts** (`bun.lock`, `node_modules`) created for typechecking were removed
  / are gitignored; the commit contains only `skills/` changes.

## Commit

Single commit on `main`: `refactor(skills): scrub PII + macOS assumptions from seed`.
The `.cc-dispatch/` dispatch tracking (this report, goal/prompt) is not part of the
scrub commit.
