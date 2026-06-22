# Session Context — loop-022 Design Decisions

## Why instances.txt → instances.toml (F1)

`instances.txt` is a bare hostname list. As the fleet grows in metadata (voice IDs,
roles, eventually group assignments), a structured format pays off. `instances.toml`
carries non-sensitive per-box config in git (voice IDs, role) while `instance-secrets.toml`
(gitignored) keeps actual secrets. The ELEVENLABS_VOICE_ID values are not sensitive —
they're just ElevenLabs voice identifiers, not credentials — so they move to instances.toml.

The `toml-get.ts` helper already exists in `infra/scripts/` and handles TOML parsing
cleanly. Use it for reading from instances.toml too.

## Fleet-wide vs per-box key split (F2, F3)

Design decision from the orchestrator:

**Fleet-wide (all boxes share one value, sourced from `.envrc.local`):**
- OPENAI_API_KEY — one shared key for Codex CLI / OpenAI calls
- ELEVENLABS_API_KEY — one ElevenLabs account for all boxes
- EXA_API_KEY — one Exa search key
- FIRECRAWL_API_KEY — one Firecrawl key
- CODERABBIT_API_KEY — one CodeRabbit key
- VSCODE_TUNNEL_GITHUB_TOKEN — one GitHub PAT for tunnel pre-auth (all boxes auth
  as the same GitHub account; students sign into vscode.dev with those creds)

**Per-box (each box has its own value, sourced from `instance-secrets.toml`):**
- ANTHROPIC_API_KEY — each box gets its own key for billing isolation
- ELEVENLABS_VOICE_ID — each box has a different voice (already in instance-secrets.toml,
  moving to instances.toml since it's not sensitive)
- CLOUDFLARED_TOKEN — per-box Cloudflare tunnel token (existing)
- POSTGRES_APP_PASSWORD — per-box DB password (existing)

## VS Code Remote Tunnel approach (F4)

Students access VS Code via browser at `https://vscode.dev/tunnel/{hostname}`.
No port exposure, no nginx auth layer — GitHub OAuth secures the link.

Key design choices:
- Install `code` CLI (not full desktop VS Code) via Microsoft apt repo
- Pre-authenticate at cloud-init time using VSCODE_TUNNEL_GITHUB_TOKEN
  → run `code tunnel user login --provider github --access-token "{{VSCODE_TUNNEL_GITHUB_TOKEN}}"` in runcmd
  → run `systemctl enable + start openclaw-code-tunnel.service` in runcmd
- The systemd service runs `code tunnel --accept-server-license-terms --name {{HOSTNAME}}`
  as the ubuntu user, auto-restarts on failure
- Students sign into vscode.dev with the shared class GitHub account credentials
- Students can still configure their own git identity inside VS Code — tunnel auth
  and git auth are independent

VSCODE_TUNNEL_GITHUB_TOKEN is NOT exposed in student-keys.env (it's operational
infra, not a tool students use directly).

## Student shell environment (F2)

API keys land in `/etc/openclaw/student-keys.env` (root-written at cloud-init,
permissions 0640 so ubuntu can read). The ubuntu user's `.zshenv` sources it.

This keeps keys off the home dir in committed dotfiles while making them available
as env vars to all processes (shell, claude code, codex, skill scripts).

## Tool selection rationale (F5)

Cedric's explicit list: uv, python, just, ripgrep (already in apt), gcloud, rust,
go, npm (with node), pnpm, ack, jq (already in apt), tree, curl (already in apt),
wget (already in apt), lsof (already installed), ffmpeg, ssh-copy-id (in openssh-client),
exiftool, yt-dlp, supabase CLI, semgrep, htop, chromium, warp (deferred — Linux
support is niche), vscode (via remote tunnel approach above), claude code, codex CLI,
git-lfs.

Additional suggestions accepted by Cedric: gh (GitHub CLI), fzf, bat, fd, delta.

`code-server` is explicitly OUT OF SCOPE — VS Code Remote Tunnels replace it.

## goto2026-sync mise install gap (F6)

`goto2026-sync` currently copies mise.toml but never runs `mise install`, so new
tools added to the config require a manual `mise install` run on the box. Adding
`mise install --yes` after the config copy makes the sync fully self-contained —
push a new tool, run the sync, it appears.
