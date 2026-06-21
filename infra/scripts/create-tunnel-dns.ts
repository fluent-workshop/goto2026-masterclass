#!/usr/bin/env bun
/**
 * create-tunnel-dns.ts — Create Cloudflare DNS CNAME records for all 14 student boxes.
 *
 * Reads tunnel IDs from the Cloudflare API (by tunnel name) and instance-secrets.toml
 * (to know which boxes have tokens), then creates 6 CNAME records per box pointing
 * each service hostname to {tunnel-id}.cfargotunnel.com.
 *
 * Usage:
 *   CLOUDFLARE_TOKEN=<tunnel:edit token> bun run infra/scripts/create-tunnel-dns.ts [--dry-run] [--box pikachu,abra,...]
 *
 * Requires a Cloudflare API token with:
 *   - Account → Cloudflare Tunnel → Read (to list tunnels and get IDs)
 *   - Zone → DNS → Edit (for fluentworkshop.dev)
 *
 * The current ~/.openclaw/credentials/cloudflare-api-key has DNS:Edit only.
 * Either create a combined token or set CLOUDFLARE_TOKEN to one with both scopes.
 *
 * Hostname pattern (from openclaw-tunnel-config.sh):
 *   {box}-goto2026-app.fluentworkshop.dev                              (public)
 *   {box}-goto2026-desktop-{hash8}.fluentworkshop.dev                 (protected)
 *   {box}-goto2026-supabase-studio-{hash8}.fluentworkshop.dev         (protected)
 *   {box}-goto2026-gateway-{hash8}.fluentworkshop.dev                 (protected)
 *   {box}-goto2026-ssh-{hash8}.fluentworkshop.dev                     (protected)
 *   {box}-goto2026-postgres-{hash8}.fluentworkshop.dev                (protected)
 *
 * hash8 = sha256(hostname + TUNNEL_SALT)[:8]  — derived from TUNNEL_SALT in 1Password.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, '../..');
const INSTANCES_TXT = resolve(REPO_ROOT, 'instances.txt');
const TOML_PATH = resolve(REPO_ROOT, 'instance-secrets.toml');

const ACCOUNT_ID = '7605cf7daffb181f2e6f047fc7183b22';
const ZONE_ID = '9e8e8118df63e27a2163cd4424bdebe1';
const DOMAIN = 'fluentworkshop.dev';
const TUNNEL_PREFIX = 'goto2026';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const boxFilter = args.find(a => a.startsWith('--box='))?.split('=')[1]?.split(',');

// API token: prefer env var, fall back to file
const CF_TOKEN =
  process.env.CLOUDFLARE_TOKEN ??
  readFileSync(resolve(process.env.HOME!, '.openclaw/credentials/cloudflare-api-key'), 'utf8').trim();

const TUNNEL_SALT =
  process.env.TUNNEL_SALT ??
  (() => { console.error('TUNNEL_SALT env var required (from 1Password)'); process.exit(1); })();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash8(hostname: string, salt: string): string {
  return createHash('sha256').update(hostname + salt).digest('hex').slice(0, 8);
}

function hostnames(box: string, salt: string): { name: string; public: boolean }[] {
  const h = hash8(box, salt);
  return [
    { name: `${box}-${TUNNEL_PREFIX}-app.${DOMAIN}`, public: true },
    { name: `${box}-${TUNNEL_PREFIX}-desktop-${h}.${DOMAIN}`, public: false },
    { name: `${box}-${TUNNEL_PREFIX}-supabase-studio-${h}.${DOMAIN}`, public: false },
    { name: `${box}-${TUNNEL_PREFIX}-gateway-${h}.${DOMAIN}`, public: false },
    { name: `${box}-${TUNNEL_PREFIX}-ssh-${h}.${DOMAIN}`, public: false },
    { name: `${box}-${TUNNEL_PREFIX}-postgres-${h}.${DOMAIN}`, public: false },
  ];
}

function readInstances(): string[] {
  return readFileSync(INSTANCES_TXT, 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function getToken(box: string): string {
  const toml = readFileSync(TOML_PATH, 'utf8');
  const m = toml.match(new RegExp(`\\[${box}\\][^\\[]*CLOUDFLARED_TOKEN\\s*=\\s*"([^"]*)"`));
  return m?.[1] ?? '';
}

async function cfGet(path: string) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
  });
  return res.json() as Promise<any>;
}

async function cfPost(path: string, body: unknown) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

/** Resolve tunnel ID by name. Returns null if not found. */
async function getTunnelId(name: string): Promise<string | null> {
  const data = await cfGet(
    `/accounts/${ACCOUNT_ID}/cfd_tunnel?name=${encodeURIComponent(name)}&is_deleted=false`
  );
  return data?.result?.[0]?.id ?? null;
}

/** List existing DNS records for a name. */
async function getDnsRecord(name: string): Promise<string | null> {
  const data = await cfGet(`/zones/${ZONE_ID}/dns_records?name=${encodeURIComponent(name)}&type=CNAME`);
  return data?.result?.[0]?.id ?? null;
}

/** Create or update a CNAME record. */
async function upsertCname(name: string, target: string): Promise<boolean> {
  const existingId = await getDnsRecord(name);
  if (existingId) {
    // Already exists — skip (idempotent)
    console.log(`    ⏭  ${name} → already exists`);
    return true;
  }
  if (DRY_RUN) {
    console.log(`    [dry] CNAME ${name} → ${target}`);
    return true;
  }
  const data = await cfPost(`/zones/${ZONE_ID}/dns_records`, {
    type: 'CNAME',
    name,
    content: target,
    ttl: 1, // auto
    proxied: false, // tunnel handles its own TLS
  });
  if (data?.success) {
    console.log(`    ✓ ${name} → ${target}`);
    return true;
  } else {
    console.error(`    ✗ ${name}: ${JSON.stringify(data?.errors)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const allBoxes = readInstances();
  const boxes = boxFilter ? allBoxes.filter(b => boxFilter.includes(b)) : allBoxes;

  console.log(`\n🌐 create-tunnel-dns.ts — ${DRY_RUN ? 'DRY RUN — ' : ''}${boxes.length} box(es)`);

  let totalCreated = 0;
  let totalFailed = 0;

  for (const box of boxes) {
    const token = getToken(box);
    if (!token) {
      console.log(`\n⚠️  ${box}: no CLOUDFLARED_TOKEN in instance-secrets.toml — skipping`);
      continue;
    }

    const tunnelName = `${TUNNEL_PREFIX}-${box}`;
    process.stdout.write(`\n  ${box}: resolving tunnel ID…`);

    const tunnelId = await getTunnelId(tunnelName);
    if (!tunnelId) {
      console.log(` ✗ tunnel "${tunnelName}" not found on Cloudflare`);
      totalFailed++;
      continue;
    }
    console.log(` ${tunnelId.slice(0, 8)}…`);

    const target = `${tunnelId}.cfargotunnel.com`;
    const records = hostnames(box, TUNNEL_SALT);

    for (const { name } of records) {
      const ok = await upsertCname(name, target);
      if (ok) totalCreated++; else totalFailed++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Created/verified: ${totalCreated}`);
  if (totalFailed > 0) console.log(`❌ Failed: ${totalFailed}`);
  console.log('─────────────────────────────────────────\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
