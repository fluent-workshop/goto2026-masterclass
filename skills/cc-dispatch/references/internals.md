# Internals — the hook system, manifest schema, troubleshooting

How notifications and wakes actually work, and the hard-won timing lessons. The hook handler is `scripts/hooks/notify.ts`; the CLI is `scripts/cc-dispatch.ts`.

---

## The hook handler does three jobs

`install-hooks` registers a single global handler in `~/.claude/settings.json` that fires for **every** CC session on the machine. It's a no-op (fast exit 0) unless the session's cwd has `.cc-dispatch/manifest.json`. Driven by that manifest, it does:

1. **notify[]** — human-facing Discord ping (`openclaw message send`). Fires on `SessionEnd`, `StopFailure`, `Notification`, `PermissionRequest`, `Elicitation`, `PostCompact`.
2. **wake[]** *(opt-in)* — fire-and-forget `openclaw system event` into the orchestrator session so it can act WITHOUT a human: advance the loop, or step in for an intervention.
3. **progress** — on `Stop` (every turn), appends a heartbeat line to the most-recently-touched loop's `progress.md`. No wake, no notify, no tokens.

---

## The wake → channel contract (READ THIS)

**A wake exists to get a decision in front of the operator, who is NOT watching the tmux pane.** When the orchestrator receives a wake system event, its job is **not** to silently read the pane and go idle — that's the failure mode that makes a wake look like a stall. The contract the woken orchestrator MUST follow:

1. **Capture the pane** — `tmux capture-pane -t <session> -p` (or attach) — and read the loop's `report.md` / `progress.md`.
2. **Post a concise, specific message to the human channel** (the repo's notify target) stating exactly what CC is blocked on: the decision to make, the options, and any blocking questions — phrased so the operator can answer **from the channel** without opening tmux.
3. **Only then** wait. Surfacing the question to the channel is the whole job of the wake.

The wake event text emitted by the hook spells this out (capture → post-to-channel → don't-idle) and includes the exact channel target and `tmux` command, so the woken orchestrator has no excuse to leave the human guessing. A generic "Needs attention 👋" notify line is **not** sufficient on its own — it carries no content; the orchestrator must translate the pane state into a real, answerable message.

This applies to every wake trigger: an intervention (permission / AskUserQuestion / stall) surfaces the prompt and options; a loop checkpoint (`PostCompact`, `SessionEnd`) surfaces the status + the next decision (advance / review / what's blocking).

---

## Event taxonomy (the core design decision)

| Event | Action | Why |
|---|---|---|
| `Stop` (every turn, **20–60+ per goal**) | write `progress.md` only | incremental, free, NEVER wakes (would spam) |
| `Notification` / `PermissionRequest` / `Elicitation` | wake + notify | **intervention** — harness needs a human (permission, AskUserQuestion / MCP elicitation, stall) |
| `StopFailure` | wake + notify | crash / API death |
| `SessionEnd` | wake + notify | backstop if a session actually ends |
| `PostCompact` | notify + wake (when in the entry's `events`) | "ready for next prompt" — wake so the orchestrator sends the next `/goal` |

`install-hooks` registers all seven events: `SessionEnd, StopFailure, Notification, PermissionRequest, Elicitation, PostCompact, Stop`.

`progress.md` lines record `goal active` vs `idle`, read from the `stop_hook_active` flag in the hook stdin payload — so you can tell mid-goal turns from a genuinely idle session.

---

## manifest.json schema

`.cc-dispatch/manifest.json` (gitignored). `launch` writes it from `--notify-*` / `--notify-wake-session`; `loadCcManifest` preserves both arrays across writes (so a later `launch`/`continue` never clobbers `wake`).

```json
{
  "notify": [
    { "channel": "discord", "to": "channel:CHANNEL_ID", "accountId": "default", "session": "my-app", "mention": "<@USER_ID>" }
  ],
  "wake": [
    { "sessionKey": "agent:main:discord:channel:CHANNEL_ID", "mode": "now", "events": ["Notification","PermissionRequest","Elicitation","StopFailure","SessionEnd","PostCompact"] }
  ]
}
```

- **notify[].mention** — optional; prepended so the orchestrator gets pinged. Defaults from skill `config.json` `defaultMention`.
- **wake[].mode** — `now` (default) or `next-heartbeat`.
- **wake[].events** — optional override; defaults to the intervention + failure + end set. Add `PostCompact` when you want the orchestrator woken to send the next `/goal` after a compaction handoff. `Stop` is intentionally excluded (20–60+ per goal).

If a session predates `--notify-*`, drop the file manually (`mkdir -p REPO/.cc-dispatch` then write the JSON). Add `.cc-dispatch/` to the repo's `.gitignore`.

---

## Why wake uses `openclaw system event` (not `openclaw agent`)

`openclaw system event --mode now --session-key <key> --text "..."` **enqueues and returns** (~2s, never waits on a turn). It REPLACES the old `openclaw agent --message --timeout 30`, which **blocked** up to 30s+ on a turn that could run 60s and die on model failover — that blocking-wait was why the old notify path failed.

---

## CRITICAL timing lessons (proven by live testing)

- **CC's hook runner enforces a ~60s budget and CANCELS slow hooks.** `message send` + `system event` take seconds (more under session-lock contention). If the hook waits on them synchronously, CC kills it (`SessionEnd hook failed: Hook cancelled`) and nothing delivers.
- **Fix: detach every external call.** The handler spawns each `message send` / `system event` as a detached background process (`detached: true`, stdio ignored, `.unref()`) and exits immediately. Hook return time: **20s+ → 0.4s.** Never block in a hook.
- **CC idle ≠ SessionEnd.** `SessionEnd` fires on CC *process* exit (headless `-p`, `/exit`, kill), NOT when an interactive session finishes a turn and waits at the prompt. So for a warm reusable session, completion is signalled by the goal evaluator + `progress.md` going idle, and intervention by `Notification`/`PermissionRequest`/`Elicitation` — not by waiting for `SessionEnd`.
- **Don't exit the session to signal done.** Keeps CC warm (compaction easier) and avoids `-p` headless, which is also pay-as-you-go. Read `report.md`/`progress.md` when a wake lands.
- **A wake is not a stall.** If the channel sees a bare "Needs attention" with no decision surfaced, the orchestrator failed the wake → channel contract above — it read the pane and idled instead of posting the question. The fix is behavioral (surface it), not a retry.
- **The wake can collide with its own session's lock** when waking an actively-in-use session (`session file locked` in `outbound/deliver`) — it still succeeds; just expect the warning.

---

## install-hooks

```bash
bun run skills/cc-dispatch/scripts/cc-dispatch.ts install-hooks --confirm
```

Requires `--confirm` (or `ALLOW_HOOK_INSTALL=1`) because it edits your global
`~/.claude/settings.json` (it backs the file up to `settings.json.bak` first). Merges
the seven hook entries idempotently (safe to re-run; won't duplicate). All point at
`scripts/hooks/notify.ts`.

`scripts/hooks/notify.ts` is the only active hook.

---

## Workspace session manifest

The workspace-level session list lives at `~/.openclaw/workspace/.scratch/cc-sessions.json`. `launch`/`continue`/`list`/`status`/`cleanup` all read/write it. It's separate from the per-repo `.cc-dispatch/manifest.json` (which is notification/wake config, not session state).

---

## Mid-session communication (CC → channel)

Briefs inject `openclaw message send` for mid-session updates — direct dispatch, no LLM pipeline, no timeout risk:

```bash
openclaw message send --channel discord --to "channel:CHANNEL_ID" --account default --message "[CC: SESSION_NAME] <message>"
```

CC is told NOT to send its own completion notification — the hooks handle it. (Old sessions launched before this change may still use `openclaw agent --agent main --message`; that's the fragile path and gets replaced on next relaunch.)

---

## Cron guidance

Cron is **not** needed for completion detection — hooks fire immediately. Use a cron only for a hard timeout ceiling (e.g. "alert if still running after 4h"). Use `agentTurn`, not `systemEvent`, for that watchdog.
