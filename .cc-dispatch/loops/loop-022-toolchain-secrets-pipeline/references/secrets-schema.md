# Secrets Schema — loop-022

No actual secrets are in this file. This documents the schema and data flow only.

## Sources

### `.envrc.local` (gitignored, orchestrator machine only)
```
CLOUDFLARE_API_TOKEN=...     # infra ops only — NOT injected into boxes
HETZNER_API_KEY=...          # legacy — NOT injected into boxes
TUNNEL_SALT=...              # fleet-wide, existing
OPENAI_API_KEY=...           # NEW fleet-wide
ELEVENLABS_API_KEY=...       # NEW fleet-wide
EXA_API_KEY=...              # NEW fleet-wide
FIRECRAWL_API_KEY=...        # NEW fleet-wide
CODERABBIT_API_KEY=...       # NEW fleet-wide
VSCODE_TUNNEL_GITHUB_TOKEN=... # NEW fleet-wide, firstboot only
```

### `instance-secrets.toml` (gitignored, per-box sections)
```toml
[pikachu]
CLOUDFLARED_TOKEN = "..."           # existing
POSTGRES_APP_PASSWORD = "..."       # existing
ANTHROPIC_API_KEY = "sk-ant-..."    # NEW per-box
# ELEVENLABS_VOICE_ID moved to instances.toml (not sensitive)
```
Only pikachu has ANTHROPIC_API_KEY populated yet. Other boxes will get theirs before
fleet provisioning. The ALLOW_STUB=1 path should emit a clearly fake placeholder.

## Destination on the box

### `/home/ubuntu/.openclaw/credentials/api-key` (existing slot, new source)
- Content: ANTHROPIC_API_KEY for this box (b64-encoded in cloud-init write_files)
- Owner: ubuntu:ubuntu, mode 0600
- Used by: OpenClaw gateway for LLM API calls

### `/etc/openclaw/student-keys.env` (NEW)
- Content: OPENAI_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, EXA_API_KEY,
           FIRECRAWL_API_KEY, CODERABBIT_API_KEY
- Owner: root:root, mode 0640 (ubuntu-readable)
- Sourced by: ubuntu's `.zshenv`
- Used by: Claude Code (ANTHROPIC_API_KEY is in credentials/api-key, but Claude Code
           also reads ANTHROPIC_API_KEY env var — consider adding it here too so
           `claude` CLI works out of the box without extra config)
- NOT in here: VSCODE_TUNNEL_GITHUB_TOKEN (operational infra, not student tooling)

### `/etc/openclaw/tunnel.env` (existing, no changes)
- TUNNEL_SALT, CLOUDFLARED_TOKEN, POSTGRES_APP_PASSWORD (unchanged)

## clone.sh rendering additions

New placeholders in template.yaml → new substitution calls in clone.sh render loop:

```
{{OPENAI_API_KEY}}              ← from env (fleet-wide)
{{ELEVENLABS_API_KEY}}          ← from env (fleet-wide)
{{ELEVENLABS_VOICE_ID}}         ← from instances.toml per-box (F1)
{{EXA_API_KEY}}                 ← from env (fleet-wide)
{{FIRECRAWL_API_KEY}}           ← from env (fleet-wide)
{{CODERABBIT_API_KEY}}          ← from env (fleet-wide)
{{VSCODE_TUNNEL_GITHUB_TOKEN}}  ← from env (fleet-wide)
{{ANTHROPIC_API_KEY_B64}}       ← from instance-secrets.toml per-box, b64-encoded
                                   (replaces {{OPENCLAW_API_KEY_B64}})
```

The existing `{{OPENCLAW_API_KEY_B64}}` placeholder should be RENAMED to
`{{ANTHROPIC_API_KEY_B64}}` in both template.yaml and clone.sh for clarity.

## Validation (add to validate-secrets.ts)

- ANTHROPIC_API_KEY: must match `^sk-ant-[a-zA-Z0-9_-]+$`
- OPENAI_API_KEY: must match `^sk-[a-zA-Z0-9_-]+$` (or `sk-proj-...`)
- ELEVENLABS_API_KEY: must match `^sk_[a-zA-Z0-9]+$`
- EXA_API_KEY: non-empty string
- FIRECRAWL_API_KEY: must start with `fc-`
- CODERABBIT_API_KEY: must start with `cr-`
- VSCODE_TUNNEL_GITHUB_TOKEN: must start with `ghp_` or `github_pat_`
- ELEVENLABS_VOICE_ID: non-empty alphanumeric string
