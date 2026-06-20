---
name: "cc-dispatch"
description: "Dispatch Claude Code in tmux: loops, compact→continue, goal scoping, and global hooks that notify humans + wake the orchestrator"
---

# CC Dispatch

Dispatches Claude Code (CC) sessions in tmux, tracks them, and drives lifecycle hooks that both **notify a human** and **wake the orchestrator** so loops can advance autonomously. Work is organised into numbered loops (build → review → distill → fix → green-gate) with a compact→continue handoff so one warm tmux session runs indefinitely.

**This page is the operational quick-reference. The depth lives in three companion docs — read the one that matches your task:**

- **`references/goal-scoping.md`** — how to size a `/goal`, the three-layer execution model, bundle-vs-split, review cadence. **Read before authoring any loop.**
- **`references/authoring-loops.md`** — loop folder anatomy, writing `prompt.md`/`goal.md`, provisioning `references/`, the compact→continue handoff.
- **`references/internals.md`** — the hook system (notify + wake + progress), the wake→channel contract, manifest schema, `install-hooks`, troubleshooting.

---

## When to use it (economics)

**Default to delegating substantial, well-scoped work to cc-dispatch instead of doing it inline.**

- cc-dispatch runs CC against a **Max 20 subscription — flat-rate, ~zero marginal token cost.**
- OpenClaw doing the work itself (or via Claude-model subagents) burns **pay-as-you-go API tokens.**
- Any chunk that can be **independently executed** — coding *or non-coding* (research synthesis, bulk transforms, doc generation, repo-wide refactors) — should go to cc-dispatch when it's substantial.

**The catch:** CC starts cold (no OpenClaw history, no Notion/Exa/MCP/web — only what's on disk). The economics only pay off with a complete handoff. Provision the loop's `references/` folder (see `references/authoring-loops.md`). Use it for **complex but well-scoped** work; keep quick, interactive, or context-heavy work inline.

---

## Session model: one session per cwd

**A session is bound to one working directory (repo checkout or git worktree) and lives across many loops.** The loop is the current unit of work; the session is the long-lived tmux process.

- **One session per cwd, always.** Two sessions in one checkout clobber each other. `launch` refuses a second session for a cwd that already has a live one.
- **Session name = cwd basename**, never the loop name. A `my-app` checkout → session `my-app`.
- **Parallel work → use `--worktree`** (own cwd → own session). That's the only sanctioned way to run two loops at once.

To advance an existing session to the next loop, use `continue` (compact → continue). To start fresh, `cleanup` then `launch`.

---

## Commands

```bash
CC=skills/cc-dispatch/scripts/cc-dispatch.ts

# Launch a NEW session for a cwd (first loop, or fresh start)
bun run $CC launch --loop loop-001-slug --repo ~/src/owner/my-repo \
  --notify-channel discord --notify-to "channel:ID" --notify-account default \
  --notify-wake-session "agent:main:discord:channel:ID"   # optional: autonomous wake

# Advance an EXISTING session to the next loop (compact → continue)
bun run $CC continue --session my-app --loop loop-002-slug \
  --compact "keep: X, Y; drop: install noise, failed attempts"

bun run $CC list                                  # active sessions
bun run $CC status --session my-app               # status + last 50 pane lines
bun run $CC cleanup --session my-app --confirm    # kill + prune manifest/worktree
bun run $CC install-hooks --confirm               # one-time: register global CC hooks (edits ~/.claude/settings.json)
tmux attach -t my-app                             # attach to the pane
```

**Key flags for `launch`:** `--task "..."` or `--issue-url URL` (the brief); `--loop <loop-NNN-slug>` (loop folder; name validated); `--name` (override session name); `--mode autonomous|interactive`; `--worktree`/`--force-worktree`; `--notify-channel/-to/-account`; `--notify-wake-session <key>` (wake the orchestrator on intervention/failure/completion). Full table in `references/authoring-loops.md`.

> Loop names **must** be `loop-NNN-descriptive-slug` (zero-padded). Bare `loop-001` is rejected.

---

## Loop folder anatomy

```
.cc-dispatch/
  loops/
    loop-001-descriptive-slug/
      references/      # context provisioned FOR CC (INDEX.md + exports/docs/scrapes)
      goal.md          # full spec: phases, acceptance criteria, safety rules
      prompt.md        # the lean brief that goes into /goal [prompt.md]
      report.md        # CC writes this at checkpoint
      progress.md      # per-turn heartbeat (written by the Stop hook)
      compact.md       # /compact instruction used to enter this loop (continue writes it)
  reviews/
    YYYYMMDD-HHMMSS-{sha}-{label}/MERGED-REVIEW.md
  manifest.json        # notify + wake config (gitignored)
```

Authoring details (the six required `prompt.md` elements, the `goal.md`/`prompt.md` split, lifecycle) are in `references/authoring-loops.md`.

---

## Hooks: notify + wake + progress (one-line model)

`install-hooks` registers a global CC hook handler (`scripts/hooks/notify.ts`) that, per the repo's `.cc-dispatch/manifest.json`, does three things:

1. **notify[]** — human-facing Discord ping on completion / intervention / failure.
2. **wake[]** *(opt-in)* — fire-and-forget `openclaw system event` into the orchestrator session so it can **autonomously advance the loop or step in for an intervention** (permission gate, AskUserQuestion). Set via `--notify-wake-session`.
3. **progress** — on every turn (`Stop`), appends a heartbeat to the loop's `progress.md`. No wake, no tokens — just a durable trail.

**The wake → channel contract:** a woken orchestrator MUST translate CC's pane state into a concrete decision **posted to the channel** (the operator is not watching tmux) — capture the pane, read `report.md`/`progress.md`, then post the decision/options/blocking question so they can answer from the channel. **Never just read the pane and go idle** — a bare "Needs attention" with no surfaced decision is a failed wake. Detail in `references/internals.md`.

**`Stop` never wakes** (a goal run is 20–60+ stops). Wakes fire only on high-signal events: `Notification`/`PermissionRequest`/`Elicitation` (intervention), `StopFailure`, `SessionEnd`, and `PostCompact` (when listed, to send the next `/goal`). Full schema and the hard-won timing lessons are in `references/internals.md`.

---

## The non-negotiables (everything else is in the references)

- **One session per cwd.** Parallel = worktrees.
- **Goals are ambitious, not granular.** The `/goal` *condition* must be a verifiable end state graded from the transcript — not "read prompt.md and execute it." See `references/goal-scoping.md`.
- **A wake must surface the decision to the channel.** Reading the pane and idling is a failed wake. See `references/internals.md`.
- **Don't exit the session at loop end.** Keeps CC warm (compaction easier) and avoids `-p` headless, which is also pay-as-you-go. Read `report.md`/`progress.md` when a wake lands.
- **Provision `references/` before dispatching.** Empty references = CC guessing = rework.
- **Heavy review is decoupled from the goal cycle.** Per-turn evaluation keeps loops honest; the blind multi-source review batches at milestones. See `references/goal-scoping.md`.
