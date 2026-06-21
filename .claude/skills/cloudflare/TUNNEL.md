# Cloudflare Tunnel Playbook

Per-box tunnel setup for the GOTO 2026 masterclass. Each of the 14 student
boxes gets its own Cloudflare Tunnel so per-box hostname routing works correctly.
One shared token = broken routing (all connectors register as HA replicas of the
same tunnel; requests can land on the wrong box).

## Architecture

Each box exposes 6 public hostnames via its tunnel (see `openclaw-tunnel-config.sh`):

```
{box}-goto2026-app.fluentworkshop.dev                          ← public (no hash)
{box}-goto2026-desktop-{hash8}.fluentworkshop.dev              ← protected
{box}-goto2026-supabase-studio-{hash8}.fluentworkshop.dev      ← protected
{box}-goto2026-gateway-{hash8}.fluentworkshop.dev              ← protected
{box}-goto2026-ssh-{hash8}.fluentworkshop.dev                  ← protected
{box}-goto2026-postgres-{hash8}.fluentworkshop.dev             ← protected
```

`hash8 = sha256(hostname + TUNNEL_SALT)[:8]` — derived on first boot from
`/etc/openclaw/tunnel.env`. The salt is fleet-wide; only the hostname varies.

## State files

- **`instance-secrets.toml`** (repo root, gitignored) — holds `CLOUDFLARED_TOKEN`
  per `[box]` section. Populated by `scripts/create-tunnels.ts`.
- **`infra/clone.sh`** — reads `CLOUDFLARED_TOKEN` per-box via `fetch_instance_cloudflared_token()`
  and injects it into cloud-init. Re-run after tokens are written.

## Step 1 — Create tunnels (browser automation)

```bash
bun run .claude/skills/cloudflare/scripts/create-tunnels.ts [--dry-run] [--box pikachu,abra]
```

Opens a headed Chromium. You sign in (email → password → TOTP → org selector),
then the script creates one tunnel per box and writes the connector token to
`instance-secrets.toml`.

**Idempotent:** boxes with a non-empty token in the TOML are skipped.

### How the script works

The CF Zero Trust dashboard is a React SPA. Navigation flow per tunnel:

1. `browser.navigate` → `/one/networks/connectors/cloudflare-tunnels/new`
2. Click **Select Cloudflared** (step 1 — may be skipped on repeat visits if CF remembers)
3. Fill tunnel name (`goto2026-{box}`), click **Save Tunnel**
4. Wait ~8s for the "Install and run connectors" step to render
5. Extract the full connector token from **React fiber** (see below)
6. Write token to `instance-secrets.toml`

### Token extraction — React fiber

The token is **visually truncated** in the DOM (`eyJhIjoiNz...`) but the full
value lives in React component props. This works on both the creation wizard
and the tunnel edit page ("Add a connector" panel):

```javascript
function fiberToken() {
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
    if (r) return r.replace(/.*--token\s+/, '').trim();
    node = node.return;
  }
  return null;
}
```

> Clipboard hook (`navigator.clipboard.writeText`) also works but requires
> clicking the copy button. Fiber traversal is fully headless and more reliable.

### Recovering a token after creation

If a tunnel exists but the token wasn't captured:

1. Navigate to the tunnel edit page
2. Click **Add a connector**
3. Run `fiberToken()` in the browser evaluate context

No need to delete and recreate the tunnel.

### ⚠️ Key gotcha — `window.location.href` kills JS context

Do **not** use `window.location.href = ...` inside an injected script to navigate
between pages. It causes a full page reload, destroying the script's execution context
and losing all accumulated state. Use the browser tool's `navigate` action between
tunnels, then a fresh `evaluate` per tunnel.

## Step 2 — Create DNS records

```bash
# Requires TUNNEL_SALT from 1Password
TUNNEL_SALT=<value> bun run .claude/skills/cloudflare/scripts/create-tunnel-dns.ts [--dry-run] [--box pikachu,abra]
```

Reads tunnel IDs by name from the CF API, then creates 6 CNAME records per box:
`{hostname} → {tunnel-id}.cfargotunnel.com` in the `fluentworkshop.dev` zone.

**Idempotent:** existing records are skipped.

Requires an API token with **Tunnel:Read** (to look up tunnel IDs by name) and
**Zone:DNS:Edit**. The current `cloudflare-api-key` has DNS:Edit only. Options:
- Create a combined token and put it at `~/.openclaw/credentials/cloudflare-tunnel-api-key`
- Or use the OpenClaw browser session (logged into CF) to look up IDs via `evaluate`
  and hardcode them into a JSON file for the DNS script to consume

## Step 3 — Re-render cloud-init

After both steps above, re-run `clone.sh` to inject the per-box tokens:

```bash
bash infra/clone.sh
```

Then tell loop-013 Phase D to proceed.

## Tunnel naming convention

`goto2026-{box}` — e.g. `goto2026-pikachu`, `goto2026-abra`.

Boxes: abra, ditto, dragonite, gengar, jolteon, lapras, machamp, meowth, onix,
pikachu, rapidash, squirtle, vaporeon, vulpix (14 total, see `instances.txt`).
