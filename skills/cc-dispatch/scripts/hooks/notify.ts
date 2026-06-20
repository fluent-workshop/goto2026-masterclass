#!/usr/bin/env bun
/**
 * CC Dispatch — global hook handler
 * Installed in ~/.claude/settings.json; fires for every CC session on this machine.
 *
 * Three jobs, all driven by the per-repo .cc-dispatch/manifest.json:
 *   1. notify[]  — human-facing Discord ping on completion/intervention/failure
 *   2. wake[]    — fire-and-forget `openclaw system event` so the orchestrator can
 *                  autonomously advance the loop or step in for an intervention
 *   3. progress  — append a one-line heartbeat to the loop's progress.md every turn
 *                  (Stop). Cheap, no wake, no tokens — the full arc is there when a
 *                  wake eventually lands.
 *
 * No-op (fast exit 0) if .cc-dispatch/manifest.json doesn't exist.
 *
 * IMPORTANT: CC's hook runner enforces a ~60s budget and CANCELS slow hooks.
 * `openclaw message send` / `openclaw system event` take seconds (more under
 * session-lock contention), so we NEVER block on them — every external call is a
 * detached background process and the hook returns in well under a second.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { join, basename, dirname } from "path"

interface NotifyEntry {
  channel: string
  to: string
  accountId?: string
  session?: string
  mention?: string  // e.g. "<@1474921002239787193>" — prepended so the agent gets pinged
}

/**
 * Opt-in fire-and-forget wake. Enqueues a system event into the target
 * orchestrator session so it can act WITHOUT a human — advance the loop, or step
 * in for an intervention. Uses `openclaw system event` (enqueues + returns; does
 * NOT block on a turn, unlike the old `openclaw agent --message --timeout 30`).
 */
interface WakeEntry {
  sessionKey: string                  // e.g. "agent:main:discord:channel:123"
  mode?: "now" | "next-heartbeat"     // default "now"
  events?: string[]                   // override which events wake; default below
}

interface CcManifest {
  notify?: NotifyEntry[]
  wake?: WakeEntry[]
}

// ── Event taxonomy ───────────────────────────────────────────────────────────
// Human-facing notify fires on these (someone should see a Discord message):
const NOTIFY_EVENTS = new Set([
  "SessionEnd", "StopFailure", "Notification", "PermissionRequest", "Elicitation", "PostCompact",
])
// Default wake events — high-signal only, NEVER per-turn Stop (that's 20–60+/goal):
//   - intervention: the harness needs a human (permission / MCP elicitation / attention)
//   - failure:      the run died
//   - end:          the session actually ended (backstop)
const DEFAULT_WAKE_EVENTS = ["Notification", "PermissionRequest", "Elicitation", "StopFailure", "SessionEnd"]

const event = process.argv[process.argv.indexOf("--event") + 1] ?? "Stop"
const root = process.cwd()
const manifestPath = join(root, ".cc-dispatch", "manifest.json")

// Fast exit — no manifest means this repo isn't managed by cc-dispatch
if (!existsSync(manifestPath)) process.exit(0)

let manifest: CcManifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
} catch {
  process.exit(0)
}

// Load skill config for defaults (e.g. defaultMention)
const skillConfigPath = join(dirname(dirname(import.meta.dir)), "config.json")
let defaultMention: string | undefined
try {
  if (existsSync(skillConfigPath)) {
    const cfg = JSON.parse(readFileSync(skillConfigPath, "utf-8"))
    defaultMention = cfg.defaultMention
  }
} catch { /* config missing or malformed — proceed without defaults */ }

const notify = manifest.notify ?? []
const wake = manifest.wake ?? []

// Resolve CC session UUID from stdin payload (CC injects this into all hook calls)
let ccSessionId = process.env.CLAUDE_SESSION_ID ?? "unknown"
let stopHookActive = false
let payloadLoop: string | undefined
try {
  const stdin = readFileSync("/dev/stdin", "utf-8").trim()
  if (stdin) {
    const payload = JSON.parse(stdin)
    if (payload.session_id) ccSessionId = payload.session_id
    // `stop_hook_active` is true while a Stop hook (e.g. /goal) is still driving
    // the session — i.e. mid-goal. Lets us distinguish "still working" from idle.
    if (typeof payload.stop_hook_active === "boolean") stopHookActive = payload.stop_hook_active
    if (typeof payload.cwd === "string") { /* reserved */ }
  }
} catch { /* stdin not available or not JSON — use env var */ }

const shortId = ccSessionId.slice(0, 8)
const repo = basename(process.cwd())
// The human who owns this loop. Genericized — override per-deployment.
const operator = process.env.OPENCLAW_OPERATOR_NAME ?? "the operator"

const tmuxNames = notify.map((e) => e.session).filter((s): s is string => Boolean(s))
const tmuxLabel = tmuxNames.length > 0 ? tmuxNames.join(" / ") : shortId
const attachHint = tmuxNames.length > 0 ? `\ntmux attach -t ${tmuxNames[0]}` : ""
const prefix = `[CC: ${tmuxLabel} · ${repo} · ${shortId}]`

const labels: Record<string, string> = {
  SessionEnd:       `${prefix} Session complete ✅${attachHint}`,
  StopFailure:      `${prefix} Session failed ❌ — check the tmux pane${attachHint}`,
  Notification:     `${prefix} Needs attention 👋${attachHint}`,
  PermissionRequest:`${prefix} Permission needed 🔐 — approve in the pane${attachHint}`,
  Elicitation:      `${prefix} Input requested ❓ (AskUserQuestion) — answer in the pane${attachHint}`,
  PostCompact:      `${prefix} Compaction done 🗜️ — ready for next prompt`,
}
const msg = labels[event] ?? `${prefix} ${event}`

// Detach every external call so CC's hook runner sees an instant return.
function fireAndForget(args: string[]): void {
  try {
    const proc = Bun.spawn(args, {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      detached: true,
    })
    proc.unref?.()
  } catch { /* best-effort — never fail the hook */ }
}

// ── 3. Incremental progress (Stop = once per turn) ───────────────────────────
// Append a heartbeat to the loop's progress.md. No wake, no tokens — just a
// durable trail so a later wake (or a human) can read the whole arc at a glance.
if (event === "Stop") {
  try {
    // Find the most-recently-touched loop dir to attach progress to.
    const loopsDir = join(root, ".cc-dispatch", "loops")
    if (existsSync(loopsDir)) {
      const { readdirSync, statSync } = require("fs")
      const dirs = readdirSync(loopsDir)
        .map((n: string) => join(loopsDir, n))
        .filter((p: string) => { try { return statSync(p).isDirectory() } catch { return false } })
        .sort((a: string, b: string) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      const target = dirs[0]
      if (target) {
        const line = `- ${new Date().toISOString()} · turn end · ${stopHookActive ? "goal active" : "idle"} · ${shortId}\n`
        appendFileSync(join(target, "progress.md"), line)
      }
    }
  } catch { /* best-effort — progress is a convenience, never fail the hook */ }
  // Stop NEVER wakes and NEVER notifies (20–60+ per goal). Done.
  await Bun.sleep(50)
  process.exit(0)
}

// ── 1. Human-facing notify ───────────────────────────────────────────────────
if (NOTIFY_EVENTS.has(event)) {
  for (const { channel, to, accountId, mention } of notify) {
    const resolvedMention = mention ?? defaultMention
    const fullMsg = resolvedMention ? `${resolvedMention} ${msg}` : msg
    const args = [
      "openclaw", "message", "send",
      "--channel", channel,
      "--to", to,
      "--message", fullMsg,
    ]
    if (accountId) args.push("--account", accountId)
    fireAndForget(args)
  }
}

// ── 2. Fire-and-forget wake (autonomy + intervention) ────────────────────────
// The channel the human watches = the notify target for this repo (first entry).
const humanChannel = notify[0]?.to ? `${notify[0]!.channel}:${notify[0]!.to}` : "the loop's channel"
const attachCmd = tmuxNames.length > 0 ? `tmux attach -t ${tmuxNames[0]}` : "the tmux pane"

for (const { sessionKey, mode, events } of wake) {
  const triggerEvents = events ?? DEFAULT_WAKE_EVENTS
  if (!triggerEvents.includes(event)) continue
  if (!sessionKey) continue
  const intervention = event === "Notification" || event === "PermissionRequest" || event === "Elicitation"
  // CONTRACT: the human is NOT watching tmux. The woken orchestrator MUST translate
  // the pane state into a concrete, human-readable message posted to the channel —
  // not silently read the pane and wait. State the decision/options/blocking question.
  const text = intervention
    ? `${prefix} ${event}: cc-dispatch session needs a HUMAN DECISION and ${operator} is NOT watching the tmux pane. `
      + `YOU MUST: (1) capture the pane (\`${attachCmd}\` or \`tmux capture-pane -t ${tmuxNames[0] ?? "<session>"} -p\`) and read report.md/progress.md in the loop dir; `
      + `(2) post a concise, specific message to ${humanChannel} stating exactly what CC is blocked on — the decision, the options, and any blocking questions — so ${operator} can answer from the channel without opening tmux. `
      + `Do NOT just read the pane and go idle. Surfacing the question to the channel is the whole job.`
    : `${prefix} ${event}: cc-dispatch loop checkpoint and ${operator} is NOT watching the tmux pane. `
      + `YOU MUST: read the loop's report.md/progress.md, then post a concise status + the next decision (advance the loop, run a review, or what's blocking) to ${humanChannel}. `
      + `Do NOT just read the pane and go idle — surface it to the channel.`
  fireAndForget([
    "openclaw", "system", "event",
    "--text", text,
    "--mode", mode ?? "now",
    "--session-key", sessionKey,
  ])
}

// Give detached children a beat to fork, then exit fast.
await Bun.sleep(150)
process.exit(0)
