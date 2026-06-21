# Cloudflare Dashboard Automation

Browser automation skill for the Cloudflare and Zero Trust dashboards.
Use when you need to create tunnels, manage DNS, configure Access policies,
or perform any other Cloudflare task that requires dashboard UI interaction.

## When to use this skill

- Creating Cloudflare Tunnels (requires Tunnel:Edit scope not available via current API token)
- Anything requiring interactive auth (OTP-gated dashboard actions)
- Bulk DNS operations via UI when API token lacks the right scope
- Verifying dashboard state after API changes

## Auth flow

Cloudflare login is **email → password → TOTP (2FA) → org selector**.

- **TOTP is mandatory** — the human must enter the 6-digit code from their authenticator app
- The script must pause and wait for the human to complete all steps before proceeding
- After login, Cloudflare sets a session cookie valid for the browser session
- Use `await waitForLogin(page)` from `scripts/playwright-helpers.ts` — it pauses and prompts the human to press Enter once fully signed in

## Dashboard URL structure

```
# Main dashboard
https://dash.cloudflare.com/{account_id}/

# Zero Trust (networking, tunnels, Access)
https://one.dash.cloudflare.com/{account_id}/

# Tunnels list
https://one.dash.cloudflare.com/{account_id}/networks/tunnels

# Create tunnel
https://one.dash.cloudflare.com/{account_id}/networks/tunnels/new

# DNS records for a zone
https://dash.cloudflare.com/{account_id}/{zone_name}/dns/records
```

**Account IDs for this project:**
- Spantree, LLC account: `7605cf7daffb181f2e6f047fc7183b22`
- fluentworkshop.dev zone: `9e8e8118df63e27a2163cd4424bdebe1`

## Zero Trust tunnel creation flow

The tunnel creation wizard has 3 steps:

### Step 1: Choose connector type
- URL: `/networks/tunnels/new`
- UI: Two large cards — "Cloudflared" and "WARP Connector"
- Action: click the "Cloudflared" card, then "Next" or "Select"
- Selector: `text=Cloudflared` (first match), then `button:has-text("Next")`

### Step 2: Name the tunnel
- UI: A single text input for the tunnel name
- Selector: `input[placeholder*="tunnel"], input[name*="name"]`
- Action: fill with `goto2026-{box}`, then click "Save Tunnel"
- Selector for save: `button:has-text("Save Tunnel"), button:has-text("Save tunnel")`

### Step 3: Install connector (token lives here)
- After saving, the page shows OS-specific install instructions
- The **connector token** appears in the install command:
  `cloudflared service install eyJ...` or `cloudflared tunnel run --token eyJ...`
- Token format: a JWT starting with `eyJ` — extract with regex `/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/`
- Also look in: `code`, `pre`, `input[readonly]`, `[class*="code"]`
- ⚠️ The token is **only shown once during creation**. If you miss it, you must delete and recreate the tunnel.
- After extracting, click "Next" to move to the route configuration step (optional, safe to skip)

## DNS record management

DNS changes are available via both the API (Zone:DNS:Edit) and the dashboard.

For this project, prefer the API (`create-tunnel-dns.ts`) unless the token is missing Tunnel:Read scope.

Dashboard path: `https://dash.cloudflare.com/{account_id}/fluentworkshop.dev/dns/records`

## Playwright patterns

All automation scripts use the shared helpers in `scripts/playwright-helpers.ts`.

```typescript
import { launch, waitForLogin, extractToken } from '../scripts/playwright-helpers.ts';

const { browser, page } = await launch();
await page.goto(TUNNELS_URL);
await waitForLogin(page); // pauses for human sign-in + OTP
// ... rest of automation
await browser.close();
```

## Scripts in this skill

| Script | Purpose |
|--------|---------|
| `scripts/playwright-helpers.ts` | Shared browser launch, login wait, token extraction |
| `scripts/create-tunnels.ts` | Create 14 per-box Cloudflare Tunnels, write tokens to `instance-secrets.toml` |
| `scripts/create-tunnel-dns.ts` | Create 84 DNS CNAME records (6 per box) in fluentworkshop.dev |

## Running the tunnel creation flow

```bash
# Step 1: Create tunnels (headed browser, human signs in)
bun run .claude/skills/cloudflare/scripts/create-tunnels.ts

# Optional: target specific boxes
bun run .claude/skills/cloudflare/scripts/create-tunnels.ts --box pikachu,abra

# Dry run (no writes)
bun run .claude/skills/cloudflare/scripts/create-tunnels.ts --dry-run

# Step 2: Create DNS records (headless, needs TUNNEL_SALT from 1Password)
TUNNEL_SALT=<value> bun run .claude/skills/cloudflare/scripts/create-tunnel-dns.ts

# Step 3: Re-render cloud-init with per-box tokens
bash infra/clone.sh
```

## Credentials

- **API token (DNS:Edit):** `~/.openclaw/credentials/cloudflare-api-key`
- **API token (Tunnel:Edit — needed for DNS script tunnel ID lookups):** `~/.openclaw/credentials/cloudflare-tunnel-api-key` *(create in dashboard if needed)*
- **TUNNEL_SALT:** 1Password → `op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT`
- **instance-secrets.toml:** `{repo_root}/instance-secrets.toml` (gitignored) — holds per-box `CLOUDFLARED_TOKEN` values

## Idempotency

Both scripts are safe to re-run:
- `create-tunnels.ts` skips boxes that already have a non-empty token in `instance-secrets.toml`
- `create-tunnel-dns.ts` skips DNS records that already exist
- Boxes with existing tunnels on Cloudflare but no captured token are warned (tunnel must be deleted and recreated)
