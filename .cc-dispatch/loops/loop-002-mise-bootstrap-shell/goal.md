# Loop 002 — Bake recipe: mise-based bootstrap + classroom shell profile

## Context

This is the GOTO 2026 masterclass exercise environment: 14 named student VPS
instances on Hetzner, each running a pre-baked OpenClaw agent. Model is
**bake once, clone 14** (see `docs/prd/PRD-001-student-exercise-infra.md` — read it).

Loop-001 produced the Terraform skeleton for a single bake-test box (plan-clean,
apply is human-gated on `HCLOUD_TOKEN`). **This loop does NOT touch Terraform and
does NOT create any cloud resources.** It hardens the thing that runs *inside* the
box: `dotfiles/bootstrap.sh` (the golden-image bake) and the classroom shell layer.

The current `dotfiles/bootstrap.sh` installs Node via **NodeSource**. PRD-001 D2
says use **mise** instead, for consistency with Cedric's real dotfiles, with shims
wired into `/usr/local/bin` so non-interactive / systemd launchers resolve
`node`/`openclaw` without `mise activate`. That conversion is the heart of this loop.

## Reference material (read before writing — do NOT copy wholesale)

Cedric's dotfiles live at `~/src/divideby0/dotfiles`. Cherry-pick the *Ubuntu/Linux*
path only; this is a stripped **classroom** profile, NOT his full personal loadout.

- `~/src/divideby0/dotfiles/scripts/install-mise.sh` — how he installs mise on Linux:
  `curl https://mise.run | sh`, then `eval "$(mise activate bash --shims)"`, then
  `mise use -g <tool>@<version>`. **Lift the install + shim pattern.** Do NOT lift the
  giant tool-versions list — classroom only needs Node 22 (+ maybe `eza`/`starship`
  if cheap; skip anything heavy).
- `~/src/divideby0/dotfiles/mise/config.toml` — note `experimental = true` (shims),
  `auto_install` and `trusted_config_paths`. A trimmed config like this is fine.
- `~/src/divideby0/dotfiles/packages/apt.txt` — his apt list. Classroom keeps a
  SMALL subset (zsh, git, tmux, jq, ripgrep, curl, unzip, build-essential, ca-certs).
  Do NOT install his full kubernetes/cloud toolchain.
- `~/src/divideby0/dotfiles/shell/zshrc` + `shell/zshenv` — his personal zsh. **Fork a
  stripped version** into `dotfiles/shell/` in THIS repo. Strip: personal prompt
  identity, private aliases, anything that reads secrets or assumes his machine.
  Keep: sane PATH (incl. mise shims + `/usr/local/bin`), history defaults, a clean
  prompt, `mise activate` for interactive shells.

## Layer boundaries (do not cross)

- This loop owns ONLY what's inside the image: `dotfiles/bootstrap.sh` and
  `dotfiles/shell/`. Do NOT modify `infra/terraform/` or `infra/cloud-init/`.
- No config-management tool in the image (no Ansible). Plain bash + files only —
  attendees must be able to read it.
- The bake script stays **idempotent**: safe to re-run on the same box while
  iterating. Every install step guards on "already present".

## Phases

### F1 — Convert Node install to mise (bootstrap.sh)
Replace the NodeSource block (section "3. Node via NodeSource") with a mise-based
install that:
- Installs mise if absent (`curl https://mise.run | sh`), for the **agent user**
  (`ubuntu`), not root — mise is per-user. Use `sudo -u "$AGENT_USER"` or run the
  user-context steps appropriately. Be deliberate about WHOSE `$HOME` mise lands in.
- `mise use -g node@22` (pin major 22, matching the existing `NODE_VERSION` default).
- Wires shims into `/usr/local/bin` so a non-interactive, non-login process (systemd
  service, `ssh host openclaw --version` with no TTY) resolves `node`, `npm`,
  `openclaw`. Two acceptable approaches — pick one and document why:
  1. Symlink the specific shims: `ln -sf /home/$AGENT_USER/.local/bin/mise /usr/local/bin/mise` plus the node/npm/npx shims, OR
  2. A tiny wrapper in `/usr/local/bin` that execs the mise shim.
  The acceptance test is the non-login resolution check below — make THAT pass.
- Keep `NODE_VERSION` overridable via env, as today.

### F2 — Install openclaw via the mise-managed Node
`npm install -g openclaw@${OPENCLAW_VERSION}` must use the mise Node, and the
resulting `openclaw` binary must resolve from `/usr/local/bin` (or be shimmed there)
for non-interactive use. Pinned version stays `2026.6.5`.

### F3 — Classroom shell profile (dotfiles/shell/)
Create `dotfiles/shell/zshrc` and `dotfiles/shell/zshenv` (forked + stripped from
Cedric's). The bootstrap already copies `shell/*` into the agent user's home if the
dir exists — so just populate it. Requirements:
- `zshenv`: PATH includes `/usr/local/bin`, `~/.local/bin`, and mise shims so even
  non-interactive shells resolve the toolchain.
- `zshrc`: interactive niceties — `mise activate zsh`, history config, a clean simple
  prompt (hostname-forward so "you are on Pikachu" is obvious), a couple safe aliases.
  NO personal identity, NO secret-reading, NO assumption of Cedric's machine.
- Keep it short and readable; attendees may open it.

### F4 — apt subset + idempotence pass
- Trim/confirm the apt install list to the small classroom subset (see reference).
- Re-read the whole script top-to-bottom for idempotence: every step must be safe to
  run twice. Fix any step that isn't.

### F5 — Static validation + report
- `shellcheck dotfiles/bootstrap.sh` (install via apt/brew if missing; if it cannot
  be installed, say so in the report and do a careful manual read instead). Fix all
  warnings that matter; document any intentionally-ignored ones.
- `bash -n dotfiles/bootstrap.sh` (syntax check) must pass.
- Write `report.md`: what changed, the exact mise+shim approach chosen and WHY, the
  non-login resolution strategy, and the verification commands a human will run on
  the real box.

## Acceptance criteria (green gate)

- `bash -n dotfiles/bootstrap.sh` passes; shellcheck clean (or documented).
- The script is idempotent — re-running changes nothing and errors nowhere.
- Node is installed via **mise** (no NodeSource), pinned to major 22.
- A **non-login, non-interactive** invocation resolves the toolchain. The canonical
  test (documented in report.md for the human to run on the baked box):
  `sudo -u ubuntu env -i /bin/sh -c 'openclaw --version'` → prints `2026.6.5`.
  (You cannot run this in the dispatch sandbox — there is no Hetzner box. Instead,
  prove the PATH/shim wiring by static inspection and explain in report.md exactly
  why the non-login lookup will succeed.)
- `dotfiles/shell/zshrc` + `zshenv` exist, stripped, readable, hostname-forward prompt.
- No secrets, no personal identity, no NodeSource references left in the script.
- `git diff --staged` clean of any token/key material.

## Safety rules

- **Create NO cloud resources.** No Terraform apply, no `hcloud` calls, no SSH to any
  server. This loop is pure file editing + static checks. There is no live box yet.
- **Do not commit secrets.** Nothing in this loop should even reference a real key.
- Conventional commits, scope `infra` (e.g.
  `refactor(infra): install node via mise with /usr/local/bin shims`,
  `feat(infra): classroom zsh profile`).
- If the mise-as-non-root detail gets ambiguous (whose HOME, which shim path), pick
  the approach that makes the non-login resolution test pass, document it in
  report.md, and flag the assumption rather than guessing silently.
- Stop after F5 + report. Do not proceed to apply/bake/snapshot — those are
  human-gated later loops.
