# GOTO 2026 Masterclass — Infrastructure

Exercise environment for the GOTO 2026 OpenClaw masterclass: 14 named student VPS
instances on Hetzner Cloud, each running a pre-baked OpenClaw agent.

## Layout

```
.
├── instances.txt              # Canonical roster (hostname = Pokémon name)
├── dotfiles/                  # Linux agent environment (ported from macOS dotfiles)
│   ├── bootstrap.sh           # Idempotent: installs openclaw + pinned deps
│   └── shell/                 # zsh/env config baked into the image
├── infra/
│   ├── cloud-init/            # Per-instance config (hostname + key injection)
│   └── *.sh                   # Bake / clone / reset scripts
└── docs/                      # Recipes, runbook
```

## The model: bake once, clone 14

1. **Bake** — run `dotfiles/bootstrap.sh` on one fresh Hetzner VPS → snapshot it.
   The snapshot is the golden image. Byte-identical clones, not re-runs.
   (Pinned: openclaw `2026.6.5` — Cedric's verified build.)
2. **Clone** — spin 14 servers from the snapshot. Per-instance cloud-init sets the
   hostname (the Pokémon name) and injects that box's API key.
3. **Reset** — `infra/reset.sh` restores any wedged instance to clean state.

Why not Ansible: this is a one-shot golden image with a 2-day lifespan, not a fleet
managed over time. A snapshot is more reproducible than any re-run, and bash +
cloud-init is followable by attendees who don't read Python/Jinja.

## The roster

Abra · Ditto · Dragonite · Gengar · Jolteon · Lapras · Machamp · Meowth · Onix ·
Pikachu · Rapidash · Squirtle · Vaporeon · Vulpix

Hostname = the name, so support is "Snorlax is wedged" not an IP. (No Snorlax here —
names were picked to be spellable under stress and free of negative connotations.)

## Hard constraints (from prior research — don't relearn these)

- **4GB RAM minimum** per VPS. The 2GB tier is unstable under skill load.
- **Pre-provision, never cold-install in class.** Students boot into a ready agent.
- Teach **`openclaw doctor --fix`** and message-queue mode explicitly — the recovery
  tools when a student wedges their instance.

## Secrets

Nothing sensitive lives in this repo. The Hetzner API token and per-instance keys
live in 1Password (`EVIE - Hetzner GOTO 2026 API KEY`) and are injected at clone time.
