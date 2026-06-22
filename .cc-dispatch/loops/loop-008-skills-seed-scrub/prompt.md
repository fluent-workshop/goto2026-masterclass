# loop-008 — Skills Seed Scrub

Read `references/MERGED-REVIEW.md` first — it contains the full de-duplicated findings from two independent blind reviews (Codex + Claude Code). Everything below flows from that.

## Context

The `skills/` directory at the repo root is a curated OpenClaw skill set being pre-seeded onto 14 student Hetzner VPS boxes for a GOTO 2026 masterclass. Students are software engineers; these skills guide the AI agent on their machine. The skills were adapted from the author's personal workspace and still contain personal data, personal paths, and macOS-specific assumptions that will break on Ubuntu.

**This loop is pure file editing — no new functionality, no new scripts, no commits touching anything outside `skills/`.** The goal is to make the seed set safe to ship to strangers.

## Phase A — Remove and de-PII (do first, commit as one atomic commit)

### A0: Drop secret-scan entirely
Delete `skills/secret-scan/` — the whole directory. It is a trufflehog wrapper that defaults to a macOS Homebrew path (`/opt/homebrew/bin/trufflehog`) that doesn't exist on Ubuntu and silently returns "no secrets found" when the binary is missing. Not worth the footgun in a classroom.

### A1: Fix cc-dispatch WORKSPACE constant
`skills/cc-dispatch/scripts/cc-dispatch.ts:38`
```ts
// BEFORE
const WORKSPACE = "/Users/openclaw/.openclaw/workspace";
// AFTER — derive from script location (same pattern adhd.ts:32 already uses)
const WORKSPACE = process.env.OPENCLAW_WORKSPACE
  ?? resolve(import.meta.dir, "../../..");
```
Also update `lib/brief.ts:157` if it references `WORKSPACE` directly.

### A2: Remove DEFAULT_REPO
`skills/cc-dispatch/scripts/cc-dispatch.ts:39` and `lib/cli.ts:89`
Remove `const DEFAULT_REPO = "divideby0/evie"`. Where it's used as a fallback, throw a clear error instead: `throw new Error("--repo is required. Example: --repo owner/repo or use --issue-url")`.
Also remove any `divideby0/evie` from `cc-dispatch.ts:443` list() fallback.

### A3: Replace "Cedric" in active hook strings
`skills/cc-dispatch/scripts/hooks/notify.ts:191,193,195`
Replace every occurrence of "Cedric" with `process.env.OPENCLAW_OPERATOR_NAME ?? "the operator"`.
Also replace in `skills/cc-dispatch/SKILL.md:98` and `skills/cc-dispatch/references/internals.md:19,22` — in docs, use "the operator" (static, not a variable).

### A4: Personal Notion IDs in specdocs
`skills/specdocs/SKILL.md:74-75` — replace the two database IDs with `<YOUR_PRD_DATABASE_ID>` and `<YOUR_ADR_DATABASE_ID>`.
`skills/specdocs/templates/rfd-template.md:4-5` — replace Notion template/DB URLs with `# Notion template: <YOUR_RFD_TEMPLATE_URL>` comment placeholders.

### A5: 1Password vault paths in scripting + skill-creator
`skills/scripting/SKILL.md:40,76,89,94` and `skills/scripting/references/bun-template.md:13,35,156`
Replace `op://Openclaw/EVIE - Service Name/password` with `op://<vault>/<item>/password`.
Remove the "EVIE - Title Case" naming convention instruction entirely — just say "use a consistent naming convention for your vault items."
`skills/skill-creator/references/browser-auth-to-http.md:144,150` — same replacement.

### A6: Delete dead legacy hook shells
Delete `skills/cc-dispatch/hooks/stop.sh`, `skills/cc-dispatch/hooks/session-end.sh`, `skills/cc-dispatch/hooks/task-completed.sh`. These are documented as "reference only" but ship personal `/src/spantree/` paths, `trifork-elevate` references, and macOS-only `md5 -q`.

### A7: product-manager _meta.json
Delete `skills/product-manager/_meta.json` — it leaks `trifork-elevate/csf-explorer-prototype` as the source repo.

### A8: Full sweep
After A1–A7, run this and fix everything it finds:
```bash
grep -r "Cedric\|/Users/openclaw\|divideby0\|EVIE -\|trifork-elevate\|op://Openclaw\|Seb called\|Sebastian's\|2026-04-09" skills/ --include="*.md" --include="*.ts" --include="*.sh" --include="*.json" -l
```
For each file: replace personal names with "the author" or remove the line entirely. Replace personal paths with generic examples. Replace internal dates/references with neutral text.

**Commit A:** `chore(skills): de-PII seed set — remove personal paths, names, vault refs`

## Phase B — Code quality

### B1: Gate --dangerously-skip-permissions in adhd.ts
`skills/adhd/scripts/adhd.ts:189`
Change the `claude -p` invocation to only include `--dangerously-skip-permissions` when `process.env.ADHD_ALLOW_DANGEROUS === "1"`. When not set, omit the flag and add a comment: "# students: set ADHD_ALLOW_DANGEROUS=1 to enable permission bypass".

### B2: Tolerate missing .mcp.json in adhd.ts
`skills/adhd/scripts/adhd.ts` near line 33 where `MCP_CONFIG` is set.
Before passing `--mcp-config` to the claude invocation, check if the file exists:
```ts
const mcpConfigArg = existsSync(MCP_CONFIG) ? ["--mcp-config", MCP_CONFIG] : [];
```
Then spread `mcpConfigArg` into the args array instead of always including `--mcp-config`.

### B3: Audit and mark cross-references to missing integrations
Open each of the following files and add a callout block near the top of any section that references tools not in the seed set. Use this format:
```md
> **Note:** This section references [sonarqube / coderabbit / notion / exa / @evie/lib — pick the right ones].
> These integrations are **not included** in the masterclass workspace. Skip or adapt as needed.
```

Files to update (from MAJOR M3 in the merged review):
- `skills/code-review/SKILL.md` — sections referencing sonarqube, coderabbit, codex CLI
- `skills/scripting/SKILL.md` — sonarqube example, `@evie/lib` import convention
- `skills/scripting/references/bun-template.md` — `@evie/lib` imports
- `skills/adhd/SKILL.md` — exa/ref/firecrawl/serena/research/knowledge references
- `skills/grill-me/SKILL.md` — ticktick, notion references
- `skills/specdocs/SKILL.md` — notion sync section

For `@evie/lib` specifically: in `skills/scripting/SKILL.md` and `bun-template.md`, replace `import { getSecret } from "@evie/lib/secrets"` with `process.env.MY_API_KEY` pattern as the primary example. Add a note: "`@evie/lib` is an internal library not available in this workspace."

### B4: install-hooks safety
`skills/cc-dispatch/scripts/cc-dispatch.ts` near line 530.
Add a confirmation prompt before writing to `~/.claude/settings.json`:
```ts
console.log(`\nThis will modify your global Claude Code settings at ~/.claude/settings.json`);
console.log(`Hook path: ${hookScript}`);
const confirmed = await promptConfirm("Continue? [y/N] ");
if (!confirmed) { console.log("Aborted."); process.exit(0); }
```
Also back up the existing file before writing: `cp ~/.claude/settings.json ~/.claude/settings.json.bak-<timestamp>`.

### B5: Standardize --to vs --target in notify.ts
`skills/cc-dispatch/scripts/hooks/notify.ts:167-170`
Check which flag `openclaw message send` actually accepts. If it's `--to`, change `--target` to `--to`. If both are accepted, keep `--to` (consistent with everything else).
Run `openclaw message send --help 2>&1 | grep -E "\-\-to|\-\-target"` to confirm.

**Commit B:** `chore(skills): fix Ubuntu portability, gate dangerous flags, mark optional integrations`

## Phase C — Polish sweep

Quick sweep of remaining minors:
- `skills/specdocs/SKILL.md:14` — remove "Seb called this out on 2026-04-09" line
- `skills/specdocs/SKILL.md:94` — replace "Adapted from Sebastian's cc-skills" with neutral text
- `skills/cc-dispatch/scripts/lib/brief.ts:153-162` — the injected constraints ("Use `@evie/lib`", "Incremental migrations only", "Use `trash` over `rm`") are Evie-specific house rules. Replace with a neutral placeholder comment: `// TODO: customize these constraints for your project`
- `skills/cc-dispatch/sonar-project.properties` — rename `evie-skill-cc-dispatch` key and `Evie Skill` name to `cc-dispatch` / `CC Dispatch Skill`
- `skills/humanizer/TTS.md:56` — replace `github.com/divideby0/repo` with `github.com/owner/repo`

**Commit C:** `chore(skills): polish sweep — remove internal refs, neutralize templates`

## Verification

After all three phases, run:
```bash
grep -r "Cedric\|/Users/openclaw\|divideby0\|EVIE -\|trifork-elevate\|op://Openclaw" skills/ 2>/dev/null
```
Must return 0 lines. If anything remains, fix it before stopping.

Also confirm:
```bash
ls skills/secret-scan 2>/dev/null && echo "FAIL: secret-scan still exists" || echo "OK: secret-scan removed"
ls skills/cc-dispatch/hooks/*.sh 2>/dev/null && echo "FAIL: dead hooks still exist" || echo "OK: dead hooks removed"
```

## Out of scope
- No changes outside `skills/`
- No new skill files or directories
- No changes to skill logic or functionality — only PII removal, portability fixes, and cross-ref annotations
- No TypeScript refactoring beyond the specific items above
