---
name: infra
description: Provision, bake, clone, and maintain the GOTO 2026 masterclass GCP fleet.
---

# Infra Skill — GOTO 2026 Masterclass Fleet

## Overview

**Bake once, clone many.** A single GCP VM is provisioned with `dotfiles/bootstrap.sh`
(9 named phases), then stopped and captured as a custom image in the `goto2026-golden`
family. Each of the 14 student boxes is created from that image via `infra/clone.sh`,
which injects per-box cloud-init metadata at clone time.

**What goes bake-time:** everything heavyweight — apt packages, mise toolchain,
Node/Bun/eza/starship/openclaw, VS Code, Xfce desktop, TigerVNC, noVNC, nginx,
Whisper STT (tiny model), cloudflared binary, Docker CE, SonarQube stack, phase verification.

**What goes first-boot (cloud-init):** hostname, API keys, cloudflared tunnel token,
ElevenLabs voice ID, any per-student credentials. The golden image stays generic.

---

## Credentials & Secrets

| Secret | Location |
|--------|----------|
| GCP auth | `gcloud auth login` + `gcloud config set project goto2026-masterclass-500200` |
| Per-box secrets | `instance-secrets.toml` (gitignored; copy from `.example`) |
| Cloudflare API token | `~/.openclaw/credentials/cloudflare-api-key` or `$CLOUDFLARE_API_TOKEN` |
| TUNNEL_SALT | `instance-secrets.toml` + 1Password `op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT` |
| GCP project | `goto2026-masterclass-500200` |
| GCP zone | `us-central1-a` |
| Machine type | `n2-standard-8` |

For Cloudflare tunnel creation and DNS, see `.claude/skills/cloudflare/SKILL.md`.

---

## Baking the Golden Image

### 1. Create a bake VM

```bash
gcloud compute instances create goto-test \
  --zone us-central1-a \
  --machine-type n2-standard-8 \
  --image-family ubuntu-2204-lts \
  --image-project ubuntu-os-cloud \
  --boot-disk-size 50GB
```

### 2. SSH in and clone the repo

```bash
gcloud compute ssh goto-test --zone us-central1-a
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
cd goto2026-masterclass
```

### 3. Run the bake

```bash
sudo bash dotfiles/bootstrap.sh
```

Takes ~15–20 minutes. Idempotent — completed phases are stamped under
`/var/lib/bake/`. Re-run after failure; only the failed phase reruns.

### 4. Stop, image, (optionally) delete

```bash
# From your local machine:
gcloud compute instances stop goto-test --zone us-central1-a

gcloud compute images create goto2026-golden-$(date +%Y%m%d) \
  --source-disk goto-test \
  --source-disk-zone us-central1-a \
  --family goto2026-golden

# Optional cleanup:
gcloud compute instances delete goto-test --zone us-central1-a
```

---

## Cloning a Box

```bash
bash infra/clone.sh <boxname>
# e.g.: bash infra/clone.sh gengar
```

`clone.sh` creates the GCP VM from the latest `goto2026-golden` image, injects
cloud-init metadata (secrets from `instance-secrets.toml`), and starts the VM.
First boot self-configures: sets hostname, writes API keys, starts cloudflared
tunnel and other systemd services. First boot takes ~2 minutes.

To clone all 14 boxes:

```bash
for box in pikachu abra ditto dragonite gengar jolteon lapras machamp meowth onix rapidash squirtle vaporeon vulpix; do
  bash infra/clone.sh "$box"
done
```

---

## Phase Reference

| Phase | Installs | Key pins | Stamp path | ~Time |
|---|---|---|---|---|
| `phase_base` | Base apt packages, `ubuntu` user, shell config | apt packages | `/var/lib/bake/phase_base` | 2 min |
| `phase_toolchain` | mise, Node, Bun, eza, starship, openclaw | `MISE_VERSION`, `OPENCLAW_VERSION`, `dotfiles/mise.toml` | `/var/lib/bake/phase_toolchain` | 5 min |
| `phase_student_tools` | gh, gcloud SDK, claude-code, codex, supabase CLI, semgrep | npm globals pinned | `/var/lib/bake/phase_student_tools` | 3 min |
| `phase_vscode` | VS Code CLI (code-server, browser IDE) | Latest stable at bake time | `/var/lib/bake/phase_vscode` | 1 min |
| `phase_desktop` | Xfce4, TigerVNC, noVNC, nginx | System packages | `/var/lib/bake/phase_desktop` | 4 min |
| `phase_whisper` | Local Whisper STT, tiny model baked in | `tiny` model | `/var/lib/bake/phase_whisper` | 2 min |
| `phase_tunnel` | cloudflared binary (Cloudflare Tunnel connector) | Latest stable | `/var/lib/bake/phase_tunnel` | 1 min |
| `phase_docker` | Docker CE, docker compose, SonarQube compose stack | Docker CE stable | `/var/lib/bake/phase_docker` | 2 min |
| `phase_verify` | End-to-end bake verification (asserts all tools present) | — | `/var/lib/bake/phase_verify` | 1 min |

---

## Cloud-Init (First Boot)

`infra/cloud-init/template.yaml` is rendered per-box by `clone.sh` with values
from `instance-secrets.toml`. At first boot it:

1. Sets the system hostname to the box name (e.g. `gengar`)
2. Writes API keys and voice IDs to `/etc/openclaw/env` (sourced by systemd units)
3. Writes the cloudflared tunnel token and enables + starts `openclaw-tunnel.service`
4. Starts `openclaw-services.service` (OpenClaw agent) and `openclaw-desktop-vnc.service`
5. Registers the box's public IP in the team's internal registry (if configured)

After first boot, services should be running and the Cloudflare tunnel should
appear as "Healthy" in the Zero Trust dashboard.

---

## Fleet Operations

### List all box IPs

```bash
gcloud compute instances list \
  --project goto2026-masterclass-500200 \
  --format="table(name,networkInterfaces[0].accessConfigs[0].natIP)"
```

### SSH to a box

```bash
ssh ubuntu@<IP>
```

### Update dotfiles/configs on a live box (no rebake)

```bash
ssh ubuntu@<IP> sudo goto2026-sync
```

Loop over all boxes:

```bash
for IP in <ip1> <ip2> ...; do
  ssh -o StrictHostKeyChecking=no ubuntu@$IP sudo goto2026-sync &
done
wait
```

### Restart a service

```bash
ssh ubuntu@<IP> sudo systemctl restart openclaw-tunnel
ssh ubuntu@<IP> sudo systemctl restart openclaw-services
ssh ubuntu@<IP> sudo systemctl restart openclaw-desktop-vnc
```

---

## Debugging

### Check which phases completed

```bash
ls /var/lib/bake/
```

Each file name is a completed phase. Missing stamp = phase hasn't run or failed.

### Service logs

```bash
journalctl -u openclaw-tunnel -n 50
journalctl -u openclaw-services -n 50
journalctl -u openclaw-desktop-vnc -n 50
```

### Re-run a failed phase

```bash
# On the VM:
sudo bash dotfiles/bootstrap.sh --phase <phase_name>
# e.g.:
sudo bash dotfiles/bootstrap.sh --phase phase_toolchain
```

### Force all phases (ignore all stamps)

```bash
sudo bash dotfiles/bootstrap.sh --force
```

---

## Box Hostname → IP Mapping

| Box | IP | Role |
|-----|----|------|
| pikachu | 104.154.145.56 | Instructor |
| abra | 136.114.167.76 | Student |
| ditto | 136.113.57.119 | Student |
| dragonite | 34.31.231.171 | Student |
| gengar | 34.70.212.33 | Student |
| jolteon | 35.253.84.147 | Student |
| lapras | 35.253.148.226 | Student |
| machamp | 34.46.136.146 | Student |
| meowth | 104.155.149.51 | Student |
| onix | 136.119.127.242 | Student |
| rapidash | 104.198.221.95 | Student |
| squirtle | 34.121.28.214 | Student |
| vaporeon | 104.198.37.104 | Student |
| vulpix | 34.10.214.214 | Student |

---

## URL Patterns

Each box exposes services via Cloudflare Tunnel on `fluentworkshop.dev`.

| Pattern | Example | Notes |
|---------|---------|-------|
| `{box}-gt26-app.fluentworkshop.dev` | `gengar-gt26-app.fluentworkshop.dev` | Main student app (unauthenticated) |
| `{box}-gt26-{service}-{hash8}.fluentworkshop.dev` | `gengar-gt26-desktop-a1b2c3d4.fluentworkshop.dev` | Protected services (noVNC, VS Code, SonarQube, etc.) |

The `{hash8}` suffix is derived from TUNNEL_SALT + box name, ensuring predictable
but non-guessable URLs. Generated at tunnel-creation time by `scripts/create-tunnels.ts`.

DNS records (84 CNAMEs, 6 per box) are managed via the Cloudflare API.
See `.claude/skills/cloudflare/SKILL.md` for creation commands.
