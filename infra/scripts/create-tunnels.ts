#!/usr/bin/env bun
/**
 * create-tunnels.ts — Create one Cloudflare Tunnel per student box and write
 * the connector tokens into instance-secrets.toml.
 *
 * Usage:
 *   bun run infra/scripts/create-tunnels.ts [--dry-run] [--box pikachu,abra,...]
 *
 * Flow:
 *   1. Launch a headed Chromium browser (foreground — you sign in interactively)
 *   2. Navigate to Zero Trust → Networks → Tunnels
 *   3. Wait for you to sign in (press Enter in the terminal when ready)
 *   4. For each box in instances.txt:
 *      a. Skip if tunnel named "goto2026-{box}" already exists
 *      b. Create the tunnel, capture the connector token
 *      c. Write CLOUDFLARED_TOKEN = "{token}" into instance-secrets.toml
 *   5. Print a summary and exit
 *
 * The script is idempotent: boxes with a non-empty token in instance-secrets.toml
 * are skipped. Boxes with existing tunnels on Cloudflare but no local token will
 * be detected and warned (token was never captured — tunnel must be recreated).
 *
 * After running, call `infra/clone.sh` to re-render cloud-init files.
 */

import { chromium, type Page, type Browser } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, '../..');
const INSTANCES_TXT = resolve(REPO_ROOT, 'instances.txt');
const TOML_PATH = resolve(REPO_ROOT, 'instance-secrets.toml');
const ACCOUNT_ID = '7605cf7daffb181f2e6f047fc7183b22';
const TUNNEL_PREFIX = 'goto2026';
const TUNNELS_URL = `https://one.dash.cloudflare.com/${ACCOUNT_ID}/networks/tunnels`;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const boxFilter = args.find(a => a.startsWith('--box='))?.split('=')[1]?.split(',');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readInstances(): string[] {
  return readFileSync(INSTANCES_TXT, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function readToml(): string {
  return readFileSync(TOML_PATH, 'utf8');
}

function writeToml(content: string): void {
  if (DRY_RUN) {
    console.log('[dry-run] would write instance-secrets.toml');
    return;
  }
  writeFileSync(TOML_PATH, content, 'utf8');
}

/** Return the current CLOUDFLARED_TOKEN for a box, or "" if empty/missing. */
function getToken(toml: string, box: string): string {
  const m = toml.match(new RegExp(`\\[${box}\\][^\\[]*CLOUDFLARED_TOKEN\\s*=\\s*"([^"]*)"`));
  return m?.[1] ?? '';
}

/** Replace or insert CLOUDFLARED_TOKEN for a box in the TOML string. */
function setToken(toml: string, box: string, token: string): string {
  // Replace existing (empty or not)
  const pattern = new RegExp(`(\\[${box}\\][^\\[]*)CLOUDFLARED_TOKEN\\s*=\\s*"[^"]*"`);
  if (pattern.test(toml)) {
    return toml.replace(pattern, `$1CLOUDFLARED_TOKEN = "${token}"`);
  }
  // Shouldn't happen if toml is pre-populated, but insert after [box] header just in case
  return toml.replace(`[${box}]`, `[${box}]\nCLOUDFLARED_TOKEN = "${token}"`);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, ans => { rl.close(); res(ans); }));
}

/** Extract the connector token from a `cloudflared ... --token eyJ...` string. */
function extractToken(text: string): string | null {
  // Matches the long JWT that appears in the install command
  const m = text.match(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/);
  return m?.[0] ?? null;
}

async function waitForLogin(page: Page): Promise<void> {
  console.log('\n🔐 Browser opened. Sign in to Cloudflare in the browser window.');
  console.log('   Once you\'re on the Zero Trust dashboard (tunnels page), press Enter here...\n');
  await prompt('   > Press Enter when signed in: ');

  // Verify we landed somewhere useful
  const url = page.url();
  if (!url.includes('dash.cloudflare.com')) {
    console.warn('⚠️  Browser URL doesn\'t look like Cloudflare dashboard. Continuing anyway.');
  }
}

// ---------------------------------------------------------------------------
// Tunnel creation flow
// ---------------------------------------------------------------------------

async function listExistingTunnelNames(page: Page): Promise<Set<string>> {
  await page.goto(TUNNELS_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Grab all tunnel name text from the table
  const names = await page.$$eval(
    // Tunnel names appear in table rows; grab any text matching our prefix
    'table tbody tr td:first-child, [data-testid="tunnel-name"], .tunnel-name',
    els => els.map(el => el.textContent?.trim() ?? '')
  );

  // Fallback: scan all text on page for our prefix
  if (names.filter(n => n.startsWith('goto2026')).length === 0) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const matches = [...bodyText.matchAll(/goto2026-(\w+)/g)].map(m => m[0]);
    return new Set(matches);
  }

  return new Set(names.filter(n => n.startsWith(TUNNEL_PREFIX)));
}

async function createTunnel(page: Page, box: string): Promise<string | null> {
  const tunnelName = `${TUNNEL_PREFIX}-${box}`;
  console.log(`\n  → Creating tunnel: ${tunnelName}`);

  // Navigate to tunnel creation
  await page.goto(`${TUNNELS_URL}/new`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(1500);

  // Step 1: Choose connector type — select Cloudflared if prompted
  const cloudflaredBtn = page.locator('text=Cloudflared').first();
  if (await cloudflaredBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cloudflaredBtn.click();
    await page.waitForTimeout(500);
  }

  // "Next" or "Select" button after connector choice
  const nextBtn = page.locator('button:has-text("Next"), button:has-text("Select")').first();
  if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(1000);
  }

  // Step 2: Enter tunnel name
  const nameInput = page.locator('input[placeholder*="tunnel"], input[name*="name"], input[id*="name"]').first();
  await nameInput.waitFor({ timeout: 15_000 });
  await nameInput.fill(tunnelName);
  await page.waitForTimeout(500);

  // Save / Next
  const saveBtn = page.locator('button:has-text("Save Tunnel"), button:has-text("Save tunnel"), button:has-text("Next")').first();
  await saveBtn.click();
  await page.waitForTimeout(3000);

  // Step 3: Extract the connector token from the install command
  // Cloudflare shows: `cloudflared service install eyJ...` in a code block
  const pageText = await page.evaluate(() => document.body.innerText);
  let token = extractToken(pageText);

  if (!token) {
    // Try code blocks specifically
    const codeTexts = await page.$$eval(
      'code, pre, [class*="code"], [class*="token"], input[readonly]',
      els => els.map(el => ('value' in el ? (el as HTMLInputElement).value : el.textContent) ?? '')
    );
    for (const t of codeTexts) {
      token = extractToken(t);
      if (token) break;
    }
  }

  if (!token) {
    console.error(`  ✗ Could not extract token for ${tunnelName}. Screenshot saved.`);
    await page.screenshot({ path: `/tmp/cf-tunnel-${box}-error.png` });
    return null;
  }

  console.log(`  ✓ Got token for ${tunnelName}: ${token.slice(0, 12)}…`);

  // Click through to finish (some flows have a "Next" to configure routes — skip for now)
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

  console.log(`\n🚀 create-tunnels.ts — ${DRY_RUN ? 'DRY RUN — ' : ''}${boxes.length} box(es): ${boxes.join(', ')}`);

  let toml = readToml();

  // Pre-check: which boxes already have tokens locally
  const alreadyDone = boxes.filter(b => getToken(toml, b) !== '');
  if (alreadyDone.length > 0) {
    console.log(`\n⏭  Skipping (token already in TOML): ${alreadyDone.join(', ')}`);
  }
  const toCreate = boxes.filter(b => getToken(toml, b) === '');
  if (toCreate.length === 0) {
    console.log('\n✅ All boxes already have tokens. Nothing to do.');
    process.exit(0);
  }

  // Launch browser
  const browser: Browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  try {
    await page.goto(TUNNELS_URL, { timeout: 30_000 });
    await waitForLogin(page);

    // Snapshot existing tunnels to detect conflicts
    console.log('\n📋 Reading existing tunnels…');
    const existingNames = await listExistingTunnelNames(page);
    console.log(`   Found: ${existingNames.size ? [...existingNames].join(', ') : '(none)'}`);

    const conflicts = toCreate.filter(b => existingNames.has(`${TUNNEL_PREFIX}-${b}`));
    if (conflicts.length > 0) {
      console.warn(`\n⚠️  Tunnels already exist on Cloudflare for: ${conflicts.join(', ')}`);
      console.warn('   Tokens cannot be retrieved after creation. Delete these tunnels first, or');
      console.warn('   create a Tunnel:Edit API token and run `infra/scripts/populate-tunnel-tokens.ts`');
      const skip = await prompt('   Skip conflicts and continue with the rest? [Y/n]: ');
      if (skip.toLowerCase() === 'n') {
        process.exit(1);
      }
    }

    const toCreateFiltered = toCreate.filter(b => !conflicts.includes(b));
    console.log(`\n🔨 Creating ${toCreateFiltered.length} tunnel(s)…`);

    const results: Record<string, string | null> = {};
    for (const box of toCreateFiltered) {
      const token = await createTunnel(page, box);
      results[box] = token;
      if (token && !DRY_RUN) {
        toml = setToken(toml, box, token);
        writeToml(toml); // write after each success so partial progress is saved
      }
      // Small delay between creates to avoid rate limiting
      await page.waitForTimeout(1500);
    }

    // Summary
    const succeeded = Object.entries(results).filter(([, t]) => t !== null);
    const failed = Object.entries(results).filter(([, t]) => t === null);

    console.log('\n─────────────────────────────────────────');
    console.log(`✅ Created: ${succeeded.length}/${toCreateFiltered.length}`);
    if (failed.length > 0) {
      console.log(`❌ Failed:  ${failed.map(([b]) => b).join(', ')}`);
      console.log('   Check screenshots in /tmp/cf-tunnel-*-error.png');
    }
    if (!DRY_RUN && succeeded.length > 0) {
      console.log(`\n📝 Tokens written to instance-secrets.toml`);
      console.log('   Next: run infra/clone.sh to re-render cloud-init files');
    }
    console.log('─────────────────────────────────────────\n');

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
