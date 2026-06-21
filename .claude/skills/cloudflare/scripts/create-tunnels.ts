#!/usr/bin/env bun
/**
 * create-tunnels.ts — Create one Cloudflare Tunnel per student box and write
 * the connector tokens into instance-secrets.toml.
 *
 * See ../ SKILL.md for full dashboard flow documentation.
 *
 * Usage:
 *   bun run .claude/skills/cloudflare/scripts/create-tunnels.ts [--dry-run] [--box pikachu,abra,...]
 *
 * Flow:
 *   1. Launch a headed Chromium (you sign in, including TOTP)
 *   2. Check existing tunnels on Cloudflare (skip already-created ones)
 *   3. For each remaining box: create tunnel, capture connector token
 *   4. Write CLOUDFLARED_TOKEN per-box into instance-secrets.toml (after each success)
 *
 * Idempotent: boxes already having a non-empty token in instance-secrets.toml are skipped.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Page } from 'playwright';
import { launch, waitForLogin, findTokenOnPage, TUNNELS_URL } from './playwright-helpers.ts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, '../../../..');
const INSTANCES_TXT = resolve(REPO_ROOT, 'instances.txt');
const TOML_PATH = resolve(REPO_ROOT, 'instance-secrets.toml');
const TUNNEL_PREFIX = 'goto2026';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const boxFilter = args.find(a => a.startsWith('--box='))?.split('=')[1]?.split(',');

// ---------------------------------------------------------------------------
// TOML helpers
// ---------------------------------------------------------------------------

function readInstances(): string[] {
  return readFileSync(INSTANCES_TXT, 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function readToml(): string { return readFileSync(TOML_PATH, 'utf8'); }

function getToken(toml: string, box: string): string {
  return toml.match(new RegExp(`\\[${box}\\][^\\[]*CLOUDFLARED_TOKEN\\s*=\\s*"([^"]*)"`))
    ?.[1] ?? '';
}

function setToken(toml: string, box: string, token: string): string {
  const pattern = new RegExp(`(\\[${box}\\][^\\[]*)CLOUDFLARED_TOKEN\\s*=\\s*"[^"]*"`);
  if (pattern.test(toml)) return toml.replace(pattern, `$1CLOUDFLARED_TOKEN = "${token}"`);
  return toml.replace(`[${box}]`, `[${box}]\nCLOUDFLARED_TOKEN = "${token}"`);
}

function writeToml(content: string) {
  if (DRY_RUN) { console.log('[dry-run] would write instance-secrets.toml'); return; }
  writeFileSync(TOML_PATH, content, 'utf8');
}

function prompt(q: string): Promise<string> {
  const { createInterface } = require('readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, (a: string) => { rl.close(); res(a); }));
}

// ---------------------------------------------------------------------------
// Dashboard automation
// ---------------------------------------------------------------------------

async function listExistingTunnelNames(page: Page): Promise<Set<string>> {
  await page.goto(TUNNELS_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  return new Set([...bodyText.matchAll(new RegExp(`${TUNNEL_PREFIX}-\\w+`, 'g'))].map(m => m[0]));
}

async function createTunnel(page: Page, box: string): Promise<string | null> {
  const tunnelName = `${TUNNEL_PREFIX}-${box}`;
  console.log(`\n  → Creating: ${tunnelName}`);

  await page.goto(`${TUNNELS_URL}/new`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(1500);

  // Step 1: Select Cloudflared connector type
  const cloudflaredBtn = page.locator('text=Cloudflared').first();
  if (await cloudflaredBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cloudflaredBtn.click();
    await page.waitForTimeout(500);
  }
  const nextBtn = page.locator('button:has-text("Next"), button:has-text("Select")').first();
  if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(1000);
  }

  // Step 2: Name the tunnel
  const nameInput = page.locator('input[placeholder*="tunnel" i], input[name*="name" i]').first();
  await nameInput.waitFor({ timeout: 15_000 });
  await nameInput.fill(tunnelName);
  await page.waitForTimeout(500);

  const saveBtn = page.locator('button:has-text("Save Tunnel"), button:has-text("Save tunnel"), button:has-text("Next")').first();
  await saveBtn.click();
  await page.waitForTimeout(3000);

  // Step 3: Extract connector token from install instructions
  const token = await findTokenOnPage(page);

  if (!token) {
    console.error(`  ✗ Token not found for ${tunnelName} — screenshot at /tmp/cf-tunnel-${box}-error.png`);
    await page.screenshot({ path: `/tmp/cf-tunnel-${box}-error.png` });
    return null;
  }

  console.log(`  ✓ ${tunnelName}: ${token.slice(0, 12)}…`);

  // Advance past install step if possible
  const doneBtn = page.locator('button:has-text("Next"), button:has-text("Done"), button:has-text("Finish")').first();
  if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await doneBtn.click();
    await page.waitForTimeout(1000);
  }

  return token;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const allBoxes = readInstances();
  const boxes = boxFilter ? allBoxes.filter(b => boxFilter.includes(b)) : allBoxes;
  console.log(`\n🚀 create-tunnels ${DRY_RUN ? '[DRY RUN] ' : ''}— ${boxes.length} box(es): ${boxes.join(', ')}`);

  let toml = readToml();

  const alreadyDone = boxes.filter(b => getToken(toml, b) !== '');
  if (alreadyDone.length) console.log(`\n⏭  Already done: ${alreadyDone.join(', ')}`);
  const toCreate = boxes.filter(b => getToken(toml, b) === '');
  if (!toCreate.length) { console.log('\n✅ All boxes have tokens. Nothing to do.'); process.exit(0); }

  const { browser, page } = await launch();

  try {
    await page.goto(TUNNELS_URL, { timeout: 30_000 });
    await waitForLogin(page);

    console.log('\n📋 Reading existing tunnels on Cloudflare…');
    const existing = await listExistingTunnelNames(page);
    console.log(`   Found: ${existing.size ? [...existing].join(', ') : '(none)'}`);

    const conflicts = toCreate.filter(b => existing.has(`${TUNNEL_PREFIX}-${b}`));
    if (conflicts.length) {
      console.warn(`\n⚠️  Already exist on CF (token not capturable): ${conflicts.join(', ')}`);
      console.warn('   Delete them in the dashboard first, then re-run, or add tokens manually.');
      const skip = await prompt('   Skip conflicts and continue with the rest? [Y/n]: ');
      if (skip.toLowerCase() === 'n') process.exit(1);
    }

    const toRun = toCreate.filter(b => !conflicts.includes(b));
    console.log(`\n🔨 Creating ${toRun.length} tunnel(s)…`);

    let ok = 0, fail = 0;
    for (const box of toRun) {
      const token = await createTunnel(page, box);
      if (token) {
        toml = setToken(toml, box, token);
        writeToml(toml); // save after each success
        ok++;
      } else {
        fail++;
      }
      await page.waitForTimeout(1500);
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`✅ Created: ${ok}  ❌ Failed: ${fail}`);
    if (ok > 0 && !DRY_RUN) console.log('📝 Tokens written to instance-secrets.toml');
    console.log('Next: TUNNEL_SALT=<value> bun run .claude/skills/cloudflare/scripts/create-tunnel-dns.ts');
    console.log('Then: bash infra/clone.sh');
    console.log('─────────────────────────────────────────\n');

  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
