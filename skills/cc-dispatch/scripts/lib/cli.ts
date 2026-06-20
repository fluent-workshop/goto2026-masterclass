#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * CLI argument parsing and output helpers for cc-dispatch.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type Args = Record<string, string | boolean>;

// ── Output ──────────────────────────────────────────────────────────────────

export function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function fatal(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

export function parseIntSafe(val: string, name: string): number {
  const n = Number.parseInt(val, 10);
  if (Number.isNaN(n)) fatal(`--${name} must be a number, got "${val}"`);
  return n;
}

// ── Arg parsing ─────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): { command: string; args: Args } {
  const command = argv[0];
  if (!command) {
    printUsage();
    process.exit(1);
  }

  const args: Args = {};
  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
        i += 1;
      } else {
        args[key] = next;
        i += 2; // skip key + value
      }
    } else {
      i += 1;
    }
  }
  return { command, args };
}

export function requireArg(args: Args, name: string): string {
  const val = args[name];
  if (val === undefined || val === true) fatal(`Missing required option: --${name}`);
  return val as string;
}

export function optionalArg(args: Args, name: string): string | undefined;
export function optionalArg(args: Args, name: string, fallback: string): string;
export function optionalArg(args: Args, name: string, fallback?: string): string | undefined {
  const val = args[name];
  if (val === undefined) return fallback;
  if (val === true) fatal(`--${name} requires a value`);
  return val as string;
}

export function hasFlag(args: Args, name: string): boolean {
  return args[name] === true;
}

// ── Usage ───────────────────────────────────────────────────────────────────

export function printUsage(): void {
  console.error(`Usage: cc-dispatch <command> [options]

Commands:
  launch        Launch a new CC session in tmux
                --issue-url <url>          GitHub issue URL (extracts repo + issue number)
                --issue <N>                GitHub issue number (requires --repo)
                --mode interactive|autonomous (default: autonomous)
                --task "description"       Task description (required if no --issue)
                --files path1,path2        Additional files to include in brief
                --repo owner/repo          GitHub repo or local path (required unless --issue-url)
                --loop <loop-NNN-slug>     Loop folder (must be loop-NNN-descriptive-slug)
                --name <session-name>      Custom session name (default: repo/worktree basename)
                --worktree                 Create isolated git worktree for this session
                --force-worktree           Create worktree even if working tree is dirty
                --notify-channel <ch>      Delivery channel (e.g. discord)
                --notify-to <target>       Recipient (e.g. channel:1234)
                --notify-account <id>      Account id (e.g. default)
                --notify-wake-session <k>  Orchestrator session key to WAKE on
                                           intervention/failure/completion (not per-turn)
                NOTE: one session per cwd. If one already runs for the repo/worktree,
                      use 'continue' or relaunch with --worktree for parallel work.

  continue      Compact → continue an existing session into the next loop
                --session <name>           Existing session name (required, must be alive)
                --loop <loop-NNN-slug>     Next loop folder (required)
                --compact "keep:...;drop:..."  Compaction instruction (saved to loop's compact.md)
                --compact-file <path>      Read compaction instruction from a file
                --no-compact               Skip compaction; just send the next /goal

  list          List active CC sessions

  status        Show session status with recent pane output
                --session <name>           Session name (required)
                --lines <N>                Number of lines to capture (default: 50)

  kill          Kill a CC session
                --session <name>           Session name (required)

  cleanup       Remove worktree and manifest entry (requires user confirmation)
                --session <name>           Session name (required)
                --confirm                  Skip confirmation prompt

  logs          Query CC session logs with filtering
                --session-id <uuid>        CC session UUID (required)
                --lines <N>                Number of matching results (default: 20)
                --filter <preset>          Preset: tools, edits, reads, errors, user, assistant
                --grep <pattern>           Regex pattern to match across message content
                --since <time>             Time filter: "30m", "2h", "1d", or ISO timestamp
                --project <path>           Project path (default: workspace)

  stats         Session statistics (duration, tool calls, files touched)
                --session-id <uuid>        CC session UUID (required)
                --project <path>           Project path (default: workspace)`);
}
