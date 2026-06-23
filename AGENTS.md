# AGENTS.md — GOTO 2026 Masterclass Fleet

14-box GCP masterclass fleet. Golden-image bake + per-box cloud-init clone model.
Full provisioning playbook: `.claude/skills/infra/SKILL.md`.

## Quick Commands

```bash
# Bake the golden image (run on a fresh VM, then stop + image)
sudo bash dotfiles/bootstrap.sh

# Clone a single box from the golden image
bash infra/clone.sh <boxname>

# Verify a box (SSH + spot checks)
ssh ubuntu@<IP>
openclaw --version && node -v && systemctl is-active openclaw-tunnel

# Re-run a single phase (resumes without stamp)
sudo bash dotfiles/bootstrap.sh --phase <phase_name>

# Force all phases (ignore all stamps)
sudo bash dotfiles/bootstrap.sh --force

# List all box IPs
gcloud compute instances list \
  --project goto2026-masterclass-500200 \
  --format="table(name,networkInterfaces[0].accessConfigs[0].natIP)"

# Sync dotfiles/configs on a live box (no rebake)
ssh ubuntu@<IP> sudo goto2026-sync
```

## Architecture

Bootstrap runs once at bake time: 9 named phases install the full toolchain,
desktop, Whisper STT, Docker, and SonarQube into a GCP custom image. Per-box
config (hostname, API keys, cloudflared token) is injected by cloud-init at
first boot from the cloned image — the golden image stays generic.

See `HUMANS.md` for the step-by-step human walkthrough.

## Credentials

| Secret | Location |
|--------|----------|
| GCP project | `goto2026-masterclass-500200` · zone `us-central1-a` |
| Per-box secrets | `instance-secrets.toml` (gitignored; see `.example`) |
| Cloudflare API token | `~/.openclaw/credentials/cloudflare-api-key` |
| TUNNEL_SALT | `instance-secrets.toml` + 1Password `op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT` |

## Boxes

`pikachu` (instructor), `abra`, `ditto`, `dragonite`, `gengar`, `jolteon`,
`lapras`, `machamp`, `meowth`, `onix`, `rapidash`, `squirtle`, `vaporeon`, `vulpix`

## Skills

Full provisioning playbook: `.claude/skills/infra/SKILL.md`
Cloudflare tunnels + DNS: `.claude/skills/cloudflare/SKILL.md`
