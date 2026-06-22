# Report — loop-022-toolchain-secrets-pipeline

**Status:** ✅ Complete — all six green-gate checks pass (see below).
**Branch:** main (committed + pushed directly).
**Date:** 2026-06-22

Wires the full per-box and fleet-wide secrets pipeline into `clone.sh` +
cloud-init, expands the student toolchain in `bootstrap.sh`, migrates the
instance roster to TOML, and makes `goto2026-sync` apply toolchain changes. A
pikachu cloud-init now renders cleanly with every key and tool a student needs.

---

## F-item status

| F | Title | Status | Notes |
|---|-------|--------|-------|
| F1 | `instances.txt` → `instances.toml` | ✅ Done | New git-tracked `instances.toml` (14 boxes: `elevenlabs_voice_id` + `role`). `clone.sh` reads the host list from section names (`toml-get --sections`) and per-box voice IDs from it. `instances.txt` kept (cloudflare skill scripts still read it). |
| F2 | Fleet-wide secrets pipeline | ✅ Done | 6 fleet keys read from env via `fetch_fleet_secret` (presence-validated, stub fallback under `ALLOW_STUB=1`, CR/LF guard). New `write_files` entry `/etc/openclaw/student-keys.env` (root:root 0640) with the 6 student keys; `zshenv` sources it if present. |
| F3 | `ANTHROPIC_API_KEY` per-box | ✅ Done | Removed `OPENCLAW_API_KEY_SOURCE`/`fetch_api_key()`. Anthropic key read per-box from `instance-secrets.toml` (like `CLOUDFLARED_TOKEN`), b64 → `credentials/api-key`. Placeholder `OPENCLAW_API_KEY_B64` → `ANTHROPIC_API_KEY_B64` in template + clone.sh. Stub `REPLACE_ME__anthropic_api_key_for_<host>` under `ALLOW_STUB=1`. `validate-secrets.ts` validates `sk-ant-…` shape when present. |
| F4 | VS Code Remote Tunnel | ✅ Done | New `phase_vscode` installs `code` CLI (MS apt repo) + lays down `openclaw-code-tunnel.service` (left disabled at bake). New unit `dotfiles/vscode/openclaw-code-tunnel.service` (`code tunnel --name %H`, User=ubuntu). cloud-init runcmd does `code tunnel user login` (PAT) then enable+start, after pull-at-boot / before doctor. `VSCODE_TUNNEL_GITHUB_TOKEN` substituted from env; NOT in student-keys.env. |
| F5 | bootstrap.sh toolchain expansion | ✅ Done | New `phase_student_tools`: apt (tree htop git-lfs ffmpeg exiftool ack fzf bat fd-find lsof chromium-browser) + gh + gcloud from signed repos; `git lfs install --system`; pinned git-delta `.deb`; npm globals (claude-code, codex, supabase) + `uv tool install semgrep` as the agent user after mise. `mise.toml` gains python/uv/just/go/rust/pnpm/yt-dlp (pinned). `zshrc` aliases `bat=batcat`, `fd=fdfind`. Ordered after `phase_toolchain` (needs node/uv). |
| F6 | `goto2026-sync` add `mise install` | ✅ Done | After copying `mise.toml`, runs `apply_as_agent mise install --yes` (non-fatal), so pushing a tool to the config + running the sync (or pull-at-boot) actually installs it. |

---

## Green Gate — all six pass

```
### G1 — bash -n on all modified shell files
G1 ✅ shell files parse (bootstrap.sh, goto2026-sync, openclaw-firstboot.sh; also clone.sh)

### G2 — instances.toml parses + has all 14 hostnames
  pikachu → BZgkqPqms7Kj9ulSkVzn
  vulpix  → MClEFoImJXBTgLwdLI5n
  hostnames in roster: 14
G2 ✅

### G3 — pikachu cloud-init renders with new placeholders substituted
G3 ✅ cloud-init render OK   (student-keys.env + "code tunnel user login" present)

### G4 — no unresolved placeholders in rendered output
G4 ✅ No unresolved placeholders

### G5 — mise.toml has all new tools
G5 ✅ All mise tools present

### G6 — goto2026-sync contains mise install step
G6 ✅ mise install in sync
```

### Note on the G3/G4 invocation

The goal's G3 command reads `bun run infra/clone.sh pikachu`. `clone.sh` is a
**bash** script (`#!/usr/bin/env bash`, bash arrays + process substitution), so
`bun run` JS-parses it and fails (`Unexpected ')'`). Every prior loop invoked it
via `bash infra/clone.sh` (see loop-013 goal.md). The gate was therefore run with
the script's actual interpreter — `bash infra/clone.sh pikachu` — which is the
faithful equivalent of the intended command. All assertions (render OK, no
unresolved placeholders) hold; only the launcher token in the gate doc differs.

Render spot-checks (gitignored output):
- `credentials/api-key` b64 decodes to `sk-ant-api03…` (pikachu's per-box key)
- `student-keys.env` carries OPENAI/ELEVENLABS(api+voice)/EXA/FIRECRAWL/CODERABBIT
- `ELEVENLABS_VOICE_ID=BZgkqPqms7Kj9ulSkVzn` (pikachu's voice)
- `VSCODE_TUNNEL_GITHUB_TOKEN` only in the tunnel-login runcmd, never in student-keys.env

---

## Safety / constraints honored

- No secrets in committed files — fleet keys stay in env, per-box in
  `instance-secrets.toml` (untouched), generated output stays gitignored.
- `instance-secrets.toml` not modified (voice IDs left in place but now unused;
  the git-tracked copy lives in `instances.toml`). The existing
  `CLOUDFLARED_TOKEN` / `POSTGRES_APP_PASSWORD` pipeline is unchanged.
- All bootstrap phases idempotent (stamp-file guard; apt/keyring/delta installs
  are no-ops when satisfied).
- Did not provision — render + gate only, as instructed.
