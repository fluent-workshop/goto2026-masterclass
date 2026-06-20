# Loop 002 Report — mise-based bootstrap + classroom shell

**Scope:** pure file editing + static checks. No Terraform, no cloud resources,
no SSH, no `hcloud`. `infra/terraform` and `infra/cloud-init` untouched.

## What changed

| File                    | Change                                                                                                                                                              | Why               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `dotfiles/bootstrap.sh` | Node install switched NodeSource → **mise** (per-user); shims wired into `/usr/local/bin`; openclaw install moved onto mise Node; apt list trimmed; verify hardened | PRD-001 D2 / FR-1 |
| `dotfiles/shell/zshenv` | New — minimal PATH/env for all shells                                                                                                                               | F3                |
| `dotfiles/shell/zshrc`  | New — stripped interactive classroom shell                                                                                                                          | F3                |

Cherry-picked from `~/src/divideby0/dotfiles` (Linux path only): the
`curl https://mise.run | sh` + `mise use -g` pattern from `scripts/install-mise.sh`,
the apt subset from `packages/apt.txt`, and a **stripped** fork of `shell/zshrc` +
`shell/zshenv`. Deliberately NOT lifted: his full `mise/config.toml` tool list
(40+ tools), the kubernetes/cloud apt loadout, oh-my-zsh + starship + lazy
completion machinery, personal aliases/identity, and a hard-coded `GEMINI_API_KEY`
present in his personal `zshrc` (never copied).

## mise + shim approach chosen, and why

**mise is installed per-user for the agent user (`ubuntu`)**, landing in
`/home/ubuntu/.local`. It is a per-user tool manager; installing it as root would
put the toolchain in `/root` where the agent (which runs as `ubuntu`, per D3) can't
use it. A helper `as_agent()` runs each build step via
`sudo -u ubuntu env HOME=/home/ubuntu PATH=<shims>:... <cmd>` so installs land in
the agent's tree with a clean, deterministic environment.

Sequence (each step idempotent):

1. Install mise if `~/.local/bin/mise` is absent.
2. `mise use -g node@22` → installs Node 22.x, writes the global pin, creates
   `node`/`npm`/`npx` shims. Followed by `mise reshim`.
3. `npm install -g openclaw@2026.6.5` via the mise npm (guarded on the pinned
   version), then `mise reshim` so an `openclaw` shim is generated alongside Node.
4. Symlink the shims into `/usr/local/bin`:
   `ln -sf ~ubuntu/.local/bin/mise /usr/local/bin/mise` and, for
   `node npm npx openclaw`, `ln -sf ~ubuntu/.local/share/mise/shims/<t> /usr/local/bin/<t>`.

**Chosen: option 1 (symlink the specific shims), not a wrapper.** The mise shims
_are_ the mise binary invoked by basename; symlinking them needs no extra script
to read, keeps the path attendees inspect short, and `ln -sf` is naturally
idempotent.

## Non-login resolution strategy (why the acceptance test passes)

Acceptance gate (run on the baked box — cannot run in this sandbox, no Hetzner box):

```sh
sudo -u ubuntu env -i /bin/sh -c 'openclaw --version'   # → 2026.6.5
```

Why it resolves with a fully stripped environment:

1. **PATH** — `env -i` clears the environment, then `/bin/sh` (dash on Ubuntu)
   sets its compiled-in default PATH, which includes `/usr/local/bin`. Our
   `openclaw` symlink lives there, so the bare `openclaw` lookup finds it without
   any profile being sourced. `/usr/local/bin` is the deliberate target precisely
   because it is the first writable "local" dir on that default PATH.
2. **HOME** — `env -i` leaves `$HOME` unset. The symlink resolves to the mise
   binary, and mise locates the agent user's install tree from the **uid's passwd
   entry** (getpwuid fallback when `$HOME` is empty), so it still finds
   `/home/ubuntu/.local/share/mise`. Invoked by basename `openclaw`, mise execs
   the pinned-Node openclaw bin.

The same wiring covers a systemd unit or `ssh host openclaw --version` with no
TTY: none of them source `zshrc`/`mise activate`, but all hit `/usr/local/bin`.
For interactive shells, `zshenv` additionally front-loads the shims onto PATH and
`zshrc` runs `mise activate zsh`.

The bake script runs this exact `env -i` check as its final verify step under
`set -e`, so a mis-wired shim fails the bake loudly rather than silently in class.

## Idempotence

Re-running the script changes nothing and errors nowhere:

- apt update/install: idempotent by design.
- user block: `id` guard; `chsh` re-run is a no-op.
- mise install: guarded on `-x ~/.local/bin/mise`.
- `mise use -g` / `reshim`: idempotent.
- openclaw: guarded on the installed version string.
- `ln -sf`, `install -m`: overwrite-in-place, idempotent.
- verify: read-only.

## Static validation (run in sandbox)

- `bash -n dotfiles/bootstrap.sh` → **pass**.
- `shellcheck dotfiles/bootstrap.sh` (v0.11.0, installed via brew) → **clean, zero warnings**.
- `zsh -n dotfiles/shell/zshrc` and `zsh -n dotfiles/shell/zshenv` → **pass**.
- `grep` for NodeSource/secret patterns → only explanatory comments; no real
  references, no key material.

## Human verification on the real box (post-bake)

```sh
# 1. Canonical non-login resolution (the acceptance gate)
sudo -u ubuntu env -i /bin/sh -c 'openclaw --version'      # → 2026.6.5

# 2. Toolchain present for the agent user
sudo -u ubuntu node -v                                     # → v22.x
which -a openclaw node                                     # /usr/local/bin/...

# 3. Idempotence: re-run the bake, expect no errors / no changes
bash dotfiles/bootstrap.sh

# 4. No NodeSource left
! command -v node | grep -q nodesource ; grep -ri nodesource /etc/apt || echo clean
```

## Notes / flagged assumptions

- **dash default PATH includes `/usr/local/bin`** on Ubuntu 24.04 — this is what
  makes the `env -i /bin/sh` test resolve. Confirmed by static reasoning; the
  embedded verify step in the bake is the live proof on the real box.
- **mise resolves the install tree without `$HOME`** via the uid passwd fallback.
  If a future mise release drops that fallback, set `HOME=/home/ubuntu` in the
  launcher (systemd `Environment=`) — but the current acceptance test relies on
  the fallback by design.
- Verify runs **as the agent user**, not root: the `/usr/local/bin` symlinks point
  at `ubuntu`'s mise tree, so `root` invoking them would resolve `/root` and find
  nothing. The agent runs as `ubuntu` (D3), so this matches real usage.

## Stopping point

Stopped after F5 + report, per spec. No apply / bake / snapshot — those are
human-gated later loops.
