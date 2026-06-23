# HUMANS.md — Setup guide

Step-by-step guide for installing OpenClaw on a fresh Linux server.
For the AI agent playbook, see `AGENTS.md` and `.claude/skills/infra/SKILL.md`.

---

## Prerequisites

You need a fresh **Ubuntu 22.04 LTS** server with SSH access and a sudo-capable
user. GCP, Hetzner, DigitalOcean, AWS, bare metal, a local VM — it doesn't
matter. The script is tested on Ubuntu 22.04 but should work on any recent
Ubuntu LTS.

You do not need gcloud, Cloudflare credentials, or any other cloud tooling just
to get OpenClaw running on a single server. Those only come into play if you're
doing fleet deployments (see the appendix at the end).

---

## Part 1 — Install

### Step 1 — Clone the repo on the server

```bash
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
cd goto2026-masterclass
```

**The repo must be cloned on the server itself, not your local machine.** The
bootstrap script copies shell configs, desktop units, and service files from the
checkout. It checks for those directories up front and fails loudly if they're
missing, so piping the script over curl won't work. This is intentional. The
preflight check exists specifically so you don't end up with a half-configured
box that passes the bake and then breaks subtly in class.

### Step 2 — Run the bootstrap

```bash
sudo bash dotfiles/bootstrap.sh
```

**Run it as root (via sudo), not as your user.** The script installs apt
packages, creates the `ubuntu` agent user, writes systemd units, and wires
symlinks into `/usr/local/bin`. All of that needs root. The parts that need to
run as the agent user (mise installs, npm globals) are handled internally with
`sudo -u ubuntu`.

**It takes about 15-20 minutes on a fresh VM.** Most of that time is in
`phase_desktop` (Xfce + TigerVNC + noVNC) and `phase_whisper` (downloading and
compiling PyTorch CPU-only + the Whisper tiny model). The toolchain phases are
faster. You'll see progress lines like `==> Installing toolchain from
mise.toml...` as each phase runs. The script ends with:

```
==> Bake complete.
```

**If a phase fails, just re-run.** Each phase writes a stamp file to
`/var/lib/bake/` when it completes. On a re-run, the script skips any phase
whose stamp is present and picks up from where it left off. You don't lose work
from a failed run. If you need to force a specific phase to rerun:

```bash
sudo bash dotfiles/bootstrap.sh --phase phase_toolchain
```

### Step 3 — Verify the install

Start by confirming the toolchain resolved correctly:

```bash
openclaw --version
node -v
bun --version
supabase --version
gh --version
```

**All of these should return version strings, not "command not found".** The
verify phase at the end of the bake runs a non-login shell check that confirms
every tool resolves without sourcing any shell config, but it's worth checking
yourself anyway. If `openclaw --version` returns nothing, `phase_toolchain`
probably didn't complete — check `/var/lib/bake/` for which stamps exist.

Then check services:

```bash
systemctl status openclaw-tunnel
systemctl status openclaw-services
systemctl status openclaw-desktop-vnc
```

**`openclaw-tunnel` will be in a failed or activating state until you configure
it.** That's expected. The cloudflared binary is installed but the tunnel token
hasn't been set yet (see the configuration section below). The same goes for
`openclaw-services` (SonarQube) on first run, since Docker pulls the images
on first boot and that takes a minute. `openclaw-desktop-vnc` should come up
cleanly.

For any service that looks unhealthy:

```bash
journalctl -u openclaw-tunnel -n 50
journalctl -u openclaw-services -n 50
```

---

## Part 2 — What gets installed

The bootstrap is organized into 9 named phases, each with a specific scope.

**`phase_base`** installs the base apt packages the rest of the toolchain
depends on: `curl`, `git`, `zsh`, `tmux`, `jq`, `ripgrep`, `unzip`, and
`build-essential`. It also creates or repairs the `ubuntu` agent user and sets
its login shell to zsh. On a standard Ubuntu cloud image, this user already
exists with passwordless sudo and an injected SSH key, so this phase is mostly
a no-op.

**`phase_toolchain`** is the heart of the setup. It installs mise
(the per-user toolchain manager, pinned to an exact version with checksum
verification), then uses `mise.toml` to pin and install Node, Bun, eza,
starship, and OpenClaw. The versions are declared in `dotfiles/mise.toml` and
locked at the top of `bootstrap.sh` via `OPENCLAW_VERSION` and `MISE_VERSION`.
After install, the phase wires shims from the mise toolchain into
`/usr/local/bin` so everything resolves in non-login shells (systemd units,
`ssh host openclaw ...`, etc.) without sourcing any shell config.

**`phase_student_tools`** adds the tools used in the masterclass exercises:
GitHub CLI (`gh`), gcloud SDK, `claude-code`, `codex`, Supabase CLI, and
semgrep. These come from their own apt repos (GitHub CLI, Google Cloud) and
from npm globals. This phase takes a few minutes because apt has to fetch two
signed external repos before installing.

**`phase_vscode`** installs code-server, the browser-based VS Code from
coder. It runs on `localhost:8088`, auth-gated by the password that
cloud-init writes at first boot. This replaces VS Code Remote Tunnels (which
require per-student GitHub OAuth) with something that needs no external auth.

**`phase_desktop`** sets up the full browser desktop: Xfce4 session on a
loopback-only TigerVNC display, websockify bridging VNC to a WebSocket on port
6080, and nginx reverse-proxying port 8080 with HTTP basic auth. This is the
heaviest phase, pulling in roughly 300 MB of X packages. The cloudflared
connector (installed in `phase_tunnel`) fronts port 8080 over a Cloudflare
Tunnel and terminates TLS at Cloudflare's edge.

**`phase_whisper`** installs `openai-whisper` and its PyTorch CPU dependency
via pip, then pre-downloads the tiny model to the agent user's home
directory. Pre-baking the model means first boot never stalls on a 75 MB
download. The bake also installs a `whisper-transcribe` wrapper script at
`/usr/local/bin/whisper-transcribe` that OpenClaw's audio config points to
as its primary STT path.

**`phase_tunnel`** installs the `cloudflared` binary from a pinned upstream
release. It lays down a config-generator helper and the systemd connector unit,
but leaves the config un-rendered. The per-box tunnel config is generated at
first boot from cloud-init-injected values (CLOUDFLARED_TOKEN and TUNNEL_SALT),
so the baked image carries no token and no host-specific state.

**`phase_docker`** installs Docker CE and the compose plugin from the official
Docker apt repo, adds the ubuntu user to the docker group, and drops the
SonarQube + Postgres compose stack into `/opt/openclaw/services/`. The stack
is not pulled or started at bake time; the systemd unit brings it up on first
boot, which is when Docker actually pulls the images.

**`phase_verify`** runs assertions, not installation. It checks that the
whole toolchain resolves in a stripped non-login shell (matching what systemd
sees), validates the nginx config, confirms nginx binds on loopback only,
validates the compose file syntax, and asserts that cloudflared is installed
but that no per-box tunnel config has been rendered yet. A bake that passes
phase_verify is safe to image.

---

## Part 3 — Configure the tunnel and API keys

**The cloudflared tunnel needs a token before it will connect.** At bake time
the binary is installed but unconfigured. For a single server, write the
credentials by hand:

```bash
sudo mkdir -p /etc/openclaw
sudo tee /etc/openclaw/tunnel.env > /dev/null <<EOF
CLOUDFLARED_TOKEN=<your-token>
TUNNEL_SALT=<your-salt>
EOF
sudo systemctl enable --now openclaw-tunnel
```

The `CLOUDFLARED_TOKEN` comes from your Cloudflare Zero Trust dashboard when
you create a tunnel. The `TUNNEL_SALT` is a hex string used to hash service
hostnames so they're not guessable. Pick any random 32-character hex value for
a single-server setup (run `openssl rand -hex 16`).

**OpenClaw API keys and other per-box credentials** can be dropped in
`/etc/openclaw/` as additional env files. The `openclaw-init.service` unit
(enabled by the bake, runs after cloud-init) sources everything in that
directory at first boot. For a single server you can also just set them in
`~/.config/openclaw/config.yaml` directly.

---

## Part 4 — Updating a live server

**To pull the latest dotfiles and configs without a full reinstall**, run the
sync helper that the bake installed:

```bash
sudo goto2026-sync
```

This pulls the latest version of the repo and re-applies shell configs, bin
scripts, and any other managed files. It's a lot faster than a full rebake
when you've only changed configuration.

**To re-run a single installation phase**, pass `--phase` with the phase name:

```bash
sudo bash dotfiles/bootstrap.sh --phase phase_toolchain
```

This bypasses that phase's stamp and forces it to rerun, even if it previously
completed. Useful when you've bumped a version pin (say, `OPENCLAW_VERSION` at
the top of the script) and want to reinstall just that one thing.

**To force every phase to rerun from scratch**:

```bash
sudo bash dotfiles/bootstrap.sh --force
```

This ignores all stamps. Equivalent to deleting `/var/lib/bake/` and re-running.
Takes the full 15-20 minutes.

---

## Advanced: Fleet deployment with a golden image

If you need to deploy the same environment to many servers quickly, say for a
classroom or workshop, you can bake a GCP custom image once and clone it N
times rather than running bootstrap.sh on every box. First boot still handles
the per-box config (hostname, API keys, tunnel token), so the image stays
generic.

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

# Back on your local machine: stop the VM and capture the image
gcloud compute instances stop goto-bake --zone us-central1-a
gcloud compute images create goto2026-golden-$(date +%Y%m%d) \
  --source-disk goto-bake \
  --source-disk-zone us-central1-a \
  --family goto2026-golden

# Clean up the bake VM
gcloud compute instances delete goto-bake --zone us-central1-a
```

**The VM must be stopped before imaging, not just shut down from inside.**
`gcloud compute instances stop` issues a hard stop through the hypervisor.
Running `shutdown -h now` from inside the VM is not enough.

**The `--family` flag means clone.sh always picks the newest image automatically.**
You don't need to update any clone scripts when you rebake. Just create the new
image with the same `--family goto2026-golden` and it becomes the new default.

### Clone boxes from the image

```bash
# Single box
bash infra/clone.sh <boxname>

# All 14 masterclass boxes in sequence
for box in pikachu abra ditto dragonite gengar jolteon lapras machamp meowth onix rapidash squirtle vaporeon vulpix; do
  bash infra/clone.sh "$box"
done
```

**Per-box secrets live in `instance-secrets.toml`.** This file is gitignored.
Copy `instance-secrets.toml.example` and fill in each box's Cloudflare tunnel
token, ElevenLabs voice ID, and OpenClaw API key before running `clone.sh`.
Without this file, clone.sh has nothing to inject via cloud-init.

Each cloned box self-configures on first boot from the cloud-init metadata that
`clone.sh` injects. It sets the hostname, writes API keys to `/etc/openclaw/`,
starts the cloudflared tunnel, and brings up the SonarQube stack. First boot
takes about two minutes. You can SSH in once the VM is running and watch
`journalctl -f` to see it happen in real time.

See `.claude/skills/infra/SKILL.md` for the full fleet operations reference,
including how to debug stuck boxes, push updates across the fleet, and read
phase stamp state.
