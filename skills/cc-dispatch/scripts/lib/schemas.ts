import { z } from "zod"

// --- manifest.yml ---

export const NotifyEntrySchema = z.object({
  channel: z.string().regex(/^[a-z]+$/, "channel must be lowercase alpha"),
  to: z.string().max(200),
  accountId: z.string().max(100).optional(),
})

export const ManifestSchema = z.object({
  notify: z.array(NotifyEntrySchema).default([]),
})

export type Manifest = z.infer<typeof ManifestSchema>
export type NotifyEntry = z.infer<typeof NotifyEntrySchema>

// --- sessions.json ---

export const SessionEntrySchema = z.object({
  name: z.string(),
  repo: z.string(),
  mode: z.enum(["autonomous", "interactive"]),
  worktree: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  briefPath: z.string().optional(),
  issueUrl: z.string().optional(),
  launchedAt: z.string().datetime(),
  status: z.enum(["running", "completed", "failed"]),
})

export const SessionsFileSchema = z.object({
  version: z.literal(1),
  sessions: z.array(SessionEntrySchema).default([]),
})

export type SessionsFile = z.infer<typeof SessionsFileSchema>
export type SessionEntry = z.infer<typeof SessionEntrySchema>
