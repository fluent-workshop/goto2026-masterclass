# GOTO 2026 Masterclass — Infrastructure

Exercise environment for the GOTO 2026 OpenClaw masterclass: 14 named GCP instances,
each running a pre-baked OpenClaw agent.

## Quick start

To install OpenClaw on a single fresh Ubuntu 22.04 server, see **[HUMANS.md](HUMANS.md)**.
For the AI agent playbook (Claude Code / Codex), see **[AGENTS.md](AGENTS.md)**.

```bash
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
cd goto2026-masterclass
sudo bash dotfiles/bootstrap.sh
```

---

## Repo layout

```
.
├── HUMANS.md                  # Step-by-step install guide for humans
├── AGENTS.md                  # Claude Code / Codex quick reference
├── instances.toml             # Roster of 14 boxes + per-box ElevenLabs voice IDs
├── instance-secrets.toml      # Per-box secrets: tokens, passwords (gitignored)
├── dotfiles/
│   ├── bootstrap.sh           # 9-phase idempotent bake script (the main event)
│   ├── mise.toml              # Pinned toolchain versions (Node, Bun, eza, starship)
│   ├── shell/                 # zsh configs baked into the image
│   ├── bin/                   # goto2026-sync and other on-box helpers
│   ├── desktop/               # Xfce + TigerVNC + noVNC + nginx units and configs
│   ├── firstboot/             # cloud-init first-boot service units
│   └── tunnel/                # cloudflared config helper and systemd unit
├── infra/
│   ├── clone.sh               # Renders per-box cloud-init and creates GCP VMs
│   ├── cloud-init/            # cloud-init template (per-box config at first boot)
│   ├── services/              # SonarQube + Postgres compose stack
│   ├── scripts/               # Cloudflare tunnel and DNS provisioning scripts
│   └── terraform/             # GCP instance definitions
├── .claude/
│   ├── skills/cloudflare/     # Cloudflare tunnel and DNS automation
│   └── skills/infra/          # Full fleet provisioning playbook for agents
└── docs/                      # Onboarding notes and other references
```

---

## How it works

**Bootstrap runs once to produce a golden image.** `dotfiles/bootstrap.sh` installs
the full environment on a fresh Ubuntu 22.04 VM across 9 named phases: base packages,
the mise toolchain (Node, Bun, OpenClaw), student tools (GitHub CLI, gcloud,
claude-code, codex, Supabase CLI), VS Code (code-server), the Xfce browser desktop,
local Whisper STT, cloudflared, Docker CE, and SonarQube. A GCP custom image is
captured from the stopped VM when the bake completes.

**Each student box is cloned from that image.** `infra/clone.sh` renders a
per-box cloud-init config from `instance-secrets.toml` and creates a GCP VM from the
golden image. On first boot, cloud-init sets the hostname, writes API keys to
`/etc/openclaw/`, activates the cloudflared tunnel, and starts SonarQube. The golden
image itself carries no secrets and no host-specific config.

**Per-instance differences stay out of the image.** Hostname, API keys, the
cloudflared tunnel token, the desktop password, and the ElevenLabs voice ID are all
injected at first-boot time. This keeps the bake fast, reproducible, and auditable.

---

## The roster

Abra · Ditto · Dragonite · Gengar · Jolteon · Lapras · Machamp · Meowth · Onix ·
Pikachu (instructor) · Rapidash · Squirtle · Vaporeon · Vulpix

GCP project: `goto2026-masterclass-500200` · Zone: `us-central1-a`

Hostname equals the Pokémon name, so support is "Lapras is wedged" not an IP.

---

## Hard constraints

**4 GB RAM minimum.** The 2 GB tier is unstable under skill load. All boxes use
`n2-standard-8` (8 vCPU, 32 GB) for the masterclass.

**Pre-provision, never cold-install in class.** Students boot into a ready agent.
The bake-once model exists so that "does it work" is answered before anyone is
in the room.

**The golden image carries no secrets.** `phase_verify` asserts that
`/etc/cloudflared/config.yml` does not exist at bake time. If it does, the bake fails.
Per-box secrets live only in `instance-secrets.toml` (gitignored) and, at runtime,
on the box itself under `/etc/openclaw/`.

---

## Secrets

Nothing sensitive lives in this repo. Per-box secrets are in `instance-secrets.toml`
(gitignored; copy from `instance-secrets.toml.example`). The Cloudflare API token
lives in `~/.openclaw/credentials/cloudflare-api-key`. See
`.claude/skills/infra/SKILL.md` for the full credentials reference.
