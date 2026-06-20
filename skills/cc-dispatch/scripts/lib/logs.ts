#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * CC session log parsing — reads Claude Code JSONL session logs
 * with filtering, search, and stats.
 */

export interface LogMessage {
  type: string;
  role?: string;
  summary: string;
  timestamp?: string;
  toolName?: string;
  filePath?: string;
}

export interface LogFilter {
  /** Preset filter: tools, errors, edits, user, assistant */
  preset?: string;
  /** Regex pattern to match against message content */
  grep?: string;
  /** Only messages after this ISO timestamp or relative (e.g. "30m", "2h") */
  since?: string;
  /** Number of matching results to return (applied AFTER filtering) */
  limit: number;
}

export interface LogStats {
  totalLines: number;
  duration?: { start?: string; end?: string; seconds?: number };
  byType: Record<string, number>;
  toolCalls: Record<string, number>;
  filesEdited: string[];
  filesCreated: string[];
  filesRead: string[];
}

// ── Path helpers ────────────────────────────────────────────────────────────

/**
 * Encode a filesystem path the way Claude Code does for its project directories.
 */
export function encodeProjectPath(path: string): string {
  return path.replaceAll(/[/.]/g, "-");
}

export function sessionLogPath(sessionId: string, projectPath: string): string {
  const encoded = encodeProjectPath(projectPath);
  return process.env.HOME + "/.claude/projects/" + encoded + "/" + sessionId + ".jsonl";
}

// ── Parsing ─────────────────────────────────────────────────────────────────

interface RawEntry {
  type?: string;
  message?: { content?: unknown };
  tool_name?: string;
  name?: string;
  timestamp?: string;
  // tool_use fields
  input?: { file_path?: string; path?: string; command?: string };
}

function parseEntry(raw: RawEntry): LogMessage | null {
  if (raw.type === "user") {
    const content = raw.message?.content;
    const text = typeof content === "string" ? content.slice(0, 200) : "[complex content]";
    return { type: "user", role: "user", summary: text, timestamp: raw.timestamp };
  }

  if (raw.type === "assistant") {
    const content = raw.message?.content;
    if (Array.isArray(content)) {
      const textParts = content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => c.text)
        .join("\n");
      return { type: "assistant", role: "assistant", summary: textParts.slice(0, 300), timestamp: raw.timestamp };
    }
    return null;
  }

  if (raw.type === "tool_use" || raw.type === "tool_result") {
    const toolName = typeof raw.tool_name === "string" ? raw.tool_name : typeof raw.name === "string" ? raw.name : "unknown";
    const filePath = raw.input?.file_path ?? raw.input?.path;
    return {
      type: raw.type,
      summary: toolName + (filePath ? " " + filePath : ""),
      timestamp: raw.timestamp,
      toolName,
      filePath: typeof filePath === "string" ? filePath : undefined,
    };
  }

  return null;
}

// ── Filtering ───────────────────────────────────────────────────────────────

const PRESETS: Record<string, (msg: LogMessage, raw: RawEntry) => boolean> = {
  tools: (msg) => msg.type === "tool_use" || msg.type === "tool_result",
  edits: (msg) => msg.type === "tool_use" && (msg.toolName === "Edit" || msg.toolName === "Write"),
  reads: (msg) => msg.type === "tool_use" && msg.toolName === "Read",
  errors: (_msg, raw) => {
    const str = JSON.stringify(raw);
    return /error|fail|exception|crash|panic|traceback/i.test(str);
  },
  user: (msg) => msg.role === "user",
  assistant: (msg) => msg.role === "assistant",
};

function resolveTimestamp(since: string): number {
  // Relative: "30m", "2h", "1d"
  const relMatch = /^(\d+)([mhd])$/.exec(since);
  if (relMatch) {
    const val = Number.parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const ms = unit === "m" ? val * 60000 : unit === "h" ? val * 3600000 : val * 86400000;
    return Date.now() - ms;
  }
  // ISO timestamp
  const ts = new Date(since).getTime();
  if (Number.isNaN(ts)) return 0;
  return ts;
}

function matchesFilter(msg: LogMessage, raw: RawEntry, filter: LogFilter): boolean {
  if (filter.preset) {
    const fn = PRESETS[filter.preset];
    if (fn && !fn(msg, raw)) return false;
  }

  if (filter.grep) {
    const re = new RegExp(filter.grep, "i");
    if (!re.test(msg.summary) && !re.test(JSON.stringify(raw))) return false;
  }

  if (filter.since && msg.timestamp) {
    const cutoff = resolveTimestamp(filter.since);
    const msgTime = new Date(msg.timestamp).getTime();
    if (msgTime < cutoff) return false;
  }

  return true;
}

// ── Main API ────────────────────────────────────────────────────────────────

/**
 * Parse and filter CC session logs. Scans backward from end of file,
 * collects `limit` matching entries, then returns in chronological order.
 */
export function querySessionLog(content: string, filter: LogFilter): { totalLines: number; messages: LogMessage[] } {
  const allLines = content.trim().split("\n");
  const results: LogMessage[] = [];

  // Scan backward to get last N matching entries
  for (let i = allLines.length - 1; i >= 0 && results.length < filter.limit; i--) {
    try {
      const raw: RawEntry = JSON.parse(allLines[i]);
      const msg = parseEntry(raw);
      if (msg && matchesFilter(msg, raw, filter)) {
        results.push(msg);
      }
    } catch {
      // Skip unparseable lines
    }
  }

  // Reverse to chronological order
  results.reverse();

  return { totalLines: allLines.length, messages: results };
}

/**
 * Compute stats across the entire session log.
 */
export function computeStats(content: string): LogStats {
  const allLines = content.trim().split("\n");
  const byType: Record<string, number> = {};
  const toolCalls: Record<string, number> = {};
  const editedFiles = new Set<string>();
  const createdFiles = new Set<string>();
  const readFiles = new Set<string>();
  let firstTs: string | undefined;
  let lastTs: string | undefined;

  for (const line of allLines) {
    try {
      const raw: RawEntry = JSON.parse(line);
      const type = raw.type ?? "unknown";
      byType[type] = (byType[type] ?? 0) + 1;

      if (raw.timestamp) {
        if (!firstTs) firstTs = raw.timestamp;
        lastTs = raw.timestamp;
      }

      if (type === "tool_use") {
        const toolName = typeof raw.tool_name === "string" ? raw.tool_name : typeof raw.name === "string" ? raw.name : "unknown";
        toolCalls[toolName] = (toolCalls[toolName] ?? 0) + 1;

        const filePath = raw.input?.file_path ?? raw.input?.path;
        if (typeof filePath === "string") {
          if (toolName === "Edit") editedFiles.add(filePath);
          else if (toolName === "Write") createdFiles.add(filePath);
          else if (toolName === "Read") readFiles.add(filePath);
        }
      }
    } catch {
      // Skip
    }
  }

  let seconds: number | undefined;
  if (firstTs && lastTs) {
    seconds = Math.round((new Date(lastTs).getTime() - new Date(firstTs).getTime()) / 1000);
  }

  return {
    totalLines: allLines.length,
    duration: { start: firstTs, end: lastTs, seconds },
    byType,
    toolCalls,
    filesEdited: [...editedFiles].sort(),
    filesCreated: [...createdFiles].sort(),
    filesRead: [...readFiles].sort(),
  };
}

// Legacy compat
export function parseSessionLog(content: string, lineCount: number): { totalLines: number; messages: LogMessage[] } {
  return querySessionLog(content, { limit: lineCount });
}
