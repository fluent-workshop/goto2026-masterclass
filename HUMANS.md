# HUMANS.md — Operator Guide

Step-by-step playbook for building and managing the GOTO 2026 masterclass fleet.
For the AI agent playbook, see `AGENTS.md` and `.claude/skills/infra/SKILL.md`.

---

## Prerequisites

1. **gcloud CLI** authenticated and project set:
   ```bash
   gcloud auth login
   gcloud config set project goto2026-masterclass-500200
   ```
2. **Repo cloned locally:**
   ```bash
   git clone git@github.com:fluent-workshop/goto2026-masterclass.git
   cd goto2026-masterclass
   ```
3. **Cloudflare credentials** available (API token in env or credentials file):
   ```bash
   export CLOUDFLARE_API_TOKEN=$(cat ~/.openclaw/credentials/cloudflare-api-key)
   ```

---

## Part 1 — Bake the Golden Image

The golden image is built once and cloned for every student box. All heavy
installation happens here so first-boot stays fast. Re-baking is only needed
when you want to pin new tool versions or add phases.

### Step 1 — Create a bake VM

```bash
gcloud compute instances create goto-test \
  --zone us-central1-a \
  --machine-type n2-standard-8 \
  --image-family ubuntu-2204-lts \
  --image-project ubuntu-os-cloud \
  --boot-disk-size 50GB
```

### Step 2 — SSH in

```bash
gcloud compute ssh goto-test --zone us-central1-a
```

### Step 3 — Clone the repo on the VM

```bash
git clone https://github.com/fluent-workshop/goto2026-masterclass.git
```

### Step 4 — Run the bake

```bash
cd goto2026-masterclass
sudo bash dotfiles/bootstrap.sh
```

The script is idempotent. Completed phases are stamped under `/var/lib/bake/`
so re-running after a failure resumes from where it stopped.

### Step 5 — Wait for completion

Takes **~15–20 minutes** on a cold VM. Watch for:

```
==> Bake complete.
```

If a phase fails, fix the issue and re-run — only the failed phase reruns.

### Step 6 — Stop the VM

```bash
gcloud compute instances stop goto-test --zone us-central1-a
```

The VM must be stopped (not just shut down from inside) before imaging.

### Step 7 — Create the golden image

```bash
gcloud compute images create goto2026-golden-$(date +%Y%m%d) \
  --source-disk goto-test \
  --source-disk-zone us-central1-a \
  --family goto2026-golden
```

The `--family goto2026-golden` flag means `clone.sh` always picks the newest
image in the family automatically — you don't need to update clone scripts.

### Step 8 — (Optional) Delete the bake VM

```bash
gcloud compute instances delete goto-test --zone us-central1-a
```

---

## Part 2 — Provision Student Boxes

### Set up per-box secrets

Copy the example file and fill in all values:

```bash
cp instance-secrets.toml.example instance-secrets.toml
# edit instance-secrets.toml — this file is gitignored
```

Each box entry needs: Cloudflare tunnel token, ElevenLabs API key, OpenClaw
API key, and any other per-student credentials. See the `[pikachu]` example
block in the `.example` file.

### Clone a single box

```bash
bash infra/clone.sh <boxname>
```

Available box names: `pikachu` (instructor), `abra`, `ditto`, `dragonite`,
`gengar`, `jolteon`, `lapras`, `machamp`, `meowth`, `onix`, `rapidash`,
`squirtle`, `vaporeon`, `vulpix`.

### Clone all 14 boxes

```bash
for box in pikachu abra ditto dragonite gengar jolteon lapras machamp meowth onix rapidash squirtle vaporeon vulpix; do
  bash infra/clone.sh "$box"
done
```

`clone.sh` creates the GCP VM from the golden image and injects cloud-init
metadata. Each box self-configures on first boot (sets hostname, API keys,
starts services). First boot takes ~2 minutes.

---

## Part 3 — Verify a Box

SSH in and confirm the toolchain and services:

```bash
# SSH
ssh ubuntu@<IP>

# Check tools
openclaw --version
node -v
bun --version
supabase --version
gh --version

# Check services
systemctl status openclaw-tunnel
systemctl status openclaw-services
systemctl status openclaw-desktop-vnc

# Hit the noVNC desktop URL (from your browser)
# https://<box>-gt26-desktop-<hash8>.fluentworkshop.dev
```

If services are not running, check logs:

```bash
journalctl -u openclaw-tunnel -n 50
journalctl -u openclaw-services -n 50
```

---

## Part 4 — Iterating Without a Full Rebake

### Update dotfiles/configs on live boxes

A sync helper (`goto2026-sync`) is installed on each box. Run it to pull the
latest dotfiles and re-apply configs without a full rebake:

```bash
ssh ubuntu@<IP> sudo goto2026-sync
```

Or loop over all boxes:

```bash
for IP in <ip1> <ip2> ...; do
  ssh ubuntu@$IP sudo goto2026-sync &
done
wait
```

### Re-run a single phase

Re-run one named phase (ignores its stamp, reruns that phase only):

```bash
sudo bash dotfiles/bootstrap.sh --phase phase_toolchain
```

### Force all phases

Ignore all stamps and rerun every phase from scratch:

```bash
sudo bash dotfiles/bootstrap.sh --force
```

---

## Phase Reference

| Phase | What it installs | Key pinned versions | Approx. time |
|---|---|---|---|
| `phase_base` | Base OS packages, `ubuntu` user, shell config | apt packages (pinned) | ~2 min |
| `phase_toolchain` | mise, Node, Bun, eza, starship, openclaw | See `dotfiles/mise.toml` + `OPENCLAW_VERSION`, `MISE_VERSION` | ~5 min |
| `phase_student_tools` | gh, gcloud, claude-code, codex, supabase CLI, semgrep | npm globals (pinned) | ~3 min |
| `phase_vscode` | VS Code CLI (code-server, browser-based IDE) | Latest stable at bake time | ~1 min |
| `phase_desktop` | Xfce4, TigerVNC, noVNC, nginx | System packages | ~4 min |
| `phase_whisper` | Local Whisper STT, tiny model baked in | tiny model | ~2 min |
| `phase_tunnel` | cloudflared binary (Cloudflare Tunnel connector) | Latest stable at bake time | ~1 min |
| `phase_docker` | Docker CE, docker compose, SonarQube compose stack | Docker CE stable | ~2 min |
| `phase_verify` | End-to-end bake verification (asserts all tools present) | — | ~1 min |

Phase stamp files live in `/var/lib/bake/`. A stamp means the phase completed
successfully on this VM.
