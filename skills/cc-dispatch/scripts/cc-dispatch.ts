#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * CC Dispatch — Launch and manage Claude Code sessions in tmux.
 *
 * Usage:
 *   cc-dispatch launch --issue-url <url> [--mode interactive|autonomous] [--worktree] [--force-worktree] [--notify-session <id>] [--notify-channel <ch>] [--notify-to <target>] [--notify-account <id>]
 *   cc-dispatch launch --task "..." [--worktree] [--notify-session <id>] [--notify-channel <ch>] [--notify-to <target>] [--notify-account <id>]
 *   cc-dispatch list
 *   cc-dispatch status --session <name>
 *   cc-dispatch kill --session <name>
 *   cc-dispatch cleanup --session <name>
 *   cc-dispatch install-hooks
 *   cc-dispatch log-summary --session-id <uuid> [--lines N]
 */

import { type Args, out, fatal, parseIntSafe, parseArgs, requireArg, optionalArg, hasFlag, printUsage } from "./lib/cli";
import { fetchIssue, findRelevantFiles } from "./lib/context";
import { generateBrief } from "./lib/brief";
import { createSession, listSessions, killSession, capturePane, attachCommand, createWorktree, removeWorktree, isTreeDirty, dirtyFiles, sendInstruction } from "./lib/session";
import { loadManifest, saveManifest, addSession, updateSession, removeSession } from "./lib/manifest";
import { homedir } from "os";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "node:path";

// Load skill-level config defaults (e.g. defaultMention)
let skillConfig: Record<string, string> = {};
try {
  const cfgPath = join(import.meta.dir, "../../config.json");
  if (existsSync(cfgPath)) skillConfig = JSON.parse(await Bun.file(cfgPath).text());
} catch { /* proceed without */ }
import { sessionLogPath, querySessionLog, computeStats } from "./lib/logs";
import { resolve } from "node:path";

// ── Constants ───────────────────────────────────────────────────────────────

// Derive the workspace root from this file's location (skills/cc-dispatch/scripts
// → repo root) so the tool is portable. Override with OPENCLAW_WORKSPACE if the
// skill lives outside the workspace it should operate on.
const WORKSPACE = process.env.OPENCLAW_WORKSPACE ?? resolve(import.meta.dir, "../../..");

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/^\[.*?\]\s*/, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "")
    .slice(0, 30)
    .replace(/-$/, "");
  return slug || "task"; // never return empty
}

/** Validate a session name is safe for tmux + file paths. */
function validateSessionName(name: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
    fatal(`Invalid session name: "${name}". Must be alphanumeric with hyphens/underscores.`);
  }
  if (name.includes("..") || name.includes("/")) {
    fatal(`Invalid session name: "${name}". Path traversal not allowed.`);
  }
}

/** Resolve the absolute cwd a session entry is bound to (worktree if present, else repo). */
function resolveCwd(entry: { repo: string; worktree?: string }): string {
  if (entry.worktree) return resolve(entry.worktree.replace(/^~/, homedir()));
  const repoIsLocalPath = entry.repo.startsWith("/") || entry.repo.startsWith("~") || entry.repo.startsWith(".");
  return repoIsLocalPath ? resolve(entry.repo.replace(/^~/, homedir())) : WORKSPACE;
}

/**
 * Validate that a loop name includes a semantic slug after the number.
 * Rejects bare "loop-001" style names; requires "loop-001-descriptive-slug".
 */
function validateLoopName(name: string): void {
  if (/^loop-\d+$/i.test(name)) {
    fatal(
      `Loop name "${name}" is missing a semantic slug.\n` +
      `Use the format loop-NNN-descriptive-slug, e.g. loop-001-storybook-visual-harness.\n` +
      `The slug should describe what this loop does, not just its sequence number.`
    );
  }
  if (!/^loop-\d+-[a-z0-9-]+$/i.test(name)) {
    fatal(
      `Loop name "${name}" doesn't match the expected format loop-NNN-descriptive-slug.\n` +
      `Example: loop-002-gate-hardening`
    );
  }
}

function branchPrefix(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("bug") || l.includes("fix"))) return "fix";
  if (lower.some((l) => l.includes("refactor"))) return "refactor";
  if (lower.some((l) => l.includes("chore"))) return "chore";
  return "feat";
}

// ── Launch helpers ──────────────────────────────────────────────────────────

interface NotifyEntry {
  channel: string;
  to: string;
  accountId?: string;
  session?: string;
}

interface WakeEntry {
  sessionKey: string;
  mode?: "now" | "next-heartbeat";
  events?: string[];
}

interface CcManifest {
  notify: NotifyEntry[];
  wake?: WakeEntry[];
}

async function loadCcManifest(workdir: string): Promise<CcManifest> {
  const path = join(workdir, ".cc-dispatch", "manifest.json");
  try {
    const text = await readFile(path, "utf-8");
    const data = JSON.parse(text);
    // Preserve wake[] across load/save — launch must NOT clobber it.
    return {
      notify: Array.isArray(data.notify) ? data.notify : [],
      wake: Array.isArray(data.wake) ? data.wake : undefined,
    };
  } catch {
    return { notify: [] };
  }
}

async function saveCcManifest(workdir: string, manifest: CcManifest): Promise<void> {
  const dir = join(workdir, ".cc-dispatch");
  await mkdir(dir, { recursive: true });
  // Only serialize wake when present, to keep the file clean.
  const out: CcManifest = { notify: manifest.notify };
  if (manifest.wake && manifest.wake.length > 0) out.wake = manifest.wake;
  await writeFile(join(dir, "manifest.json"), JSON.stringify(out, null, 2) + "\n");
}

interface LaunchInput {
  issueUrl?: string;
  issueNum?: string;
  repo: string;
  mode: "interactive" | "autonomous";
  task?: string;
  useWorktree: boolean;
  forceWorktree: boolean;
  notifySession?: string;
  notifyChannel?: string;
  notifyTo?: string;
  notifyAccount?: string;
  notifyMention?: string;
  notifyWakeSession?: string;  // orchestrator session key to wake on intervention/completion
  loop?: string;  // e.g. "loop-003-notion-sync-engine" — brief written to loops/<loop>/prompt.md
}

function parseLaunchInput(args: Args): LaunchInput {
  const issueUrl = optionalArg(args, "issue-url");
  let repo = optionalArg(args, "repo");
  let issueNum = optionalArg(args, "issue");

  if (issueUrl) {
    const match = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/.exec(issueUrl);
    if (!match) fatal("Invalid issue URL: " + issueUrl);
    repo = match[1];
    issueNum = match[2];
  }

  if (!repo) {
    fatal("A target repo is required: pass --repo <owner/repo> (or a local path), or --issue-url to derive it.");
  }

  const mode = optionalArg(args, "mode", "autonomous") as "interactive" | "autonomous";
  if (mode !== "interactive" && mode !== "autonomous") fatal("Invalid mode: " + mode);

  const task = optionalArg(args, "task");
  if (!issueNum && !task) fatal("Either --issue-url, --issue, or --task is required");

  const notifySession = optionalArg(args, "notify-session")
    ?? process.env.OPENCLAW_SESSION_ID;

  return {
    issueUrl, issueNum, repo, mode, task,
    useWorktree: hasFlag(args, "worktree") || hasFlag(args, "force-worktree"),
    forceWorktree: hasFlag(args, "force-worktree"),
    notifySession,
    notifyChannel: optionalArg(args, "notify-channel"),
    notifyTo: optionalArg(args, "notify-to"),
    notifyAccount: optionalArg(args, "notify-account"),
    notifyMention: optionalArg(args, "notify-mention") ?? skillConfig.defaultMention,
    notifyWakeSession: optionalArg(args, "notify-wake-session"),
    loop: optionalArg(args, "loop"),
  };
}

async function resolveIssue(input: LaunchInput) {
  if (!input.issueNum) return undefined;
  const num = parseIntSafe(input.issueNum, "issue");
  try {
    return await fetchIssue(input.repo, num);
  } catch (e) {
    fatal("Failed to fetch issue #" + input.issueNum + ": " + e);
  }
}

// ── Launch ──────────────────────────────────────────────────────────────────

/** Generate a lean structured prompt.md template for human authoring. */
function generateLoopPromptTemplate(loopName: string): string {
  return `# ${loopName} — [one-sentence objective]

**READ FIRST:**
- \`.cc-dispatch/loops/${loopName}/goal.md\` — full spec. Do not skip it.
- \`.cc-dispatch/loops/${loopName}/references/\` — provisioned context (research, docs, scrapes). Read INDEX.md, then everything it lists.

Mode: autonomous (\`--dangerously-skip-permissions\`), work directly on \`main\`.
[What phases/items to complete — reference F1, F2, etc. from goal.md]
Do NOT [explicit out-of-scope guardrails — what this loop must not touch].
Done when: [measurable, evaluator-gradeable end state — test/build/typecheck result, empty queue, per-item status in report.md — or stop after N turns and report].
Stop condition: [when to write report.md and go idle — don't start the next loop].
`;
}

/** INDEX.md scaffold for a loop's references/ folder. */
function generateReferencesIndex(loopName: string): string {
  return `# References — ${loopName}

Context materialized for Claude Code. CC does **not** have OpenClaw's conversation
history, Notion/Exa access, MCP connectors, or the web/research context gathered in
the OpenClaw session — it only sees what is on disk in this repo. Everything CC needs
to be fully informed must live in this folder, listed below.

| File | What it is | Why CC needs it |
|------|-----------|-----------------|
| _(example)_ research-summary.md | Exa research on <topic> | Grounds the design decisions in goal.md |
| _(example)_ api-reference.md | Scraped vendor docs for <api> | CC has no live access to these docs |

_Delete the example rows once real references are added. If this folder is empty,
the loop is under-provisioned — CC will guess at anything not on disk._
`;
}

/** Scaffold a loop's references/ folder + INDEX.md if not already present. */
async function scaffoldReferences(loopDir: string, loopName: string): Promise<void> {
  const refsDir = `${loopDir}/references`;
  await mkdir(refsDir, { recursive: true });
  const indexPath = `${refsDir}/INDEX.md`;
  if (!(await Bun.file(indexPath).exists())) {
    await Bun.write(indexPath, generateReferencesIndex(loopName));
  }
}

async function launch(args: Args) {
  const input = parseLaunchInput(args);
  const issue = await resolveIssue(input);

  // Validate loop name format before doing anything else
  if (input.loop) validateLoopName(input.loop);

  const timestamp = Math.floor(Date.now() / 1000);
  const slug = (issue?.title ? slugify(issue.title) : undefined) ?? (input.task ? slugify(input.task) : undefined) ?? "task";

  // Determine base working directory.
  // If --repo is a local filesystem path (not owner/repo), use it as the workdir.
  const repoIsLocalPath = input.repo.startsWith("/") || input.repo.startsWith("~") || input.repo.startsWith(".");
  const baseWorkdir = repoIsLocalPath ? resolve(input.repo.replace(/^~/, homedir())) : WORKSPACE;

  // Worktree setup
  let workdir = baseWorkdir;
  let worktreePath: string | undefined;
  let branchName: string | undefined;

  if (input.useWorktree) {
    if (!input.forceWorktree && (await isTreeDirty(baseWorkdir))) {
      const dirty = await dirtyFiles(baseWorkdir);
      const preview = dirty.slice(0, 10).map((f) => "  " + f).join("\n");
      const more = dirty.length > 10 ? "\n  ... and " + (dirty.length - 10) + " more" : "";
      fatal("Working tree has " + dirty.length + " uncommitted changes. Use --force-worktree to proceed.\n" + preview + more);
    }
    branchName = `${branchPrefix(issue?.labels ?? [])}/${slug}-${timestamp}`;
    const worktreeBase = resolve(homedir(), ".claude/worktrees");
    await mkdir(worktreeBase, { recursive: true });
    // Worktree dir is named for the repo + branch slug so the session name reads clean.
    worktreePath = resolve(worktreeBase, basename(baseWorkdir) + "-" + slug + "-" + timestamp);
    await createWorktree(baseWorkdir, worktreePath, branchName);
    workdir = worktreePath;
  }

  // Derive session name from the CWD identity (repo or worktree), NOT the loop.
  // A session is bound to one cwd and lives across many loops. One session per cwd.
  // Priority: explicit --name > worktree/repo basename.
  const sessionName = optionalArg(args, "name") ?? basename(workdir);
  validateSessionName(sessionName);

  // Guard: one cc-dispatch session per cwd. Reject if a live session already owns this workdir.
  const existingManifest = await loadManifest(WORKSPACE);
  const tmuxNow = await listSessions();
  const sameCwd = existingManifest.sessions.find(
    (e) => e.status === "running" && (e.worktree ?? e.repo) && resolveCwd(e) === workdir,
  );
  if (sameCwd && tmuxNow.some((t) => t.name === sameCwd.name)) {
    fatal(
      `A cc-dispatch session ('${sameCwd.name}') is already running for this cwd:\n  ${workdir}\n\n` +
      `Only one session per cwd is allowed — parallel sessions clobber each other.\n` +
      `→ To run the next loop in it:   cc-dispatch continue --session ${sameCwd.name} --loop <loop-NNN-slug>\n` +
      `→ To tear it down and relaunch: cc-dispatch cleanup --session ${sameCwd.name} --confirm\n` +
      `→ For parallel work, launch with --worktree so it gets its own cwd.`
    );
  }
  // Also guard against a bare tmux session already holding this name.
  if (tmuxNow.some((t) => t.name === sessionName)) {
    fatal(
      `tmux session '${sessionName}' already exists for this cwd. ` +
      `Use 'cc-dispatch continue --session ${sessionName} --loop <loop-NNN-slug>' or kill it first.`
    );
  }

  // Assemble context and brief
  const fileHints = optionalArg(args, "files")?.split(",").map((f) => f.trim()) ?? [];
  const files = issue ? await findRelevantFiles(issue, baseWorkdir, fileHints) : fileHints;
  const brief = generateBrief({
    mode: input.mode,
    issue,
    taskDescription: input.task,
    files,
    sessionName,
    notifySession: input.notifySession,
    notifyChannel: input.notifyChannel,
    notifyTo: input.notifyTo,
    notifyAccount: input.notifyAccount,
  });

  // Write brief — into loop dir if --loop supplied, otherwise .scratch/
  let briefPath: string;
  if (input.loop) {
    const loopDir = `${workdir}/.cc-dispatch/loops/${input.loop}`;
    await mkdir(loopDir, { recursive: true });
    await scaffoldReferences(loopDir, input.loop);
    const promptPath = `${loopDir}/prompt.md`;
    const promptExists = await Bun.file(promptPath).exists();
    if (promptExists) {
      // Hand-authored prompt.md takes precedence — never overwrite it.
      // Write the generated brief to .scratch/ so it isn't lost, but don't clobber the loop prompt.
      await Bun.write(`${workdir}/.scratch/.keep`, "");
      const scratchPath = `${workdir}/.scratch/cc-brief-${sessionName}.md`;
      await Bun.write(scratchPath, brief);
      briefPath = promptPath; // CC reads the hand-authored prompt
      console.error(`[cc-dispatch] prompt.md already exists — using hand-authored version. Generated brief saved to ${scratchPath}`);
    } else {
      // No prompt.md yet — write a lean structured template for human authoring.
      const template = generateLoopPromptTemplate(input.loop);
      await Bun.write(promptPath, template);
      briefPath = promptPath;
      console.error(`[cc-dispatch] Created prompt.md template at ${promptPath} — EDIT IT before sending /goal.`);
    }
  } else {
    await Bun.write(`${workdir}/.scratch/.keep`, "");
    briefPath = `${workdir}/.scratch/cc-brief-${sessionName}.md`;
    await Bun.write(briefPath, brief);
  }

  // Launch tmux session
  await createSession({ name: sessionName, briefPath, mode: input.mode, workdir, issueNum: issue?.number, slug });

  // Record in workspace manifest
  const manifest = await loadManifest(WORKSPACE);
  addSession(manifest, {
    name: sessionName,
    issueUrl: input.issueUrl ?? (input.issueNum ? "https://github.com/" + input.repo + "/issues/" + input.issueNum : undefined),
    repo: input.repo,
    mode: input.mode,
    worktree: worktreePath,
    branch: branchName,
    briefPath,
    launchedAt: new Date().toISOString(),
    status: "running",
  });
  await saveManifest(WORKSPACE, manifest);

  // Write per-repo .cc-dispatch/manifest.json with notify + wake entries.
  // loadCcManifest preserves any existing wake[] so we never clobber it.
  if ((input.notifyChannel && input.notifyTo) || input.notifyWakeSession) {
    const ccManifest = await loadCcManifest(workdir);

    if (input.notifyChannel && input.notifyTo) {
      const alreadyPresent = ccManifest.notify.some((e) => e.to === input.notifyTo && e.session === sessionName);
      if (!alreadyPresent) {
        ccManifest.notify.push({
          channel: input.notifyChannel,
          to: input.notifyTo,
          ...(input.notifyAccount ? { accountId: input.notifyAccount } : {}),
          ...(input.notifyMention ? { mention: input.notifyMention } : {}),
          session: sessionName,
        });
      }
    }

    // Opt-in wake: orchestrator session woken on intervention/failure/completion
    // (Stop is never a wake trigger — progress.md handles per-turn heartbeats).
    if (input.notifyWakeSession) {
      ccManifest.wake = ccManifest.wake ?? [];
      const wakePresent = ccManifest.wake.some((w) => w.sessionKey === input.notifyWakeSession);
      if (!wakePresent) {
        ccManifest.wake.push({ sessionKey: input.notifyWakeSession });
      }
    }

    await saveCcManifest(workdir, ccManifest);
  }

  out({
    status: "launched",
    session: sessionName,
    mode: input.mode,
    issue: input.issueNum ? parseIntSafe(input.issueNum, "issue") : null,
    worktree: worktreePath ?? null,
    branch: branchName ?? null,
    briefPath,
    attachCommand: attachCommand(sessionName),
  });
}

// ── List ────────────────────────────────────────────────────────────────────

async function list() {
  const tmuxSessions = await listSessions();
  const manifest = await loadManifest(WORKSPACE);

  const sessions = manifest.sessions.map((entry) => {
    const tmux = tmuxSessions.find((s) => s.name === entry.name);
    return { ...entry, tmuxAlive: !!tmux, attached: tmux?.attached ?? false, attachCommand: attachCommand(entry.name) };
  });

  // Include legacy tmux sessions not in manifest
  for (const tmux of tmuxSessions) {
    if (!manifest.sessions.some((e) => e.name === tmux.name)) {
      sessions.push({
        name: tmux.name,
        status: "running" as const,
        launchedAt: tmux.created,
        tmuxAlive: true,
        attached: tmux.attached,
        attachCommand: attachCommand(tmux.name),
        repo: "unknown",
        mode: "autonomous" as const,
      });
    }
  }

  out(sessions.length === 0 ? { sessions: [], message: "No active CC sessions" } : { sessions });
}

// ── Status ──────────────────────────────────────────────────────────────────

async function status(args: Args) {
  const name = requireArg(args, "session");
  const lines = parseIntSafe(optionalArg(args, "lines", "50"), "lines");

  const tmuxSessions = await listSessions();
  const tmux = tmuxSessions.find((s) => s.name === name);
  if (!tmux) fatal(`Session '${name}' not found in tmux`);

  const manifest = await loadManifest(WORKSPACE);
  const entry = manifest.sessions.find((e) => e.name === name);

  out({
    session: entry ?? { name },
    tmux,
    attachCommand: attachCommand(name),
    paneOutput: (await capturePane(name, lines)).trim(),
  });
}

// ── Kill ────────────────────────────────────────────────────────────────────

async function kill(args: Args) {
  const name = requireArg(args, "session");
  await killSession(name);

  const manifest = await loadManifest(WORKSPACE);
  updateSession(manifest, name, { status: "killed" });
  await saveManifest(WORKSPACE, manifest);

  out({ status: "killed", session: name });
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup(args: Args) {
  const name = requireArg(args, "session");
  const confirmed = hasFlag(args, "confirm");

  const manifest = await loadManifest(WORKSPACE);
  const entry = manifest.sessions.find((e) => e.name === name);
  if (!entry) fatal(`Session '${name}' not found in manifest`);

  if (!confirmed) {
    out({
      status: "confirmation_required",
      session: name,
      worktree: entry.worktree ?? null,
      branch: entry.branch ?? null,
      message: "Run with --confirm to proceed with cleanup",
    });
    return;
  }

  const tmuxSessions = await listSessions();
  if (tmuxSessions.some((s) => s.name === name)) await killSession(name);
  if (entry.worktree) await removeWorktree(WORKSPACE, entry.worktree);

  // Remove this session's notify entry from .cc-dispatch/manifest.json
  const repoIsLocalPath = entry.repo.startsWith("/") || entry.repo.startsWith("~") || entry.repo.startsWith(".");
  const cleanupWorkdir = entry.worktree ?? (repoIsLocalPath ? resolve(entry.repo.replace(/^~/, homedir())) : WORKSPACE);
  const ccManifest = await loadCcManifest(cleanupWorkdir);
  ccManifest.notify = ccManifest.notify.filter((e) => e.session !== name);
  if (existsSync(join(cleanupWorkdir, ".cc-dispatch", "manifest.json"))) {
    await saveCcManifest(cleanupWorkdir, ccManifest);
  }

  removeSession(manifest, name);
  await saveManifest(WORKSPACE, manifest);

  out({ status: "cleaned_up", session: name });
}

// ── Install Hooks ───────────────────────────────────────────────────────────

async function installHooks(args: Args) {
  const globalSettingsPath = join(homedir(), ".claude", "settings.json");
  const hookScript = `${WORKSPACE}/skills/cc-dispatch/scripts/hooks/notify.ts`;

  // Writing to the user's GLOBAL Claude settings affects every CC session on the
  // machine — require explicit opt-in before touching it.
  const confirmed = hasFlag(args, "confirm") || process.env.ALLOW_HOOK_INSTALL === "1";
  if (!confirmed) {
    out({
      status: "confirmation_required",
      path: globalSettingsPath,
      hookScript,
      message: "install-hooks edits your global ~/.claude/settings.json (affects all CC sessions). Re-run with --confirm or set ALLOW_HOOK_INSTALL=1 to proceed.",
    });
    return;
  }

  let settings: Record<string, unknown> = {};
  const file = Bun.file(globalSettingsPath);
  if (await file.exists()) {
    try { settings = await file.json(); } catch {}
    // Back up the existing settings before we modify them.
    await Bun.write(globalSettingsPath + ".bak", await file.text());
  }

  if (!settings.hooks || typeof settings.hooks !== "object") settings.hooks = {};
  const hooks = settings.hooks as Record<string, unknown[]>;

  const events = ["SessionEnd", "StopFailure", "Notification", "PermissionRequest", "Elicitation", "PostCompact", "Stop"];
  let installed = 0;
  for (const event of events) {
    const existing = (hooks[event] ?? []) as Array<Record<string, unknown>>;
    const alreadyInstalled = existing.some((entry) =>
      (entry.hooks as Array<Record<string, unknown>>)?.some((h) =>
        typeof h.command === "string" && h.command.includes("cc-dispatch/scripts/hooks/notify")
      )
    );
    if (!alreadyInstalled) {
      hooks[event] = [
        ...existing,
        { matcher: "", hooks: [{ type: "command", command: `bun run ${hookScript} --event ${event}` }] },
      ];
      installed++;
    }
  }

  await mkdir(join(homedir(), ".claude"), { recursive: true });
  await Bun.write(globalSettingsPath, JSON.stringify(settings, null, 2) + "\n");

  out({
    status: installed > 0 ? "installed" : "already_installed",
    eventsAdded: installed,
    path: globalSettingsPath,
    hookScript,
  });
}

// ── Logs ────────────────────────────────────────────────────────────────────

async function readLogFile(args: Args): Promise<{ sessionId: string; logPath: string; content: string }> {
  const sessionId = requireArg(args, "session-id");
  if (!/^[a-f0-9-]+$/i.test(sessionId)) fatal("Invalid session-id: must be a UUID");
  const projectPath = optionalArg(args, "project", WORKSPACE);
  const logPath = sessionLogPath(sessionId, projectPath);
  const file = Bun.file(logPath);
  if (!(await file.exists())) fatal("Session log not found: " + logPath);
  return { sessionId, logPath, content: await file.text() };
}

async function logs(args: Args) {
  const { sessionId, logPath, content } = await readLogFile(args);
  const limit = parseIntSafe(optionalArg(args, "lines", "20"), "lines");

  const { totalLines, messages } = querySessionLog(content, {
    preset: optionalArg(args, "filter"),
    grep: optionalArg(args, "grep"),
    since: optionalArg(args, "since"),
    limit,
  });

  out({ sessionId, logPath, totalLines, matchCount: messages.length, messages });
}

async function logStats(args: Args) {
  const { sessionId, logPath, content } = await readLogFile(args);
  const stats = computeStats(content);
  out({ sessionId, logPath, ...stats });
}

// ── Continue (compact → continue handoff into the next loop) ─────────────────

async function continueLoop(args: Args) {
  const name = requireArg(args, "session");
  const loop = requireArg(args, "loop");
  validateLoopName(loop);

  // Session must be alive in tmux.
  const tmuxSessions = await listSessions();
  if (!tmuxSessions.some((s) => s.name === name)) {
    fatal(`Session '${name}' is not alive in tmux. Use 'cc-dispatch launch' to start a fresh session.`);
  }

  const manifest = await loadManifest(WORKSPACE);
  const entry = manifest.sessions.find((e) => e.name === name);
  if (!entry) fatal(`Session '${name}' not found in manifest.`);
  const workdir = resolveCwd(entry!);

  // Resolve the incoming loop dir + prompt.md.
  const loopDir = `${workdir}/.cc-dispatch/loops/${loop}`;
  await mkdir(loopDir, { recursive: true });
  await scaffoldReferences(loopDir, loop);
  const promptPath = `${loopDir}/prompt.md`;
  if (!(await Bun.file(promptPath).exists())) {
    const template = generateLoopPromptTemplate(loop);
    await Bun.write(promptPath, template);
    fatal(
      `No prompt.md for ${loop} yet — wrote a template at:\n  ${promptPath}\n` +
      `Author it (all five elements), then re-run this continue command.`
    );
  }

  // Compaction instruction: --compact "<text>" OR --compact-file <path>.
  // Persist it to the incoming loop's compact.md before sending, so the handoff is auditable.
  const compactText = optionalArg(args, "compact")
    ?? (optionalArg(args, "compact-file") ? await readFile(optionalArg(args, "compact-file")!, "utf8") : undefined);
  const skipCompact = hasFlag(args, "no-compact");

  if (!skipCompact) {
    if (!compactText) {
      fatal(
        `Provide a compaction instruction with --compact "keep: ...; drop: ..." (or --compact-file <path>),\n` +
        `or pass --no-compact to skip compaction and just send the next /goal.`
      );
    }
    const compactBody = compactText!.trim();
    await Bun.write(`${loopDir}/compact.md`, compactBody.endsWith("\n") ? compactBody : compactBody + "\n");
    // Send the /compact instruction to the pane.
    const compactCmd = compactBody.startsWith("/compact") ? compactBody : `/compact [${compactBody}]`;
    await sendInstruction(name, compactCmd);
    // PostCompact hook fires when compaction finishes; give it a beat, then proceed.
    // (We don't block on the hook here — the operator can watch the pane / channel.)
    await Bun.sleep(3000);
  }

  // Send the next /goal.
  const goalCmd = `/goal Read .cc-dispatch/loops/${loop}/prompt.md and execute it.`;
  await sendInstruction(name, goalCmd);

  // Update the manifest: same session, new brief path.
  updateSession(manifest, name, { briefPath: promptPath });
  await saveManifest(WORKSPACE, manifest);

  out({
    status: "continued",
    session: name,
    loop,
    cwd: workdir,
    compacted: !skipCompact,
    promptPath,
    attachCommand: attachCommand(name),
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

const commands: Record<string, (a: Args) => Promise<void>> = {
  launch,
  continue: continueLoop,
  list,
  status,
  kill,
  cleanup,
  "install-hooks": installHooks,
  logs,
  "log-summary": logs, // legacy alias
  stats: logStats,
};

try {
  const { command, args } = parseArgs(process.argv.slice(2));
  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
  await handler(args);
} catch (e) {
  if (e instanceof Error && e.message.startsWith("process.exit")) throw e;
  fatal(e instanceof Error ? e.message : String(e));
}
