#!/usr/bin/env bun
/**
 * create-tunnel-dns.ts — Create 6 CNAME records per box (84 total) in fluentworkshop.dev,
 * each pointing to {tunnel-id}.cfargotunnel.com.
 *
 * See ../SKILL.md for full hostname pattern documentation.
 *
 * Usage:
 *   TUNNEL_SALT=<value> bun run .claude/skills/cloudflare/scripts/create-tunnel-dns.ts [--dry-run] [--box pikachu,...]
 *
 * Requires: Cloudflare API token with Tunnel:Read + Zone:DNS:Edit.
 * Set via CLOUDFLARE_TOKEN env var or ~/.openclaw/credentials/cloudflare-tunnel-api-key.
 * Falls back to cloudflare-api-key (DNS:Edit only) — DNS writes will work but
 * tunnel ID lookup will fail if that token lacks Tunnel:Read.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { cfFetch, ACCOUNT_ID, ZONE_ID, DOMAIN, TUNNEL_PREFIX } from './playwright-helpers.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, '../../../..');
const INSTANCES_TXT = resolve(REPO_ROOT, 'instances.txt');
const TOML_PATH = resolve(REPO_ROOT, 'instance-secrets.toml');

const CF_TOKEN_PATH = (() => {
  const tunnel = resolve(process.env.HOME!, '.openclaw/credentials/cloudflare-tunnel-api-key');
  const dns    = resolve(process.env.HOME!, '.openclaw/credentials/cloudflare-api-key');
  try { readFileSync(tunnel); return tunnel; } catch { return dns; }
})();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const boxFilter = args.find(a => a.startsWith('--box='))?.split('=')[1]?.split(',');

const TUNNEL_SALT = process.env.TUNNEL_SALT ?? (() => {
  console.error('Error: TUNNEL_SALT env var required (from 1Password: op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT)');
  process.exit(1);
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash8(hostname: string, salt: string): string {
  return createHash('sha256').update(hostname + salt).digest('hex').slice(0, 8);
}

function hostnames(box: string): string[] {
  const h = hash8(box, TUNNEL_SALT as string);
  return [
    `${box}-${TUNNEL_PREFIX}-app.${DOMAIN}`,
    `${box}-${TUNNEL_PREFIX}-desktop-${h}.${DOMAIN}`,
    `${box}-${TUNNEL_PREFIX}-supabase-studio-${h}.${DOMAIN}`,
    `${box}-${TUNNEL_PREFIX}-gateway-${h}.${DOMAIN}`,
    `${box}-${TUNNEL_PREFIX}-ssh-${h}.${DOMAIN}`,
    `${box}-${TUNNEL_PREFIX}-postgres-${h}.${DOMAIN}`,
  ];
}

function readInstances(): string[] {
  return readFileSync(INSTANCES_TXT, 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function getToken(box: string): string {
  const toml = readFileSync(TOML_PATH, 'utf8');
  return toml.match(new RegExp(`\\[${box}\\][^\\[]*CLOUDFLARED_TOKEN\\s*=\\s*"([^"]*)"`))
    ?.[1] ?? '';
}

// Sidecar written by decode-tunnel-ids.ts (or manually) — avoids needing Tunnel:Read scope
const TUNNEL_IDS_SIDECAR = resolve(REPO_ROOT, 'infra/tunnel-ids.json');
let _sidecar: Record<string, string> | null = null;
function sidecarIds(): Record<string, string> {
  if (_sidecar) return _sidecar;
  try { _sidecar = JSON.parse(readFileSync(TUNNEL_IDS_SIDECAR, 'utf8')); } catch { _sidecar = {}; }
  return _sidecar!;
}

async function getTunnelId(name: string): Promise<string | null> {
  // Try sidecar first (no API scope needed)
  const box = name.replace(new RegExp(`^${TUNNEL_PREFIX}-`), '');
  const fromSidecar = sidecarIds()[box];
  if (fromSidecar) return fromSidecar;

  // Fall back to API (requires Tunnel:Read scope)
  const data = await cfFetch(
    `/accounts/${ACCOUNT_ID}/cfd_tunnel?name=${encodeURIComponent(name)}&is_deleted=false`,
    CF_TOKEN_PATH
  );
  return data?.result?.[0]?.id ?? null;
}

async function recordExists(name: string): Promise<boolean> {
  const data = await cfFetch(
    `/zones/${ZONE_ID}/dns_records?name=${encodeURIComponent(name)}&type=CNAME`,
    CF_TOKEN_PATH
  );
  return (data?.result?.length ?? 0) > 0;
}

async function createCname(name: string, target: string): Promise<boolean> {
  if (await recordExists(name)) {
    console.log(`    ⏭  ${name} (exists)`);
    return true;
  }
  if (DRY_RUN) { console.log(`    [dry] CNAME ${name} → ${target}`); return true; }
  const data = await cfFetch(`/zones/${ZONE_ID}/dns_records`, CF_TOKEN_PATH, {
    method: 'POST',
    body: JSON.stringify({ type: 'CNAME', name, content: target, ttl: 1, proxied: false }),
  });
  if (data?.success) { console.log(`    ✓ ${name}`); return true; }
  console.error(`    ✗ ${name}: ${JSON.stringify(data?.errors)}`);
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const allBoxes = readInstances();
  const boxes = boxFilter ? allBoxes.filter(b => boxFilter.includes(b)) : allBoxes;
  console.log(`\n🌐 create-tunnel-dns ${DRY_RUN ? '[DRY RUN] ' : ''}— ${boxes.length} box(es)`);

  let created = 0, failed = 0;

  for (const box of boxes) {
    if (!getToken(box)) {
      console.log(`\n  ⏭  ${box}: no token in instance-secrets.toml — skipping`);
      continue;
    }
    const tunnelName = `${TUNNEL_PREFIX}-${box}`;
    process.stdout.write(`\n  ${box}: looking up tunnel ID…`);
    const id = await getTunnelId(tunnelName);
    if (!id) { console.log(` ✗ "${tunnelName}" not found`); failed++; continue; }
    console.log(` ${id.slice(0, 8)}…`);

    const target = `${id}.cfargotunnel.com`;
    for (const name of hostnames(box)) {
      (await createCname(name, target)) ? created++ : failed++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Created/skipped: ${created}  ❌ Failed: ${failed}`);
  console.log('Next: bash infra/clone.sh to re-render cloud-init files');
  console.log('─────────────────────────────────────────\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
