#!/usr/bin/env bun
/**
 * validate-secrets — validate per-instance secrets before cloud-init rendering.
 *
 * Exits 0 if all secrets pass. Exits 1 with clear errors on stderr if any fail.
 * Designed to be called from clone.sh before substituting secrets into templates.
 *
 * Usage:
 *   bun run infra/scripts/validate-secrets.ts instance-secrets.toml pikachu
 *
 * Validates:
 *   CLOUDFLARED_TOKEN  — must be a CF connector token (base64url-encoded JSON blob
 *                        starting with eyJ, decoding to {"a":…,"t":…,"s":…})
 *   POSTGRES_APP_PASSWORD — must be non-empty, no shell-unsafe chars
 *   ANTHROPIC_API_KEY  — when present in the section, must match sk-ant-…
 *                        (absent is OK: the ALLOW_STUB render path supplies a
 *                        placeholder for boxes not yet keyed)
 *
 * Also validates TUNNEL_SALT when passed as a third argument:
 *   bun run infra/scripts/validate-secrets.ts instance-secrets.toml pikachu <salt>
 */

import { readFileSync } from "fs";

function die(msg: string): never {
  console.error(`[validate-secrets] ERROR: ${msg}`);
  process.exit(1);
}

function warn(msg: string) {
  console.error(`[validate-secrets] WARN:  ${msg}`);
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const [, , filePath, section, tunnelSalt] = process.argv;

if (!filePath || !section) {
  console.error("Usage: validate-secrets <toml-file> <section> [tunnel-salt]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse section from TOML (inline — keeps the script self-contained)
// ---------------------------------------------------------------------------

function getSection(text: string, name: string): Record<string, string> {
  const result: Record<string, string> = {};
  let inSection = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.match(/^\[[^\]]+\]$/)) {
      inSection = line === `[${name}]`;
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?(.*?)["']?\s*(?:#.*)?$/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

const content = readFileSync(filePath, "utf8");
const secrets = getSection(content, section);

if (Object.keys(secrets).length === 0) {
  die(`section [${section}] not found in ${filePath}`);
}

let errors = 0;

// ---------------------------------------------------------------------------
// CLOUDFLARED_TOKEN
// ---------------------------------------------------------------------------

const token = secrets["CLOUDFLARED_TOKEN"] ?? "";

if (!token) {
  console.error(`[validate-secrets] FAIL  [${section}] CLOUDFLARED_TOKEN is empty`);
  errors++;
} else {
  // CF connector tokens are a single base64url-encoded JSON blob (NOT a standard JWT).
  // Pattern: base64url characters only, starts with eyJ ({"...)
  const b64urlRe = /^eyJ[A-Za-z0-9_+/=-]+$/;
  if (!b64urlRe.test(token)) {
    console.error(`[validate-secrets] FAIL  [${section}] CLOUDFLARED_TOKEN has invalid shape (expected eyJ… base64url blob)`);
    errors++;
  } else {
    // Decode and check payload has expected CF connector keys
    try {
      const pad = token + "=".repeat((4 - (token.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
      if (!payload.a || !payload.t || !payload.s) {
        console.error(`[validate-secrets] FAIL  [${section}] CLOUDFLARED_TOKEN decoded but missing expected fields (a/t/s)`);
        errors++;
      } else {
        console.error(`[validate-secrets] OK    [${section}] CLOUDFLARED_TOKEN → tunnel=${payload.t.slice(0, 8)}…`);
      }
    } catch {
      console.error(`[validate-secrets] FAIL  [${section}] CLOUDFLARED_TOKEN could not be base64-decoded`);
      errors++;
    }
  }

  // Shell-injection guard: these chars in a sourced .env file are dangerous
  if (/["'`$\\]/.test(token)) {
    console.error(`[validate-secrets] FAIL  [${section}] CLOUDFLARED_TOKEN contains shell-unsafe chars`);
    errors++;
  }
}

// ---------------------------------------------------------------------------
// POSTGRES_APP_PASSWORD
// ---------------------------------------------------------------------------

const pgPass = secrets["POSTGRES_APP_PASSWORD"] ?? "";

if (!pgPass) {
  console.error(`[validate-secrets] FAIL  [${section}] POSTGRES_APP_PASSWORD is empty`);
  errors++;
} else if (/["'`$\\]/.test(pgPass)) {
  // Shell-injection guard (same as token — this also lands in a sourced .env)
  console.error(`[validate-secrets] FAIL  [${section}] POSTGRES_APP_PASSWORD contains shell-unsafe chars (quote/backtick/$)`);
  errors++;
} else {
  console.error(`[validate-secrets] OK    [${section}] POSTGRES_APP_PASSWORD (${pgPass.length} chars)`);
}

// ---------------------------------------------------------------------------
// ANTHROPIC_API_KEY (per-box; only some boxes are keyed yet)
// ---------------------------------------------------------------------------
// Validate the shape ONLY when the key is present. A missing key is not an error
// here: clone.sh's ALLOW_STUB path renders an obvious placeholder for boxes that
// don't have a real key yet, and refuses to render (without ALLOW_STUB) on its own.

const anthropicKey = secrets["ANTHROPIC_API_KEY"];

if (anthropicKey !== undefined) {
  if (!anthropicKey) {
    console.error(`[validate-secrets] FAIL  [${section}] ANTHROPIC_API_KEY is empty`);
    errors++;
  } else if (!/^sk-ant-[a-zA-Z0-9_-]+$/.test(anthropicKey)) {
    console.error(`[validate-secrets] FAIL  [${section}] ANTHROPIC_API_KEY has invalid shape (expected sk-ant-…)`);
    errors++;
  } else if (/["'`$\\]/.test(anthropicKey)) {
    console.error(`[validate-secrets] FAIL  [${section}] ANTHROPIC_API_KEY contains shell-unsafe chars`);
    errors++;
  } else {
    console.error(`[validate-secrets] OK    [${section}] ANTHROPIC_API_KEY (sk-ant-…, ${anthropicKey.length} chars)`);
  }
} else {
  warn(`[${section}] ANTHROPIC_API_KEY absent — clone.sh will stub it (ALLOW_STUB) or refuse to render`);
}

// ---------------------------------------------------------------------------
// TUNNEL_SALT (optional — passed as CLI arg since it's fleet-wide, not in TOML)
// ---------------------------------------------------------------------------

if (tunnelSalt !== undefined) {
  const saltRe = /^[A-Za-z0-9]{8,128}$/;
  if (!saltRe.test(tunnelSalt)) {
    console.error(`[validate-secrets] FAIL  TUNNEL_SALT has invalid shape (must be 8-128 alphanumeric chars)`);
    errors++;
  } else {
    console.error(`[validate-secrets] OK    TUNNEL_SALT (${tunnelSalt.length} chars)`);
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (errors > 0) {
  console.error(`[validate-secrets] ${errors} error(s) — refusing to render`);
  process.exit(1);
}

console.error(`[validate-secrets] all checks passed for [${section}]`);
process.exit(0);
