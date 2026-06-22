# Tool List — loop-022 F5

Full list of tools to add in the F5 bootstrap.sh expansion.

## Already present (do NOT add again)
- ripgrep (`rg`) — apt, in phase_base
- jq — apt, in phase_base
- curl, wget, unzip, git, zsh, tmux — apt, in phase_base
- build-essential, ca-certificates — apt, in phase_base
- node, bun, eza, starship — mise, in dotfiles/mise.toml
- Docker, docker-compose — phase_docker
- cloudflared — phase_tunnel (pinned deb)
- openclaw — npm global, phase_toolchain

## apt packages to add (phase_base or new phase_student_tools)

| Package | Ubuntu 22.04 name | Notes |
|---|---|---|
| tree | `tree` | directory tree viewer |
| htop | `htop` | interactive process viewer |
| git-lfs | `git-lfs` | large file storage (needs `git lfs install` after) |
| ffmpeg | `ffmpeg` | audio/video processing |
| exiftool | `libimage-exiftool-perl` | image/file metadata |
| ack | `ack` | text search (was `ack-grep` on older Ubuntu; just `ack` on 22.04) |
| fzf | `fzf` | fuzzy finder |
| bat | `bat` | syntax-highlighted cat (binary is `batcat` on Ubuntu; alias `bat=batcat`) |
| fd | `fd-find` | fast file finder (binary is `fdfind` on Ubuntu; alias `fd=fdfind`) |
| lsof | `lsof` | usually pre-installed; add anyway for explicitness |
| ssh-copy-id | part of `openssh-client` | usually pre-installed |
| chromium | `chromium-browser` | headless browser for playwright + Xfce desktop |

NOTE: `bat` is installed as `batcat` and `fd` as `fdfind` on Ubuntu 22.04 — add
shell aliases in dotfiles/shell/zshrc:
```bash
alias bat='batcat'
alias fd='fdfind'
```

## GitHub CLI (`gh`) — separate apt repo

```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list
apt-get update -qq
apt-get install -y -qq gh
```

## gcloud SDK — separate apt repo

```bash
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | gpg --dearmor > /etc/apt/trusted.gpg.d/cloud.google.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/cloud.google.gpg] \
  https://packages.cloud.google.com/apt cloud-sdk main" \
  > /etc/apt/sources.list.d/google-cloud-sdk.list
apt-get update -qq
apt-get install -y -qq google-cloud-cli
```

## VS Code CLI — separate apt repo (also needed for F4)

```bash
wget -qO- https://packages.microsoft.com/keys/microsoft.asc \
  | gpg --dearmor > /etc/apt/trusted.gpg.d/microsoft.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] \
  https://packages.microsoft.com/repos/code stable main" \
  > /etc/apt/sources.list.d/vscode.list
apt-get update -qq
apt-get install -y -qq code
```

## dotfiles/mise.toml additions (pinned)

```toml
python = "3.13.3"
uv     = "0.7.0"       # check: mise registry list uv | tail -1 for latest stable
just   = "1.46.0"
go     = "1.23.3"
rust   = "latest"
pnpm   = "9.12.3"
yt-dlp = "2026.06.09"
```

## npm globals (run as AGENT_USER after mise install)

```bash
npm install -g @anthropic-ai/claude-code @openai/codex supabase
```

Note: `npm` is available from the node mise install. Run these as ubuntu via
`as_agent npm install -g ...`.

## semgrep (via uv, after uv is installed from mise)

```bash
as_agent uv tool install semgrep
```

## git delta (enhanced git diff)

Not in apt on Ubuntu 22.04. Install from GitHub releases:
```bash
DELTA_VERSION="0.18.2"
curl -fLo /tmp/delta.deb \
  "https://github.com/dandavison/delta/releases/download/${DELTA_VERSION}/git-delta_${DELTA_VERSION}_amd64.deb"
dpkg -i /tmp/delta.deb
rm /tmp/delta.deb
```

Or skip if version pinning feels fragile — delta is a nice-to-have, not required.

## Shell aliases to add to dotfiles/shell/zshrc

```bash
# Ubuntu package binary name aliases
alias bat='batcat'    # bat installed as batcat
alias fd='fdfind'     # fd installed as fdfind
```

## Order of operations in bootstrap.sh

1. apt updates (add all new repo configs at once, then one apt-get update -qq)
2. apt install all new packages in one call
3. mise install (from updated mise.toml)
4. npm globals (needs node from mise)
5. uv tool install semgrep (needs uv from mise)
6. git lfs install --system (post-install hook for git-lfs)
