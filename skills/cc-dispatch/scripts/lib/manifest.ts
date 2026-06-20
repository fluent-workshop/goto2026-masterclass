#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Session manifest — persistent metadata for CC dispatch sessions.
 * Tracks what issue/mode/repo/worktree spawned each session.
 */

export interface SessionEntry {
  name: string;
  issueUrl?: string;
  repo: string;
  mode: "interactive" | "autonomous";
  worktree?: string;
  branch?: string;
  briefPath?: string;
  launchedAt: string;
  status: "running" | "completed" | "killed" | "cleaned_up";
}

export interface Manifest {
  version: 1;
  sessions: SessionEntry[];
}

const MANIFEST_FILE = ".scratch/cc-sessions.json";

function manifestPath(workspace: string): string {
  return `${workspace}/${MANIFEST_FILE}`;
}

/** Load manifest from disk, creating an empty one if it doesn't exist. */
export async function loadManifest(workspace: string): Promise<Manifest> {
  const path = manifestPath(workspace);
  const file = Bun.file(path);

  if (await file.exists()) {
    try {
      const data = await file.json();
      if (data?.version === 1 && Array.isArray(data.sessions)) {
        return data as Manifest;
      }
    } catch {
      console.error(`warning: corrupted manifest at ${path}, starting fresh`);
    }
  }

  return { version: 1, sessions: [] };
}

/** Save manifest to disk. */
export async function saveManifest(workspace: string, manifest: Manifest): Promise<void> {
  const path = manifestPath(workspace);
  // Ensure .scratch/ exists
  await Bun.write(`${workspace}/.scratch/.keep`, "");
  await Bun.write(path, JSON.stringify(manifest, null, 2) + "\n");
}

/** Add a session entry to the manifest. */
export function addSession(manifest: Manifest, entry: SessionEntry): void {
  // Remove any existing entry with the same name
  manifest.sessions = manifest.sessions.filter((s) => s.name !== entry.name);
  manifest.sessions.push(entry);
}

/** Update fields on an existing session entry. */
export function updateSession(
  manifest: Manifest,
  name: string,
  updates: Partial<SessionEntry>,
): void {
  const entry = manifest.sessions.find((s) => s.name === name);
  if (entry) {
    Object.assign(entry, updates);
  }
}

/** Remove a session entry from the manifest. */
export function removeSession(manifest: Manifest, name: string): void {
  manifest.sessions = manifest.sessions.filter((s) => s.name !== name);
}
