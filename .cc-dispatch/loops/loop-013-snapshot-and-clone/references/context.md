# Loop 013 Context

## Test box state (verified Sun Jun 21 ~2pm CDT)
- Host: goto-test | IP: 87.99.153.105 | SSH: root@87.99.153.105 via ~/.ssh/id_ed25519
- Running: noVNC desktop, nginx :8080, sonarqube (healthy), postgres (healthy)
- Disk: 225G total, 7.9G used — plenty of space
- Cloudflared: INACTIVE (will be active on clones after cloud-init first boot)

## Secrets locations
- Hetzner API token: op://Openclaw/EVIE - Hetzner GOTO 2026 API KEY/password
- CLOUDFLARED_TOKEN: op://Openclaw/GOTO 2026 - Clone Secrets/CLOUDFLARED_TOKEN
- TUNNEL_SALT: op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT
- POSTGRES_APP_PASSWORD: per-instance in instance-secrets.toml (repo root, gitignored)

## 14 instances (instances.txt)
abra ditto dragonite gengar jolteon lapras machamp meowth onix pikachu rapidash squirtle vaporeon vulpix

## clone.sh usage
TUNNEL_SECRETS_SOURCE=op with OP_TUNNEL_SALT_ITEM and OP_CLOUDFLARED_TOKEN_ITEM set.
OPENCLAW_API_KEY_SOURCE=stub is fine for now (real keys are a follow-on loop).
POSTGRES_APP_PASSWORD now reads from instance-secrets.toml per hostname.

## OP service account
The op CLI works non-interactively when OP_SERVICE_ACCOUNT_TOKEN is set:
  export OP_SERVICE_ACCOUNT_TOKEN=$(security find-generic-password -s "op-service-account-token" -w 2>/dev/null)
