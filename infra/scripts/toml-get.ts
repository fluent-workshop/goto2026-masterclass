#!/usr/bin/env bun
/**
 * toml-get — extract a named section from a simple TOML file as JSON.
 *
 * Designed for instance-secrets.toml which uses the pattern:
 *   [boxname]
 *   KEY = "value"
 *
 * Usage:
 *   toml-get <file> <section>            → JSON object of that section
 *   toml-get <file> <section> <key>      → raw string value (no quotes)
 *   toml-get <file> --sections           → JSON array of section names
 *
 * Examples:
 *   bun run infra/scripts/toml-get.ts instance-secrets.toml pikachu
 *   # → {"CLOUDFLARED_TOKEN":"eyJ…","POSTGRES_APP_PASSWORD":"correct-horse"}
 *
 *   bun run infra/scripts/toml-get.ts instance-secrets.toml pikachu CLOUDFLARED_TOKEN
 *   # → eyJ…
 *
 *   # In clone.sh:
 *   token=$(bun run infra/scripts/toml-get.ts instance-secrets.toml "$host" CLOUDFLARED_TOKEN)
 */

import { readFileSync } from "fs";

const [, , filePath, sectionOrFlag, key] = process.argv;

if (!filePath) {
  console.error("Usage: toml-get <file> <section> [key]");
  console.error("       toml-get <file> --sections");
  process.exit(1);
}

const content = readFileSync(filePath, "utf8");

// ---------------------------------------------------------------------------
// Minimal TOML parser for [section] / KEY = "value" files.
// Handles:  KEY = "value"  and  KEY = 'value'
// Does NOT handle: multi-line strings, arrays, inline tables, dates.
// That's intentional — instance-secrets.toml is flat string KV only.
// ---------------------------------------------------------------------------

function parseToml(text: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let currentSection: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    // Skip blank lines and comments
    if (!line || line.startsWith("#")) continue;

    // Section header [name]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      result[currentSection] ??= {};
      continue;
    }

    // Key = "value" or Key = 'value'
    const kvMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["'](.*)["']\s*(?:#.*)?$/);
    if (kvMatch && currentSection) {
      result[currentSection][kvMatch[1]] = kvMatch[2];
      continue;
    }

    // Key = value (unquoted — warn but continue)
    const kvBare = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/);
    if (kvBare && currentSection) {
      result[currentSection][kvBare[1]] = kvBare[2];
    }
  }

  return result;
}

const toml = parseToml(content);

// --sections: print section names as JSON array
if (sectionOrFlag === "--sections") {
  console.log(JSON.stringify(Object.keys(toml)));
  process.exit(0);
}

const section = sectionOrFlag;
if (!section) {
  console.error("Error: section name required");
  process.exit(1);
}

const data = toml[section];
if (!data) {
  console.error(`Error: section [${section}] not found in ${filePath}`);
  process.exit(1);
}

// Single key lookup — print raw value (no quotes, no JSON wrapping)
if (key) {
  const value = data[key];
  if (value === undefined) {
    console.error(`Error: key "${key}" not found in [${section}]`);
    process.exit(1);
  }
  process.stdout.write(value); // no trailing newline — safe for $(…) capture
  process.exit(0);
}

// Full section — print as JSON
console.log(JSON.stringify(data, null, 2));
