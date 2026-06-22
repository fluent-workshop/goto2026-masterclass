# Loop 017 — Student-Experience Pass

**Outcome:** ✅ All three items done. `bash -n` clean on the only modified shell
script (`bootstrap.sh`), `zsh -n` clean on the new `zshrc`, both TOML files parse,
both READMEs render. Committed + pushed. **No fleet provisioned.**

---

## 1. READMEs

- **`dotfiles/README.md`** — layout table; the bake-time-vs-first-boot split and
  _why_ (secrets must never live in a copyable image); the `TUNNEL_SALT` / `hash8`
  hostname scheme and why it avoids wildcard certs / CT-log exposure; how to adapt
  the setup for a personal OpenClaw box; pointer to `infra/README.md`.
- **`infra/README.md`** — the end-to-end golden-image → cloud-init → fleet model
  (with an ASCII diagram); `clone.sh` render-vs-`--provision`; why Terraform owns
  only the `goto-test` bake box and not the fleet; the per-box
  `instance-secrets.toml` model (and why per-box tunnels); a recipe to replicate
  the whole thing for someone else's multi-box deployment.

## 2. `dotfiles/mise.toml`

- New `dotfiles/mise.toml` pins the per-user toolchain in one readable place:
  `node = 22.23.0` (was the inline pin), `bun = 1.2.23`, `eza = 0.23.4`,
  `starship = 1.24.2`.
- `bootstrap.sh phase_toolchain` now installs that file to
  `~/.config/mise/config.toml` and runs `mise install` + `mise reshim` instead of
  the old piecemeal `mise use -g node@…`. The post-install assert reads the
  expected Node version **back out of `mise.toml`** (single source of truth), so
  the two can't drift.
- Removed the top-level `NODE_VERSION` pin from `bootstrap.sh` (now lives in
  `mise.toml`); added `bun` to the `/usr/local/bin` shim symlinks (so it resolves
  in non-login/systemd contexts); added a preflight check that `mise.toml` +
  `starship.toml` exist.

## 3. Niceties adopted from `~/src/divideby0/dotfiles`

Kept **focused on a coding class** — deliberately skipped Cedric's
kubectl/helm/k9s/docker/gcloud completions and the 60-tool mise config.

**`dotfiles/shell/zshrc`:**

- History dedup (`HIST_IGNORE_SPACE`, `HIST_IGNORE_DUPS`, `HIST_FIND_NO_DUPS`,
  `SHARE_HISTORY`) — was already present; confirmed/kept.
- Functions: `mkcd()` (mkdir + cd) and `kill-port()` (lsof + kill, aliased `kp`).
- `eza` aliases (`ls`/`ll`/`la`/`lt`) guarded behind `command -v eza`, with a
  plain-`ls` fallback.
- Lazy completions for **`gh`** and **`bun`** only (generate on first tab, cached)
  — the focused subset students actually use.
- Prompt: `eval "$(starship init zsh)"` with a hostname-forward fallback if
  starship is missing.

**`dotfiles/starship.toml`** (new): a minimal, friendly two-line prompt — box
hostname (so you always know which Pokémon box you're on), directory, git
branch/status, and Node version, then a clean `❯`. Intentionally simpler than
Cedric's powerline config (no k8s/docker/gcloud/time modules).

**PATH dedup** (`typeset -U`): already handled in `dotfiles/shell/zshenv`
(`typeset -U path`), so not duplicated in `zshrc`.

Installed by the bake to `~/.config/starship.toml` for the agent user.

## Verification

```
bash -n     dotfiles/bootstrap.sh           → OK
shellcheck  dotfiles/bootstrap.sh           → CLEAN
zsh -n      dotfiles/shell/zshrc            → OK
tomllib     dotfiles/mise.toml, starship.toml → valid
node pin    sed-extract from mise.toml      → 22.23.0 (assert wired)
prettier    dotfiles/README.md, infra/README.md → formatted
```

## Notes

- The cloudflare automation scripts exist in two places
  (`.claude/skills/cloudflare/scripts/` — canonical, edited in loop-016 — and
  older copies under `infra/scripts/`). Reconciling/removing the duplicates is out
  of scope here but worth a future cleanup loop.
- No `.sh` other than `bootstrap.sh` was modified; `zshrc`/`zshenv` are zsh
  configs (validated with `zsh -n`), and `mise.toml`/`starship.toml` are TOML.
