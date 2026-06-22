# Goal — loop-022-toolchain-secrets-pipeline

## Context

This loop wires the full per-box and fleet-wide secrets pipeline into clone.sh
+ cloud-init, expands the student toolchain in bootstrap.sh, and migrates the
instance roster to a richer TOML format. The output is a pikachu-ready cloud-init
that injects every key a student needs on first boot.

**Repo path:** `~/src/fluent-workshop/goto2026-masterclass` (moved from spantree/goto-2026-masterclass)
**Branch:** main (push directly)
**Key constraint:** bootstrap.sh phases are idempotent; all shell files must pass `bash -n`.

---

## F1 — instances.txt → instances.toml

Migrate `instances.txt` (bare hostname list) to `instances.toml` (TOML, git-tracked,
non-sensitive per-box metadata only — NO secrets, NO API keys).

**New format:**
```toml
# Canonical instance roster — GOTO 2026 masterclass
# Non-sensitive per-box config only. Secrets live in instance-secrets.toml (gitignored).

[pikachu]
elevenlabs_voice_id = "BZgkqPqms7Kj9ulSkVzn"
role = "instructor"

[abra]
elevenlabs_voice_id = "dn9HtxgDwCH96MVX9iAO"
role = "student"

[ditto]
elevenlabs_voice_id = "c6SfcYrb2t09NHXiT80T"
role = "student"

# ... (all 14 boxes — voice IDs in references/voice-ids.md)
```

Voice IDs per box (from instance-secrets.toml — move them here, they're not sensitive):
- pikachu: BZgkqPqms7Kj9ulSkVzn
- abra: dn9HtxgDwCH96MVX9iAO
- ditto: c6SfcYrb2t09NHXiT80T
- dragonite: rSZFtT0J8GtnLqoDoFAp
- gengar: 7WggD3IoWTIPT19PNyrW
- jolteon: vBKc2FfBKJfcZNyEt1n6
- lapras: XcXEQzuLXRU9RcfWzEJt
- machamp: gs0tAILXbY5DNrJrsM6F
- meowth: uYXf8XasLslADfZ2MB4u
- onix: ESNrF6xSj96uiykXXT1f
- rapidash: rzgrf9VyEb0LLa824k8Q
- squirtle: 7QN34D2r3hCNwbOYIeK0
- vaporeon: DODLEQrClDo8wCz460ld
- vulpix: MClEFoImJXBTgLwdLI5n

**Changes required:**
- Create `instances.toml` with the above data
- Update `clone.sh` to read hostnames from `instances.toml` (using
  `infra/scripts/toml-get.ts` or a new `list-instances.ts` helper that emits
  the hostname list) and read `elevenlabs_voice_id` per-box from `instances.toml`
- Remove `ELEVENLABS_VOICE_ID` from `instance-secrets.toml` sections (it's not sensitive)
- Keep `instances.txt` for backward compat in a deprecation comment, or just delete it
  once clone.sh is updated

---

## F2 — Fleet-wide secrets pipeline

Six new keys live in `.envrc.local` under `# Shared Keys`. Clone.sh must read them
from the environment (same pattern as `TUNNEL_SALT`) and write them into the
rendered cloud-init.

**Fleet-wide keys (all come from env vars):**
```
OPENAI_API_KEY           → student shell env
ELEVENLABS_API_KEY       → student shell env (pairs with per-box ELEVENLABS_VOICE_ID)
EXA_API_KEY              → student shell env
FIRECRAWL_API_KEY        → student shell env
CODERABBIT_API_KEY       → student shell env
VSCODE_TUNNEL_GITHUB_TOKEN → used in firstboot for `code tunnel user login` (see F4)
```

**Cloud-init change:** Add a new `write_files` entry:
```yaml
- path: /etc/openclaw/student-keys.env
  owner: root:root
  permissions: '0640'
  content: |
    OPENAI_API_KEY="{{OPENAI_API_KEY}}"
    ELEVENLABS_API_KEY="{{ELEVENLABS_API_KEY}}"
    ELEVENLABS_VOICE_ID="{{ELEVENLABS_VOICE_ID}}"
    EXA_API_KEY="{{EXA_API_KEY}}"
    FIRECRAWL_API_KEY="{{FIRECRAWL_API_KEY}}"
    CODERABBIT_API_KEY="{{CODERABBIT_API_KEY}}"
```
(VSCODE_TUNNEL_GITHUB_TOKEN is NOT in student-keys.env — consumed by firstboot only, not exposed to student shell)

**Shell sourcing:** Update `dotfiles/shell/zshenv` to source `/etc/openclaw/student-keys.env` if it exists:
```bash
[[ -f /etc/openclaw/student-keys.env ]] && source /etc/openclaw/student-keys.env
```

**clone.sh changes:**
- Add validation for each fleet-wide key (fail loudly if unset and ALLOW_STUB!=1)
- Add stub fallbacks for dev/test (like TUNNEL_SALT)
- Add render substitution for all 6 placeholders + ELEVENLABS_VOICE_ID (per-box, from F1)

---

## F3 — ANTHROPIC_API_KEY per-box wiring (replace OPENCLAW_API_KEY_SOURCE)

Currently clone.sh has a `OPENCLAW_API_KEY_SOURCE=stub|env|op` abstraction. Replace
this: `ANTHROPIC_API_KEY` is now read per-box from `instance-secrets.toml` (using
`toml-get.ts`), exactly like `CLOUDFLARED_TOKEN`. It flows into the existing
`/home/ubuntu/.openclaw/credentials/api-key` write_files entry (b64-encoded).

**Rationale:** Every box will eventually have its own Anthropic key for billing
isolation. The OPENCLAW_API_KEY_SOURCE abstraction was a placeholder; per-box
instance-secrets.toml is the final model.

**Changes:**
- Remove `OPENCLAW_API_KEY_SOURCE` / `fetch_api_key()` from clone.sh
- Add `fetch_instance_secret` call for `ANTHROPIC_API_KEY` per host (same pattern as CLOUDFLARED_TOKEN)
- Update validate-secrets.ts to validate ANTHROPIC_API_KEY (Anthropic key regex: `sk-ant-...`)
- Update the stub: emit `REPLACE_ME__anthropic_api_key_for_{{HOSTNAME}}` when ALLOW_STUB=1
- Update clone.sh docs/comments

---

## F4 — VS Code Remote Tunnel setup

Students access VS Code via `https://vscode.dev/tunnel/{{HOSTNAME}}` — GitHub secures
the link, no port needed. Boxes pre-authenticate with a shared GitHub PAT so the
tunnel is live before class starts.

**bootstrap.sh changes (new `phase_vscode` function):**
```bash
# Install VS Code CLI via Microsoft apt repo
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor \
  > /etc/apt/trusted.gpg.d/microsoft.gpg
echo "deb [arch=amd64] https://packages.microsoft.com/repos/code stable main" \
  > /etc/apt/sources.list.d/vscode.list
apt-get update -qq
apt-get install -y -qq code
```

**New systemd unit `dotfiles/vscode/openclaw-code-tunnel.service`:**
```ini
[Unit]
Description=VS Code Remote Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/bin/code tunnel --accept-server-license-terms --name %H
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**cloud-init runcmd additions** (after pull-at-boot, before doctor):
```yaml
- sudo -u ubuntu code tunnel user login --provider github --access-token "{{VSCODE_TUNNEL_GITHUB_TOKEN}}" || true
- systemctl enable openclaw-code-tunnel.service || true
- systemctl start openclaw-code-tunnel.service || true
```

**bootstrap.sh phase_vscode:** install code CLI + install + enable the unit (disabled
at bake since the token isn't baked in; cloud-init runcmd enables it per-box).

---

## F5 — bootstrap.sh toolchain expansion

Add a new `phase_student_tools` function (or extend existing phases) with:

### apt packages (add to phase_base or a new phase):
```
tree htop git-lfs ffmpeg libimage-exiftool-perl ack fzf bat fd-find
gh              # GitHub CLI (official MS/GitHub apt repo)
chromium-browser
```

Note: `ripgrep` and `jq` already in phase_base. `git-delta` via cargo or direct
binary (not in apt on Ubuntu 22.04 — install from GitHub releases or skip).

### gcloud SDK (new phase_gcloud or section in phase_base):
```bash
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | gpg --dearmor > /etc/apt/trusted.gpg.d/cloud.google.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/cloud.google.gpg] \
  https://packages.cloud.google.com/apt cloud-sdk main" \
  > /etc/apt/sources.list.d/google-cloud-sdk.list
apt-get update -qq
apt-get install -y -qq google-cloud-cli
```

### dotfiles/mise.toml additions (pinned versions):
```toml
python    = "3.13.3"
uv        = "0.7.0"     # check latest stable at time of bake
just      = "1.46.0"
go        = "1.23.3"
rust      = "latest"
pnpm      = "9.12.3"
yt-dlp    = "2026.06.09"
```

(Look up current stable for uv — Cedric's config has 0.5.1 but that's from late 2024;
use latest stable at time of writing.)

### npm globals (after mise install, as AGENT_USER):
```bash
as_agent npm install -g @anthropic-ai/claude-code @openai/codex supabase
```

### semgrep via uv (after uv is available from mise):
```bash
as_agent uv tool install semgrep
```

**Order matters:** mise install must complete before npm globals (needs node) and
before semgrep (needs uv from mise).

---

## F6 — goto2026-sync: add `mise install`

Currently `goto2026-sync` copies `mise.toml` but never runs `mise install`, so new
tools added to the config don't actually land until the student manually runs it.

**Change:** After updating `~/.config/mise/config.toml`, add:
```bash
log "Running mise install to apply toolchain changes…"
apply_as_agent mise install --yes 2>&1 | sed 's/^/  /' || true
```

This makes `goto2026-sync` (and therefore pull-at-boot) fully idempotent for
toolchain updates — push a new tool to `mise.toml`, run `goto2026-sync`, tool appears.

---

## Green Gate

All six checks must pass and appear in the report:

```bash
# G1 — bash -n clean on all modified shell files
bash -n dotfiles/bootstrap.sh dotfiles/bin/goto2026-sync dotfiles/firstboot/openclaw-firstboot.sh

# G2 — instances.toml parses and has all 14 hostnames
bun run infra/scripts/toml-get.ts instances.toml pikachu elevenlabs_voice_id
bun run infra/scripts/toml-get.ts instances.toml vulpix elevenlabs_voice_id

# G3 — pikachu cloud-init renders with all new placeholders substituted
ALLOW_STUB=1 TUNNEL_SECRETS_SOURCE=env TUNNEL_SALT=test123456789012 \
  OPENAI_API_KEY=sk-test ELEVENLABS_API_KEY=sk_test EXA_API_KEY=test \
  FIRECRAWL_API_KEY=fc-test CODERABBIT_API_KEY=cr-test \
  VSCODE_TUNNEL_GITHUB_TOKEN=ghp_test \
  bash infra/clone.sh pikachu &&
grep -q "student-keys.env" infra/cloud-init/generated/pikachu.cloud-init.yaml &&
grep -q "code tunnel user login" infra/cloud-init/generated/pikachu.cloud-init.yaml &&
echo "cloud-init render OK"

# G4 — no unresolved placeholders in rendered output
grep -E "\{\{[A-Z_]+\}\}" infra/cloud-init/generated/pikachu.cloud-init.yaml \
  && echo "FAIL: unresolved placeholders" || echo "No unresolved placeholders"

# G5 — mise.toml has all new tools
python3 -c "
import tomllib
d = tomllib.load(open('dotfiles/mise.toml','rb'))
required = ['python','uv','just','go','rust','pnpm','yt-dlp']
missing = [t for t in required if t not in d.get('tools',{})]
print('Missing:', missing) if missing else print('All mise tools present')
"

# G6 — goto2026-sync contains mise install step
grep -q "mise install" dotfiles/bin/goto2026-sync && echo "✅ mise install in sync" || echo "FAIL"
```

---

## Safety Rules

- Do NOT add secrets or API keys to any committed file. All secrets are in
  `.envrc.local` and `instance-secrets.toml` (both gitignored).
- Do NOT break the existing CLOUDFLARED_TOKEN / POSTGRES_APP_PASSWORD pipeline.
- Do NOT modify `infra/cloud-init/generated/` output — those are gitignored artifacts.
- Do NOT change the `instance-secrets.toml` format — only ADD the `[hostname]`
  blocks if needed for the stub, do not remove any existing keys.
- Keep bootstrap.sh phases idempotent (stamp file pattern already in use).
- Commit each F-item separately, referencing the F-number in the commit message.
