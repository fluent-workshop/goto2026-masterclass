#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * tmux session lifecycle and git worktree management for CC dispatch.
 */

import { $ } from "bun";

export interface SessionInfo {
  name: string;
  created: string;
  attached: boolean;
  width: number;
  height: number;
}

/**
 * Poll a tmux pane until Claude Code's input prompt appears.
 * Looks for the `>` prompt character that CC renders when ready for input.
 * Times out after maxWaitMs (default 15s) and proceeds anyway.
 */
async function waitForPrompt(name: string, maxWaitMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const pane = await $`tmux capture-pane -t ${name} -p`.text();
      // CC shows ">" at start of line when ready for input
      if (/^[>❯]/m.test(pane)) return true;
    } catch {
      // pane not ready yet
    }
    await Bun.sleep(500);
  }
  return false; // timed out — proceed anyway
}

/** Create a detached tmux session and launch Claude Code inside it. */
export async function createSession(opts: {
  name: string;
  briefPath: string;
  mode: "interactive" | "autonomous";
  workdir?: string;
  issueNum?: number;
  slug?: string;
}): Promise<void> {
  const { name, briefPath, mode, workdir = process.cwd(), issueNum, slug } = opts;

  // Create detached session (catch duplicate instead of TOCTOU check)
  try {
    await $`tmux new-session -d -s ${name} -c ${workdir} -x 200 -y 50`;
  } catch {
    throw new Error(`tmux session '${name}' already exists or tmux is not available`);
  }

  // Set CC environment vars in the tmux session
  const taskListId = issueNum
    ? `evie-${String(issueNum).padStart(4, "0")}-${slug ?? name}`
    : `evie-${slug ?? name}`;
  await $`tmux send-keys -t ${name} ${"export CLAUDE_CODE_TASK_LIST_ID=" + taskListId} Enter`.quiet();
  await $`tmux send-keys -t ${name} "export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" Enter`.quiet();
  await Bun.sleep(300);

  // Build the claude command — interactive mode doesn't skip permissions
  const claudeArgs = ["claude"];
  if (mode === "autonomous") {
    claudeArgs.push("--dangerously-skip-permissions");
  }

  // Launch CC and paste brief — clean up tmux session on failure
  try {
    await $`tmux send-keys -t ${name} ${claudeArgs.join(" ")} Enter`.quiet();

    // Wait for CC prompt to appear before pasting
    await waitForPrompt(name);

    // Use tmux load-buffer + bracketed paste for clean multi-line input
    const tmpBuf = `/tmp/cc-brief-${name}-${Date.now()}.txt`;
    try {
      const brief = await Bun.file(briefPath).text();
      await Bun.write(tmpBuf, brief);
      await $`tmux load-buffer ${tmpBuf}`.quiet();
      await $`tmux paste-buffer -p -t ${name}`.quiet();
    } finally {
      await $`rm -f ${tmpBuf}`.quiet();
    }

    // Give CC time to receive the bracketed paste, then submit
    await Bun.sleep(2000);
    await $`tmux send-keys -t ${name} Enter`.quiet();
  } catch (e) {
    // Kill orphaned tmux session on failure
    try { await $`tmux kill-session -t ${name}`.quiet(); } catch { /* already gone */ }
    throw e;
  }
}

/** List all active tmux sessions (no prefix filter — manifest tracks ownership). */
export async function listSessions(): Promise<SessionInfo[]> {
  try {
    const fmt = "#{session_name}|#{session_created}|#{session_attached}|#{window_width}|#{window_height}";
    const raw = await $`tmux list-sessions -F ${fmt}`.text();
    return raw
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, created, attached, width, height] = line.split("|");
        return {
          name,
          created: new Date(Number.parseInt(created, 10) * 1000).toISOString(),
          attached: attached === "1",
          width: Number.parseInt(width, 10),
          height: Number.parseInt(height, 10),
        };
      });
  } catch {
    return []; // tmux not running or no sessions
  }
}

/** Kill a tmux session by name. No-op if session doesn't exist. */
export async function killSession(name: string): Promise<void> {
  try {
    await $`tmux kill-session -t ${name}`.quiet();
  } catch {
    // Session already gone — not an error
  }
}

/** Capture the last N lines from a tmux pane. */
export async function capturePane(name: string, lines = 100): Promise<string> {
  try {
    return await $`tmux capture-pane -t ${name} -p -S -${lines}`.text();
  } catch {
    return "";
  }
}

/** Send additional instructions to a running CC session reliably. */
export async function sendInstruction(name: string, text: string): Promise<void> {
  const tmpBuf = `/tmp/cc-instruction-${name}-${Date.now()}.txt`;
  try {
    await Bun.write(tmpBuf, text);
    await $`tmux load-buffer ${tmpBuf}`.quiet();
    await $`tmux paste-buffer -p -t ${name}`.quiet();
  } finally {
    await $`rm -f ${tmpBuf}`.quiet();
  }
  await Bun.sleep(2000);
  await $`tmux send-keys -t ${name} Enter`.quiet();
}

/** Get the tmux attach command for a session. */
export function attachCommand(name: string): string {
  return `tmux attach -t ${name}`;
}

// ── Git Worktree ────────────────────────────────────────────────────────────

/** Check if the git working tree has uncommitted changes. */
export async function isTreeDirty(repoPath: string): Promise<boolean> {
  const status = await $`git -C ${repoPath} status --porcelain`.text();
  return status.trim().length > 0;
}

/** Get list of dirty files. */
export async function dirtyFiles(repoPath: string): Promise<string[]> {
  const status = await $`git -C ${repoPath} status --porcelain`.text();
  return status
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.slice(3)); // strip status prefix
}

/** Create a git worktree for an isolated CC session. */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  try {
    await $`git -C ${repoPath} worktree add ${worktreePath} -b ${branchName}`;
  } catch (e) {
    throw new Error(`Failed to create worktree at ${worktreePath}: ${e}`);
  }
}

/** Remove a git worktree and prune. Returns true if removed, false if already gone. */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<boolean> {
  try {
    await $`git -C ${repoPath} worktree remove ${worktreePath} --force`;
    await $`git -C ${repoPath} worktree prune`.quiet();
    return true;
  } catch (e) {
    // Check if the worktree is actually gone
    const list = await $`git -C ${repoPath} worktree list`.text();
    if (!list.includes(worktreePath)) return true; // already gone
    console.error(`warning: failed to remove worktree ${worktreePath}: ${e}`);
    return false;
  }
}
