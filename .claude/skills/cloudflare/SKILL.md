# Cloudflare Skill

Reference for automating Cloudflare via browser and API. This project uses the
Zero Trust dashboard (tunnels, connectors) and the DNS API (fluentworkshop.dev).

## Credentials

| Secret | Location |
|--------|----------|
| API token (DNS:Edit) | `~/.openclaw/credentials/cloudflare-api-key` or `CLOUDFLARE_API_TOKEN` env |
| API token (Tunnel:Edit) | `~/.openclaw/credentials/cloudflare-tunnel-api-key` *(create if needed)* |
| TUNNEL_SALT | 1Password: `op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT` |

## Account IDs

```
Account:  7605cf7daffb181f2e6f047fc7183b22  (Spantree, LLC)
Zone:     9e8e8118df63e27a2163cd4424bdebe1  (fluentworkshop.dev)
```

## Auth

Cloudflare dashboard login: **email → password → TOTP/2FA → org selector**.
TOTP is always required. See `TUNNEL.md` for browser automation details.

## Scripts

| Script | What it does |
|--------|-------------|
| `scripts/create-tunnels.ts` | Create per-box CF tunnels via browser automation; writes tokens to `instance-secrets.toml` |
| `scripts/create-tunnel-dns.ts` | Create 84 CNAME records (6 per box) in fluentworkshop.dev via API |

## DNS (API)

Zone: `fluentworkshop.dev` · Zone ID: `9e8e8118df63e27a2163cd4424bdebe1`

```bash
# List records
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | {name,type,content}'

# Create CNAME
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"<hostname>","content":"<target>","ttl":1,"proxied":false}'
```

Run `scripts/create-tunnel-dns.ts` for bulk creation (see `TUNNEL.md`).

## Tunnels

See **`TUNNEL.md`** for the full playbook: creation flow, token extraction,
DNS CNAME setup, and running the scripts end-to-end.

## Zero Trust dashboard URL structure

```
Connectors (tunnels):  https://dash.cloudflare.com/{account}/one/networks/connectors
Create tunnel:         https://dash.cloudflare.com/{account}/one/networks/connectors/cloudflare-tunnels/new
Tunnel edit:           https://dash.cloudflare.com/{account}/one/networks/connectors/cloudflare-tunnels/cloudflared/{tunnel-id}/edit
DNS records:           https://dash.cloudflare.com/{account}/fluentworkshop.dev/dns/records
Access apps:           https://dash.cloudflare.com/{account}/one/access-controls/apps
```
