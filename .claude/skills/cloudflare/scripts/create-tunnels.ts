#!/usr/bin/env bun
/**
 * create-tunnels.ts — Create one Cloudflare Tunnel per student box and write
 * connector tokens into instance-secrets.toml.
 *
 * See ../TUNNEL.md for full playbook and architecture notes.
 *
 * Usage:
 *   bun run .claude/skills/cloudflare/scripts/create-tunnels.ts [--dry-run] [--box pikachu,abra,...]
 *
 * Flow per box:
 *   1. Navigate to Zero Trust → Create tunnel → Select Cloudflared
 *   2. Fill tunnel name (goto2026-{box}), click Save Tunnel
 *   3. Extract connector token from React fiber (no clipboard needed)
 *   4. Write CLOUDFLARED_TOKEN into instance-secrets.toml
 *
 * Idempotent: boxes already having a non-empty token in instance-secrets.toml are skipped.
 *
 * ⚠️  Do NOT use window.location.href inside evaluate — it destroys the JS context.
 *     Use navigate() between tunnels, then a fresh evaluate per tunnel.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launch, waitForLogin, ACCOUNT_ID } from './playwright-helpers.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, '../../../..');
const INSTANCES_TXT = resolve(REPO_ROOT, 'instances.txt');
const TOML_PATH = resolve(REPO_ROOT, 'instance-secrets.toml');

const BASE = `https://dash.cloudflare.com/${ACCOUNT_ID}/one/networks/connectors/cloudflare-tunnels`;

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
  const pat = new RegExp(`(\\[${box}\\][^\\[]*)CLOUDFLARED_TOKEN\\s*=\\s*"[^"]*"`);
  return pat.test(toml)
    ? toml.replace(pat, `$1CLOUDFLARED_TOKEN = "${token}"`)
    : toml.replace(`[${box}]`, `[${box}]\nCLOUDFLARED_TOKEN = "${token}"`);
}

function writeToml(content: string) {
  if (DRY_RUN) { console.log('[dry-run] would write instance-secrets.toml'); return; }
  writeFileSync(TOML_PATH, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Token extraction via React fiber (see TUNNEL.md for full explanation)
// ---------------------------------------------------------------------------

const FIBER_EXTRACT_JS = /* js */`
  (() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('--token'));
    if (!btn) return null;
    const fk = Object.keys(btn).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternals'));
    if (!fk) return null;
    let node = btn[fk];
    const seen = new Set();
    for (let i = 0; i < 40 && node; i++) {
      if (seen.has(node)) break;
      seen.add(node);
      const search = (obj, depth) => {
        if (!obj || depth > 3 || typeof obj !== 'object') return null;
        for (const key of Object.keys(obj)) {
          try {
            const val = obj[key];
            if (typeof val === 'string' && val.length > 80 && val.includes('eyJ'))
              return val;
            const r = depth < 3 ? search(val, depth + 1) : null;
            if (r) return r;
          } catch (e) {}
        }
        return null;
      };
      const r = search(node.memoizedProps, 0) || search(node.pendingProps, 0);
      if (r) return r.replace(/.*--token\\s+/, '').trim();
      node = node.return;
    }
    return null;
  })()
`;

// ---------------------------------------------------------------------------
// Per-tunnel creation (single page.evaluate — no location.href!)
// ---------------------------------------------------------------------------

const CREATE_AND_EXTRACT_JS = (box: string) => /* js */`
  async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btns  = () => Array.from(document.querySelectorAll('button'));
    const waitFor = async (fn, ms = 15000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { const r = fn(); if (r) return r; await sleep(300); }
      throw new Error('Timeout waiting for: ' + fn.toString().slice(7, 60));
    };

    // Step 1: Select Cloudflared (skipped on repeat visits — CF SPA remembers)
    const cfBtn = btns().find(b => b.textContent.trim() === 'Select Cloudflared');
    if (cfBtn) { cfBtn.click(); await sleep(1500); }

    // Step 2: Fill tunnel name
    const inp = await waitFor(() => document.querySelector('input[placeholder*="NYC"]'));
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(inp, 'goto2026-${box}');
    inp.dispatchEvent(new Event('input',  { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);

    // Step 3: Save
    const saveBtn = await waitFor(() => btns().find(b => /save tunnel/i.test(b.textContent)));
    saveBtn.click();
    await sleep(8000); // CF API round-trip + SPA render

    // Step 4: Extract token from React fiber
    ${FIBER_EXTRACT_JS.trim()}
  }
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const allBoxes = readInstances();
  const boxes = boxFilter ? allBoxes.filter(b => boxFilter.includes(b)) : allBoxes;
  console.log(`\n🚀 create-tunnels ${DRY_RUN ? '[DRY RUN] ' : ''}— ${boxes.length} box(es): ${boxes.join(', ')}`);

  let toml = readToml();

  const skip = boxes.filter(b => getToken(toml, b) !== '');
  if (skip.length) console.log(`\n⏭  Already done: ${skip.join(', ')}`);
  const toCreate = boxes.filter(b => getToken(toml, b) === '');
  if (!toCreate.length) { console.log('\n✅ All boxes have tokens.'); process.exit(0); }

  const { browser, page } = await launch();

  try {
    await page.goto(`${BASE}/new`, { timeout: 30_000 });
    await waitForLogin(page);

    let ok = 0, fail = 0;
    for (const box of toCreate) {
      console.log(`\n  → ${box}`);
      try {
        // Navigate fresh each time (SPA context reset prevents stale state)
        await page.goto(`${BASE}/new`, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForTimeout(1000);

        const token = await page.evaluate(CREATE_AND_EXTRACT_JS(box));

        if (!token || !token.startsWith('eyJ')) {
          throw new Error(`bad token: ${String(token).slice(0, 40)}`);
        }

        console.log(`  ✓ ${box}: ${token.slice(0, 12)}…`);
        if (!DRY_RUN) {
          toml = setToken(toml, box, token);
          writeToml(toml); // save after each success so partial runs are safe
        }
        ok++;
      } catch (e: any) {
        console.error(`  ✗ ${box}: ${e.message}`);
        await page.screenshot({ path: `/tmp/cf-tunnel-${box}-error.png` }).catch(() => {});
        fail++;
      }
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`✅ Created: ${ok}  ❌ Failed: ${fail}`);
    if (ok && !DRY_RUN) {
      console.log('📝 Tokens written to instance-secrets.toml');
      console.log('Next: TUNNEL_SALT=<value> bun run .claude/skills/cloudflare/scripts/create-tunnel-dns.ts');
      console.log('Then: bash infra/clone.sh');
    }
    console.log('─────────────────────────────────────────\n');
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
