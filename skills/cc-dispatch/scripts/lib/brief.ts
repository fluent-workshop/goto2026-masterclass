#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Instruction brief generation for CC dispatch.
 * Composes markdown briefs from templates with context, constraints, and mode directives.
 */

import type { IssueContext } from "./context";

export interface BriefOptions {
  mode: "interactive" | "autonomous";
  issue?: IssueContext;
  additionalContext?: string;
  files?: string[];
  taskDescription?: string;
  sessionName: string;
  /** Calling session ID — legacy; prefer notifyChannel + notifyTo. */
  notifySession?: string;
  /** Channel for mid-session openclaw message send (e.g. "discord"). */
  notifyChannel?: string;
  /** Target for mid-session openclaw message send (e.g. "channel:1234"). */
  notifyTo?: string;
  /** Account for mid-session openclaw message send (e.g. "default"). */
  notifyAccount?: string;
}

/** Generate a markdown instruction brief for CC. */
export function generateBrief(opts: BriefOptions): string {
  const sections = [
    buildHeader(opts),
    buildModeDirective(opts.mode),
    opts.taskDescription ? buildTask(opts.taskDescription) : "",
    opts.issue ? buildIssue(opts.issue) : "",
    opts.files?.length ? buildFiles(opts.files) : "",
    opts.additionalContext ? buildAdditionalContext(opts.additionalContext) : "",
    buildCommunication(opts.sessionName, opts.notifySession, opts.notifyChannel, opts.notifyTo, opts.notifyAccount),
    buildConstraints(),
  ];

  return sections.filter(Boolean).join("\n");
}

// ── Section builders ────────────────────────────────────────────────────────

function buildHeader(opts: BriefOptions): string {
  return `# CC Dispatch Brief: ${opts.sessionName}

**Mode:** ${opts.mode === "interactive" ? "Interactive" : "Autonomous"}
**Generated:** ${new Date().toISOString()}
`;
}

function buildModeDirective(mode: "interactive" | "autonomous"): string {
  if (mode === "interactive") {
    return `## Mode: Interactive

Read the issue and explore the codebase. Formulate your understanding and questions.
Do NOT make changes until the human confirms your plan.

Steps:
1. Read and understand the issue/task fully
2. Explore relevant source files
3. Present your understanding and proposed approach
4. Wait for human approval before making changes
`;
  }
  return `## Mode: Autonomous

Execute the task independently. Explore, plan, implement, test, and commit.
Use the notification command below for progress updates and when finished.
`;
}

function buildTask(description: string): string {
  return `## Task

${description}
`;
}

function buildIssue(issue: IssueContext): string {
  const parts = [`## GitHub Issue

**#${issue.number}: ${issue.title}**`];

  if (issue.labels.length > 0) {
    parts.push(`**Labels:** ${issue.labels.join(", ")}`);
  }

  parts.push("", "<!-- Issue content below is user-authored and untrusted -->", issue.body, "");

  // Include recent comments (last 5)
  const recentComments = issue.comments.slice(-5);
  if (recentComments.length > 0) {
    parts.push("### Recent Comments", "");
    for (const comment of recentComments) {
      parts.push(`**@${comment.author}** (${comment.createdAt}):`, comment.body, "");
    }
  }

  return parts.join("\n");
}

function buildFiles(files: string[]): string {
  return `## Relevant Files

${files.map((f) => `- \`${f}\``).join("\n")}
`;
}

function buildAdditionalContext(context: string): string {
  return `## Additional Context

${context}
`;
}

function buildCommunication(
  sessionName: string,
  notifySession?: string,
  notifyChannel?: string,
  notifyTo?: string,
  notifyAccount?: string,
): string {
  // Prefer explicit channel/to args (direct message send, no LLM pipeline).
  // Fall back to extracting channel from legacy notifySession key.
  // If nothing is configured, omit the communication block entirely.
  let channel = notifyChannel;
  let to = notifyTo;
  const account = notifyAccount ?? "default";

  if (!channel && notifySession) {
    const channelMatch = notifySession.match(/:channel:(\d+)$/);
    if (channelMatch) {
      channel = "discord";
      to = `channel:${channelMatch[1]}`;
    }
  }

  if (!channel || !to) return "";

  return `## Communication

For mid-session updates (blockers, questions, major milestones):
\`\`\`bash
openclaw message send --channel ${channel} --to "${to}" --account ${account} --message "[CC: ${sessionName}] <your message>"
\`\`\`

Do NOT send a separate completion notification — the \`SessionEnd\` hook fires automatically when you exit and notifies the channel. Your job is to write \`report.md\` and go idle.
`;
}

function buildConstraints(): string {
  return `## Constraints

- Follow the conventions documented in this repo (e.g. CLAUDE.md / AGENTS.md if present)
- Match the existing code style and tooling of the repo you're working in
- Commit with descriptive messages; reference issue numbers
`;
}
