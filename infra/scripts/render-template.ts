#!/usr/bin/env bun
/**
 * render-template — substitute {{PLACEHOLDERS}} in a template file.
 *
 * Reads the template from a file, substitutes every {{KEY}} with the
 * corresponding value from --data (JSON), and writes the result to stdout.
 * Exits 1 if any placeholder is left unresolved.
 *
 * Usage:
 *   bun run infra/scripts/render-template.ts <template> --data '<json>'
 *   bun run infra/scripts/render-template.ts <template> --data-file <file.json>
 *
 * Example (in clone.sh):
 *   json=$(jq -n \
 *     --arg h  "$host" \
 *     --arg ak "$openclaw_api_key_b64" \
 *     --arg du "$desktop_user" \
 *     --arg dp "$desktop_pass" \
 *     --arg ts "$tunnel_salt" \
 *     --arg ct "$cloudflared_token" \
 *     --arg pp "$postgres_pass" \
 *     '{HOSTNAME:$h, OPENCLAW_API_KEY_B64:$ak, DESKTOP_USER:$du,
 *       DESKTOP_PASS:$dp, TUNNEL_SALT:$ts, CLOUDFLARED_TOKEN:$ct,
 *       POSTGRES_APP_PASSWORD:$pp}')
 *   bun run infra/scripts/render-template.ts infra/cloud-init/template.yaml \
 *     --data "$json" > "infra/cloud-init/generated/${host}.cloud-init.yaml"
 *
 * Why Bun instead of bash string replacement?
 *   The bash `${var//\{\{KEY\}\}/$value}` approach silently drops or corrupts
 *   values that contain backslashes, ampersands, or newlines. This script treats
 *   values as opaque strings (no special characters in the replacement), which
 *   is correct behaviour for secrets.
 */

import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const templatePath = args[0];
const dataIdx = args.indexOf("--data");
const dataFileIdx = args.indexOf("--data-file");

if (!templatePath) {
  console.error("Usage: render-template <template> --data '<json>'");
  console.error("       render-template <template> --data-file <file.json>");
  process.exit(1);
}

let dataJson: string | undefined;
if (dataIdx !== -1) {
  dataJson = args[dataIdx + 1];
} else if (dataFileIdx !== -1) {
  dataJson = readFileSync(args[dataFileIdx + 1], "utf8");
}

if (!dataJson) {
  console.error("Error: --data '<json>' or --data-file <file> required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse data
// ---------------------------------------------------------------------------

let data: Record<string, string>;
try {
  data = JSON.parse(dataJson);
} catch (e) {
  console.error(`Error: --data is not valid JSON: ${e}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load + render
// ---------------------------------------------------------------------------

const template = readFileSync(templatePath, "utf8");

let rendered = template;
for (const [key, value] of Object.entries(data)) {
  // Replace ALL occurrences of {{KEY}}. Use split/join to avoid regex special
  // chars in either the key or the value corrupting the replacement.
  rendered = rendered.split(`{{${key}}}`).join(value);
}

// ---------------------------------------------------------------------------
// Check for unresolved placeholders
// ---------------------------------------------------------------------------

const unresolved = [...rendered.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map(m => m[1]);
const unique = [...new Set(unresolved)];

if (unique.length > 0) {
  console.error(`Error: unresolved placeholder(s) in ${templatePath}: ${unique.join(", ")}`);
  console.error(`Provided keys: ${Object.keys(data).join(", ")}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write to stdout
// ---------------------------------------------------------------------------

process.stdout.write(rendered);
