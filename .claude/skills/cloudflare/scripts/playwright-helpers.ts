/**
 * playwright-helpers.ts — Shared utilities for Cloudflare dashboard automation.
 *
 * See SKILL.md for full dashboard URL structure and selector notes.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createInterface } from 'readline';

export const ACCOUNT_ID = '7605cf7daffb181f2e6f047fc7183b22';
export const ZONE_ID    = '9e8e8118df63e27a2163cd4424bdebe1';
export const DOMAIN     = 'fluentworkshop.dev';
export const TUNNELS_URL = `https://one.dash.cloudflare.com/${ACCOUNT_ID}/networks/tunnels`;

/** Launch a headed Chromium with sensible defaults for CF dashboard use. */
export async function launch(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

/** Prompt the human to complete sign-in (including TOTP) and press Enter. */
export async function waitForLogin(page: Page): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(res => {
    rl.question(
      '\n🔐 Complete Cloudflare sign-in in the browser (email → password → TOTP/2FA → org selector).\n' +
      '   Once you see the Zero Trust tunnels list page, press Enter here...\n\n   > ',
      () => { rl.close(); res(); }
    );
  });
}

/**
 * Extract the connector token JWT from a page text string.
 * Cloudflare shows it in `cloudflared service install eyJ...` or
 * `cloudflared tunnel run --token eyJ...` on the install step.
 */
export function extractToken(text: string): string | null {
  const m = text.match(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/);
  return m?.[0] ?? null;
}

/** Scan all text and code nodes on the current page for a CF connector token. */
export async function findTokenOnPage(page: Page): Promise<string | null> {
  // Full page text first (fastest)
  let token = extractToken(await page.evaluate(() => document.body.innerText));
  if (token) return token;

  // Code/input nodes specifically
  const codeTexts = await page.$$eval(
    'code, pre, [class*="code"], [class*="token"], input[readonly], textarea[readonly]',
    els => els.map(el => ('value' in el ? (el as HTMLInputElement).value : el.textContent) ?? '')
  );
  for (const t of codeTexts) {
    token = extractToken(t);
    if (token) return token;
  }

  return null;
}

/** Simple fetch wrapper authenticated with a CF API token file or env var. */
export async function cfFetch(
  path: string,
  tokenPath: string,
  opts: RequestInit = {}
): Promise<any> {
  const { readFileSync } = await import('fs');
  const token = process.env.CLOUDFLARE_TOKEN ??
    readFileSync(tokenPath, 'utf8').trim();
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  return res.json();
}
