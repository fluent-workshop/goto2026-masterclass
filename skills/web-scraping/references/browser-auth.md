# Browser Auth Pattern (Classroom Edition)

When a site requires login to access the data you need, use this pattern:
**open a visible browser, hand control to the user to log in, then extract the authenticated session and take back over with HTTP.**

This keeps the auth step human (no credential storage needed) while letting the agent do the heavy lifting for extraction.

> **Classroom note:** This pattern intentionally avoids 1Password and Valkey. The user logs in manually in a foreground browser — the agent then extracts cookies and CSRF from that live session and drives all subsequent requests via HTTP. No secrets are stored anywhere.

---

## The Flow

```
1. Launch browser in foreground (headless: false)
2. Navigate to the login page
3. Tell the user to log in, wait for their confirmation
4. Extract cookies + CSRF from the authenticated browser context
5. Close the browser
6. Use extracted auth for HTTP requests (curl or fetch)
```

---

## Implementation

### Step 1 — Launch and hand off

Write a Playwright script that opens the login page visibly and pauses:

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://example.com/login");

console.log("==========================================================");
console.log("Please log in to the site in the browser that just opened.");
console.log("When you're fully logged in and see your dashboard,");
console.log("come back here and press Enter to continue.");
console.log("==========================================================");

// Wait for the user to press Enter in the terminal
await new Promise<void>(resolve => {
  process.stdin.once("data", () => resolve());
});
```

Run the script and tell the user what to do:
```bash
bun run scripts/auth.ts
```

### Step 2 — Extract auth after login

Once the user presses Enter, extract the session:

```typescript
// Extract cookies as a header string
const cookies = await context.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

// Extract CSRF token (check common locations)
const csrfToken =
  await page.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")) ??
  await page.evaluate(() => document.querySelector('meta[name="_token"]')?.getAttribute("content")) ??
  await page.evaluate(() => (document.querySelector('input[name="_token"]') as HTMLInputElement)?.value);

// Grab the user agent Playwright used (some sites fingerprint this)
const userAgent = await page.evaluate(() => navigator.userAgent);

console.log("Cookies extracted:", cookies.length, "cookies");
console.log("CSRF token:", csrfToken ? "found" : "not found");

await browser.close();

// Use these in all subsequent HTTP requests
const auth = { cookieHeader, csrfToken, userAgent };
```

### Step 3 — HTTP requests with the extracted session

Pass the auth into all `fetch()` or `curl` calls:

```typescript
const res = await fetch("https://example.com/api/data", {
  headers: {
    Cookie: auth.cookieHeader,
    "X-CSRF-Token": auth.csrfToken ?? "",
    "User-Agent": auth.userAgent,
    Origin: "https://example.com",
    Referer: "https://example.com/dashboard",
  },
});
```

Or via curl:
```bash
curl -s "https://example.com/api/data" \
  -b "$COOKIE_HEADER" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Origin: https://example.com"
```

---

## CSRF Refresh Before Write Operations

Some sites (especially Rails apps) rotate the CSRF token with every session cookie update. Before any write operation (POST, PUT, DELETE), fetch a fresh token:

```typescript
async function refreshCsrf(auth: typeof extractedAuth) {
  const res = await fetch("https://example.com/dashboard", {
    headers: { Cookie: auth.cookieHeader, "User-Agent": auth.userAgent },
  });
  const html = await res.text();
  const match = html.match(/csrf-token["\s]+content="([^"]+)"/);

  // Merge any updated session cookies
  for (const header of res.headers.getSetCookie?.() ?? []) {
    const m = header.match(/^([^=]+)=([^;]*)/);
    if (m) {
      const [, name, value] = m;
      auth.cookieHeader = auth.cookieHeader.includes(name + "=")
        ? auth.cookieHeader.replace(new RegExp(name + "=[^;]+"), name + "=" + value)
        : auth.cookieHeader + "; " + name + "=" + value;
    }
  }

  return { ...auth, csrfToken: match?.[1] ?? auth.csrfToken };
}
```

---

## Debugging Tips

- **Take a screenshot** right after the user presses Enter to confirm the page state:
  ```typescript
  await page.screenshot({ path: "output/screenshots/post-login.png", fullPage: true });
  ```
- **Check `page.url()`** to confirm you're past the login page — not stuck on an intermediate step
- **Dump cookies** to see what was extracted: `console.log(cookies.map(c => c.name))`
- **Test with a simple authenticated GET** before running the full extraction batch

---

## Full Example Script

```typescript
#!/usr/bin/env bun
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";

await mkdir("output/screenshots", { recursive: true });

// 1. Launch visible browser
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("https://example.com/login");

// 2. Let the user log in
console.log("\n🔐 Please log in to the site in the browser that just opened.");
console.log("   Press Enter here when you're on the dashboard.\n");
await new Promise<void>(r => process.stdin.once("data", () => r()));

// 3. Take a screenshot as evidence
await page.screenshot({ path: "output/screenshots/post-login.png", fullPage: true });

// 4. Extract session
const cookies = await context.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
const csrfToken = await page.evaluate(() =>
  document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? ""
);
const userAgent = await page.evaluate(() => navigator.userAgent);

await browser.close();
console.log(`✅ Auth extracted: ${cookies.length} cookies, CSRF: ${csrfToken ? "yes" : "no"}`);

// 5. Test the session
const testRes = await fetch("https://example.com/api/me", {
  headers: { Cookie: cookieHeader, "User-Agent": userAgent },
});
console.log("Session test:", testRes.status, testRes.statusText);

// 6. Save auth for use by extraction script (in-process only — not persisted to disk)
export const auth = { cookieHeader, csrfToken, userAgent };
```
