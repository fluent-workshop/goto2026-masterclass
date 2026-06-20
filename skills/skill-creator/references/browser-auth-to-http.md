# Browser-Auth-to-HTTP Pattern

When a web service lacks a public API (or the API doesn't cover what you need), use headless Playwright to authenticate, then make direct HTTP requests against the service's internal API.

## When to Use

- Service has no public API (Grammarly, OpenTable)
- Public API exists but doesn't cover needed features (Calendly meeting polls, event type CRUD)
- You need to automate actions only available in the web UI

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  1Password   │───▶│  Playwright   │───▶│  Internal API │
│  (creds+OTP) │    │  (auth only)  │    │  (raw HTTP)   │
└─────────────┘    └──────────────┘    └──────────────┘
                         │                      ▲
                         ▼                      │
                   ┌──────────┐          ┌──────────┐
                   │  Valkey   │─────────▶│  fetch()  │
                   │  (cache)  │          │  (Bun)    │
                   └──────────┘          └──────────┘
```

1. **Playwright** handles login (email, password, OTP, SSO, CAPTCHAs)
2. **Cookies + CSRF** extracted from the authenticated browser context
3. **Valkey** caches extracted auth with a short TTL (5 min)
4. **Raw HTTP** (`fetch()`) makes API calls using cached auth
5. **CSRF refresh** before write operations (see below)

## File Structure

```
skills/<service>/
├── SKILL.md
├── package.json           # playwright + redis dependencies
└── scripts/
    ├── <service>.ts       # CLI entry point
    └── lib/
        ├── auth.ts        # browser auth (provider-specific login flow)
        ├── <feature>-api.ts  # internal API client
        ├── args.ts        # shared arg parsing
        └── types.ts       # shared types
```

## auth.ts — Key Components

### Provider Config

Each service needs:
- **Login URL** — where the login form lives
- **Dashboard URL pattern** — how to detect successful login (not just `/app/` — verify you're past *all* auth steps)
- **CSRF extraction** — where the token lives (meta tag, script embed, response header)
- **1Password item name** — for credential + OTP retrieval
- **Logout URL** — for server-side session invalidation

### Login Flow

```
navigate to login page
  → fill email → click continue
  → fill password → click submit
  → detect OTP prompt → fill OTP from 1Password → submit
  → wait for ACTUAL dashboard URL (not intermediate pages)
  → extract cookies + CSRF + user identifiers
  → cache in Valkey (5-min TTL)
```

### Critical Lessons Learned

1. **OTP inputs vary wildly.** Calendly uses 6 individual `input[aria-label="Digit N"]` elements, not a single input. Always inspect the actual DOM with screenshots — don't assume standard selectors.

2. **Login "success" detection must be strict.** Wait for the actual dashboard URL, not just a URL that starts with `/app/`. Intermediate pages like `/app/login?email=...` look like success but aren't.

3. **Session cookies are valid for external HTTP.** Despite initial fears about fingerprinting, Playwright-extracted cookies work fine with `fetch()` — as long as the login actually completed (including OTP).

4. **CSRF tokens rotate with session cookies.** Rails (and many frameworks) regenerate the CSRF token every time they issue a new session cookie. The cached CSRF from login will be stale by the time you make a write request.

5. **Always include `Origin` and `Referer` headers.** Many internal APIs reject requests missing these, even with valid cookies + CSRF.

## CSRF Refresh — The Write-Operation Pattern

**Problem:** Cached CSRF tokens become stale when the server rotates session cookies (which happens on every request for Rails apps).

**Solution:** Before any write operation (POST, PUT, DELETE), fetch a page to get a fresh CSRF token paired with the current session cookie.

```ts
async function refreshSessionAndCsrf(auth: BrowserAuth): Promise<BrowserAuth> {
  // Fetch any authenticated page
  const pageRes = await fetch("https://service.com/app/dashboard", {
    redirect: "follow",
    headers: { Cookie: auth.cookies, "User-Agent": auth.userAgent },
  });
  
  // Extract fresh CSRF from HTML
  const html = await pageRes.text();
  const csrfMatch = html.match(/csrf-token["\s]+content="([^"]+)"/);
  
  // Merge set-cookie headers (updated session cookie)
  let cookies = auth.cookies;
  for (const h of pageRes.headers.getSetCookie?.() ?? []) {
    const m = h.match(/^([^=]+)=([^;]*)/);
    if (m) {
      const name = m[1].trim();
      if (cookies.includes(name + "=")) {
        cookies = cookies.replace(new RegExp(name + "=[^;]+"), name + "=" + m[2]);
      } else {
        cookies += "; " + name + "=" + m[2];
      }
    }
  }
  
  return { ...auth, cookies, csrfToken: csrfMatch?.[1] ?? auth.csrfToken };
}
```

**Apply this before every write call**, not just once per session.

## Session Storage

### Playwright Persistent Context
- Store in `$TMPDIR/openclaw-browser/<service>/` — OS cleans on reboot
- Enables fast re-login (session survives across script invocations within an uptime window)
- `<service> logout` command should nuke this directory

### Valkey Cache (localhost:65379)
- `SETEX <service>:browser-auth 300 <json>` — 5-minute TTL
- Avoids launching Playwright for every command
- Three-tier lookup: process memory → Valkey → fresh Playwright extraction
- Server-enforced TTL (not honor-system)

### Security Model
- No credentials written to permanent disk locations
- Playwright context in `$TMPDIR` (OS-managed, cleaned on reboot)
- Extracted cookies in Valkey with hard TTL (genuinely deleted after expiry)
- Server-side logout on explicit `<service> logout` command
- 1Password for credential storage (never hardcoded)

## Credential Retrieval

```ts
// 1Password CLI
const proc = Bun.spawn(["op", "item", "get", "<Service>", "--vault", "<Vault>", "--format", "json"]);
const item = JSON.parse(await new Response(proc.stdout).text());
const email = item.fields.find(f => f.id === "username")?.value;
const password = item.fields.find(f => f.id === "password" || f.type === "CONCEALED")?.value;

// OTP
const otpProc = Bun.spawn(["op", "item", "get", "<Service>", "--vault", "<Vault>", "--otp"]);
const otp = (await new Response(otpProc.stdout).text()).trim();
```

Fallback to environment variables (`<SERVICE>_EMAIL`, `<SERVICE>_PASSWORD`) when `op` CLI is unavailable.

## CLI Structure

```bash
<service> auth [--manual]       # login (auto via 1Pass, or --manual for visible browser)
<service> logout                # server-side logout + clear local state
<service> <feature> create ...  # write operations (auto-refresh CSRF)
<service> <feature> list        # read operations
<service> <feature> delete ...  # write operations (auto-refresh CSRF)
```

`auth` should be a **top-level command** (not nested under a feature), since it's shared across all features.

## Endpoint Discovery

Include a `discover` command that navigates to a URL and intercepts all JSON API responses. This is invaluable for reverse-engineering internal APIs:

```bash
<service> discover --url "https://service.com/app/some-feature"
```

Logs: method, URL, status, request body, response shape for every API call the page makes.

## Debugging Tips

- **Take screenshots** at each login step (`page.screenshot()`) — don't guess what the page looks like
- **Dump the DOM** for form fields — `page.evaluate(() => Array.from(document.querySelectorAll('input')).map(...))`
- **Check `page.url()` after each step** — intermediate pages can masquerade as success
- **Test in-browser fetch first** — `page.evaluate(fetch(...))` to confirm the session works before trying external HTTP
- **Compare cookie sets** — check which cookies your working manual session has vs what Playwright extracts

## Reference Implementation

Build a `skills/<service>/scripts/lib/auth.ts` (login flow) plus a
`scripts/lib/<feature>-api.ts` (internal API client) following the structure above.
Calendly — with its multi-digit OTP inputs and Rails CSRF rotation — is a good
worked example of the gotchas this pattern exists to handle.
