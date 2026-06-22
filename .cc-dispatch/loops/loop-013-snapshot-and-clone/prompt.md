Take a Hetzner snapshot of goto-test, then clone 14 student boxes from it.

READ FIRST:
- `.cc-dispatch/loops/loop-013-snapshot-and-clone/goal.md` — full spec
- `.cc-dispatch/loops/loop-013-snapshot-and-clone/references/context.md` — current state

Mode: autonomous (--dangerously-skip-permissions), work directly on main.
Do NOT modify source code. Infrastructure operations only.

Hetzner API token: op://Openclaw/EVIE - Hetzner GOTO 2026 API KEY/password
SSH access to goto-test: root@87.99.153.105 via ~/.ssh/id_ed25519
clone.sh reads fleet secrets via TUNNEL_SECRETS_SOURCE=op from:
  op://Openclaw/GOTO 2026 - Clone Secrets/CLOUDFLARED_TOKEN
  op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT
Per-instance POSTGRES_APP_PASSWORD: from instance-secrets.toml (already in repo root)

Done when: report.md documents snapshot ID, all 14 box IDs/IPs, and SSH-verified
status for at least 3 boxes, OR stop after 40 turns and report what's blocking.
