---
name: "code-review"
description: "Multi-source code review pipeline: Claude Code, Codex, SonarQube, and CodeRabbit in parallel. Triggered on PR review requests."
---

# Code Review Skill

> **Prerequisites:** this pipeline orchestrates several external reviewers that are
> **not** bundled in this workspace — the Codex CLI (`@openai/codex`), a `sonarqube`
> integration, and the CodeRabbit CLI (`cr`). Each section below is optional; use the
> reviewers you actually have installed. The Claude Code (`cc-dispatch`) path works on
> its own.

## Trigger

Someone posts a PR link in chat and asks you to review it.

## Workflow

### 1. Contextual Pre-Review (immediate)

Before looking at code, gather context (use whatever sources you have):
- **Chat history**: Recent messages in the channel about the project, related discussions
- **Meeting notes**: Any standup/planning notes mentioning the work
- **Project goals**: What's the PR trying to achieve in the broader context?
- **Coding standards**: Known conventions for the repo (linting, architecture patterns)

### 2. Early Analysis (post to thread within ~60s)

Post an initial review in the requesting thread:
- What the PR does (summary from PR description + diff stats)
- How it fits into project goals
- First-pass observations (architecture, patterns, obvious issues)
- Note that deeper reviews are being dispatched

### 3. Dispatch Parallel Reviews

Launch simultaneously:

#### a) Claude Code (via cc-dispatch)
```bash
# Run from the cc-dispatch skill ({baseDir} → that skill's dir)
bun run {baseDir}/scripts/cc-dispatch.ts launch \
  --task "Review PR #N on owner/repo (branch). [detailed instructions]" \
  --repo /path/to/local/repo \
  --notify-session "<calling-session-key>"
```
Focus areas: bugs, code quality, performance, error handling, TypeScript best practices, test coverage.

⚠️ **ALWAYS launch a FRESH cc-dispatch session for review.** Never reuse or compact the active development session — it has context of its own design decisions and cannot review its own work blindly. Reviews go in new sessions; fixes go in the dev session.

#### b) Codex (via tmux + sentinel — preferred over sessions_spawn)

The `sessions_spawn` model="codex" path depends on the Codex OAuth token being
fresh; it fails with a 401 "refresh token already used" when stale. The robust
path is the Codex CLI in a tmux session with a sentinel-file completion marker —
watchable like cc-dispatch, deterministic completion like nohup:

```bash
REVDIR=<reviews-dir>
cat > /tmp/codex-review-prompt.txt <<'EOF'
BLIND CODE REVIEW (independent — you did not write this code). Do NOT modify files;
print a markdown review to stdout, ranked Critical/Major/Minor/Nit with file:line + fix.
[... read these files, architecture context, focus areas ...]
EOF
tmux new -d -s codex-review "cd $PWD && codex exec --skip-git-repo-check \
  -c model_reasoning_effort=high \"\$(cat /tmp/codex-review-prompt.txt)\" \
  > $REVDIR/codex-review.md 2>$REVDIR/codex-review.err; touch $REVDIR/codex-review.done"
```

- **Effort: `high` for code review**, not xhigh. Review is bounded analysis (read N
  files, find defects) — high hits the quality ceiling; xhigh burns tokens/time
  without finding more. Reserve xhigh for generative research/comparison runs.
- **Completion detection:** poll for `$REVDIR/codex-review.done` (cheap, near-instant)
  — do NOT poll `ps` on the PID. Attach with `tmux attach -t codex-review` to watch.
- **Codex writes the file at the END**, not streaming — an empty `codex-review.md`
  mid-run is normal; the `.done` sentinel is the truth.
- **Pre-flight:** `codex --version` + `codex exec "reply with: OK"`. If the binary is
  ENOENT or auth 401s: `npm install -g @openai/codex@latest` then `codex login`
  (browser). The npm global must be under the ACTIVE node version (mise can leave a
  stale copy under an old node).

Known false positive: Codex/CodeRabbit may flag a "missing zod-to-json-schema
  import" for `z.toJSONSchema()` — that's Zod v4's NATIVE method; tell reviewers so
  in the prompt, or reject it at merge.

#### c) SonarQube (via sonarqube skill)
```bash
# Run from the sonarqube skill ({baseDir} → that skill's dir)
bun run {baseDir}/scripts/sonarqube.ts scan /path/to/repo
bun run {baseDir}/scripts/sonarqube.ts issues --project <key> --severity CRITICAL,MAJOR
```

#### d) CodeRabbit CLI (via exec, background)

> ⚠️ **Linux not supported.** The `cr` binary is macOS and Windows only — there is no Linux release. If `command -v cr` fails, skip this step and proceed with the other three sources.

```bash
# Background it — reviews take 7–30 min for large changesets.
# SCOPE IT: cr has a 300-file limit. On a dirty tree or broad base it errors
# "Too many files". Always narrow with --type committed and --dir.
cr --agent --type committed --base <baseref> --dir <subdir> \
  > $REVDIR/coderabbit.ndjson 2>$REVDIR/coderabbit.err &
```
- `--type committed` excludes uncommitted churn; `--dir lib/exa` scopes to the
  subtree under review; `--base <pre-change-commit>` keeps the diff tight.
- Completion: the ndjson ends with `{"type":"complete",...}`. Findings are
  `{"type":"finding",...}` lines (may be 0 — CR is shallow on pure refactors).

Wait for completion, then parse:
```bash
# Group by severity
grep '"type":"finding"' /tmp/cr-findings.ndjson \
  | jq -r '"\(.severity | ascii_upcase)\t\(.fileName)\t\(.codegenInstructions // .comment)"'
```

See the CodeRabbit CLI docs for the full `cr` command reference and output schema.

**CR strengths:** race conditions, null pointer exceptions, memory leaks, SQL injection and security
vulnerabilities, logic errors — the patterns that static analysis often misses.

### 4. Augmented Final Review

Once all four sources report back:
- Merge findings, deduplicate
- Organize by severity: Critical → Major → Minor → Nit
- Attribute source per finding (CC / Codex / SonarQube / CodeRabbit) for traceability
- Cross-reference with contextual knowledge (e.g., "this pattern was discussed in standup and agreed upon")
- Add your own synthesis and recommendations
- Post the final review in the thread

### 5. GitHub Comments (optional)

If the review has specific line-level feedback, post as GitHub PR review comments via `gh`:
```bash
gh pr review <N> --repo owner/repo --comment --body "..."
```

## Reviewing a commit range (not a GitHub PR)

The pipeline also works on a local commit range — e.g. reviewing a cc-dispatch loop's
output before the next loop. Adaptations:

- **Scope = a commit range, not a PR.** Capture the diff under review:
  `git diff <baseline>..<head> -- <subtree> > $REVDIR/under-review.diff`.
- **Artifacts dir (loop pattern):** write all four/five sources +
  `meta.json` (commit, range, branch, sources map) +
  `MERGED-REVIEW.md` to
  `<subtree>/.cc-dispatch/reviews/<YYYYMMDD-HHMMSS>-<shortsha>-<clean|dirty>/`.
  `reviews/` is gitignored; the merged review feeds the next loop's prompt.
- **No `gh pr review`** — there's no PR. The merged review IS the deliverable; its
  prioritized fix list becomes Phase A of the next loop's prompt.md.
- **Five sources when Codex is up:** CC blind + Codex (high) + a second AI blind
  (Sonnet subagent) + SonarQube + CodeRabbit. If Codex is down, the Sonnet subagent
  covers the second-AI-perspective slot — don't block the pipeline on Codex.
- **SonarQube needs init first** on a fresh subtree:
  `sonarqube init <subtree> --name <x> --key <x>` before `scan`.

## Completion detection (all background reviewers)

Prefer **event/sentinel signals over PID polling**:
- **cc-dispatch** (CC reviews): SessionEnd hook fires natively — gold standard.
- **Codex/CLI tools in tmux:** append `; touch <name>.done` to the command; poll the
  tiny sentinel, not `ps`. (macOS has no shell-level "notify when non-child PID dies";
  `kqueue NOTE_EXIT` exists at the syscall layer but isn't exposed to bash.)
- **CodeRabbit:** the ndjson terminates with `{"type":"complete"}`.
- **`wait <pid>`** is truly event-driven but only for a CHILD of the current shell —
  `nohup ... &` orphans the process, so `wait` won't work there.

## Key Principles

- **Ack immediately** — react with 👀 and post "reviewing now" within seconds
- **Context matters** — don't review in a vacuum; understand WHY the code exists
- **Blind reviews** — CC, Codex, and CodeRabbit don't see each other's output; independent perspectives are valuable
- **Blind means blind** — reviewers must be fresh sessions with no prior context. Never reuse the active dev session for review; it cannot critique its own work objectively. Rule: review sessions are disposable; the dev session is persistent.
- **Severity matters** — don't bury critical bugs in a wall of nits
- **Be constructive** — suggest alternatives, not just problems
