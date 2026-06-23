# HUMANS.md — Setup Guide

Step-by-step guide for installing OpenClaw on a fresh Linux server.
For the AI agent playbook, see `AGENTS.md` and `.claude/skills/infra/SKILL.md`.

---

## Prerequisites

- A fresh **Ubuntu 22.04 LTS** server (GCP, Hetzner, DigitalOcean, AWS, bare metal — anything works)
- SSH access with a sudo-capable user
- The repo cloned **on the server** (not piped over curl — the script needs its asset directories present on disk)

---

## Install

### Step 1 — Clone the repo on the server

```bash
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
cd goto2026-masterclass
```

> **Why not `curl | bash`?** The script copies shell configs, desktop units, and
> service files from the repo checkout. It fails loudly if those directories are
> absent, so a pipe install is intentionally blocked.

### Step 2 — Run the bootstrap

```bash
sudo bash dotfiles/bootstrap.sh
```

That's it. The script installs everything in order. Takes **~15–20 minutes** on
a fresh VM. Watch for:

```
==> Bake complete.
```

### Step 3 — Verify the install

```bash
# Check the toolchain (these should all return version strings)
openclaw --version
node -v
bun --version
supabase --version

# Check services came up
systemctl status openclaw-tunnel
systemctl status openclaw-services
systemctl status openclaw-desktop-vnc
```

If services are unhealthy, check logs:

```bash
journalctl -u openclaw-tunnel -n 50
journalctl -u openclaw-services -n 50
```

---

## What gets installed

| Phase | What it installs | Key pins |
|---|---|---|
| `phase_base` | Base apt packages (`curl`, `git`, `zsh`, `tmux`, `jq`, `ripgrep`), `ubuntu` user | apt |
| `phase_toolchain` | mise, Node, Bun, eza, starship, OpenClaw | `dotfiles/mise.toml` + `OPENCLAW_VERSION` in script |
| `phase_student_tools` | GitHub CLI (`gh`), gcloud, `claude-code`, `codex`, Supabase CLI, semgrep | npm globals |
| `phase_vscode` | code-server (browser-based VS Code on `:8088`) | `CODE_SERVER_VERSION` in script |
| `phase_desktop` | Xfce4 + TigerVNC + noVNC + nginx (desktop at `:8080`) | apt |
| `phase_whisper` | openai-whisper + tiny model pre-downloaded | tiny model |
| `phase_tunnel` | cloudflared binary (Cloudflare Tunnel connector) | `CLOUDFLARED_VERSION` in script |
| `phase_docker` | Docker CE + compose plugin, SonarQube + Postgres compose stack | Docker CE stable |
| `phase_verify` | End-to-end assertion that all tools resolve correctly | — |

All pinned versions are at the top of `dotfiles/bootstrap.sh`. Bump them there
when you want to upgrade.

---

## Re-running after a failure

The script is **idempotent**. Completed phases write a stamp file under
`/var/lib/bake/` and skip on re-run. If something fails mid-bake, fix the
issue and re-run — only the failed (and subsequent) phases re-execute.

Re-run a single phase explicitly:

```bash
sudo bash dotfiles/bootstrap.sh --phase phase_toolchain
```

Force all phases to rerun (ignores stamps):

```bash
sudo bash dotfiles/bootstrap.sh --force
```

---

## Updating a live server

A sync helper is installed at bake time. To pull the latest dotfiles and
re-apply configs without a full rebake:

```bash
sudo goto2026-sync
```

---

## Per-box config (Cloudflare Tunnel, API keys)

The bootstrap installs cloudflared but leaves it **unconfigured** — a tunnel
token is required to activate it. Token-based config is injected at first boot
via cloud-init when using the fleet clone path (see below). For a single server,
write the values yourself:

```bash
sudo mkdir -p /etc/openclaw
sudo tee /etc/openclaw/tunnel.env > /dev/null <<EOF
CLOUDFLARED_TOKEN=<your-tunnel-token>
TUNNEL_SALT=<your-salt>
EOF
sudo systemctl enable --now openclaw-tunnel
```

---

## Advanced: Fleet deployment with a golden image

If you need to deploy the same environment to many servers quickly (e.g. a
classroom), you can bake a GCP custom image once and clone it N times rather
than running bootstrap.sh on each box.

### Bake the golden image

```bash
# Create a throwaway bake VM
gcloud compute instances create goto-bake \
  --zone us-central1-a \
  --machine-type n2-standard-8 \
  --image-family ubuntu-2204-lts \
  --image-project ubuntu-os-cloud \
  --boot-disk-size 50GB

# SSH in, clone the repo, run the bake
gcloud compute ssh goto-bake --zone us-central1-a
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
cd goto2026-masterclass && sudo bash dotfiles/bootstrap.sh

# Back on your local machine — stop the VM and capture the image
gcloud compute instances stop goto-bake --zone us-central1-a
gcloud compute images create goto2026-golden-$(date +%Y%m%d) \
  --source-disk goto-bake \
  --source-disk-zone us-central1-a \
  --family goto2026-golden

# Clean up
gcloud compute instances delete goto-bake --zone us-central1-a
```

### Clone boxes from the image

```bash
# Single box
bash infra/clone.sh <boxname>

# All 14 masterclass boxes
for box in pikachu abra ditto dragonite gengar jolteon lapras machamp meowth onix rapidash squirtle vaporeon vulpix; do
  bash infra/clone.sh "$box"
done
```

Each cloned box self-configures on first boot from cloud-init metadata injected
by `clone.sh` (hostname, API keys, cloudflared tunnel token). First boot takes
~2 minutes. Per-box secrets live in `instance-secrets.toml` (gitignored; copy
from `instance-secrets.toml.example` and fill in values before cloning).

See `.claude/skills/infra/SKILL.md` for the full fleet operations reference.
