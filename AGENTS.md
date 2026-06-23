# AGENTS.md — OpenClaw Server Setup

Install and configure OpenClaw on a fresh Ubuntu 22.04 server.
Full provisioning playbook: `.claude/skills/infra/SKILL.md`.

## Quick Commands

```bash
# Install on a fresh server (clone repo first, then run as sudo)
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
cd goto2026-masterclass
sudo bash dotfiles/bootstrap.sh

# Verify the install
openclaw --version && node -v && bun --version
systemctl is-active openclaw-tunnel openclaw-services openclaw-desktop-vnc

# Re-run a single phase (bypasses its stamp)
sudo bash dotfiles/bootstrap.sh --phase <phase_name>

# Force all phases (ignore all stamps)
sudo bash dotfiles/bootstrap.sh --force

# Sync dotfiles/configs on a live server (no rebake needed)
sudo goto2026-sync

# Fleet only — list all box IPs
gcloud compute instances list \
  --project goto2026-masterclass-500200 \
  --format="table(name,networkInterfaces[0].accessConfigs[0].natIP)"
```

## Architecture

`dotfiles/bootstrap.sh` runs 9 named phases on a fresh Ubuntu 22.04 server,
installing the full toolchain (mise → Node/Bun/OpenClaw), browser desktop
(Xfce + TigerVNC + noVNC), VS Code, Whisper STT, Docker, and SonarQube.
Completed phases are stamped under `/var/lib/bake/` — the script is idempotent.

For fleet deployments: bake a GCP custom image once, then clone N boxes from
it. Per-box config (hostname, API keys, cloudflared token) is injected by
cloud-init at first boot. See `HUMANS.md` for both paths.

## Credentials (fleet deployments only)

| Secret | Location |
|--------|----------|
| GCP project | `goto2026-masterclass-500200` · zone `us-central1-a` |
| Per-box secrets | `instance-secrets.toml` (gitignored; see `.example`) |
| Cloudflare API token | `~/.openclaw/credentials/cloudflare-api-key` |
| TUNNEL_SALT | `instance-secrets.toml` + 1Password `op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT` |

## Boxes (fleet deployments only)

`pikachu` (instructor), `abra`, `ditto`, `dragonite`, `gengar`, `jolteon`,
`lapras`, `machamp`, `meowth`, `onix`, `rapidash`, `squirtle`, `vaporeon`, `vulpix`

## Skills

Full provisioning playbook: `.claude/skills/infra/SKILL.md`
Cloudflare tunnels + DNS: `.claude/skills/cloudflare/SKILL.md`
