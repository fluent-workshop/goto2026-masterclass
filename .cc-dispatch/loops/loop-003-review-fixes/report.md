# Loop 003 Report — bake recipe hardening (loop-002 review fixes)

**Scope:** pure file editing + static checks. No Terraform, no cloud resources,
no SSH, no `hcloud`. `infra/terraform` and `infra/cloud-init` untouched.
**Source of fixes:** `.cc-dispatch/reviews/20260619-173741-fbdfed0-dirty/MERGED-REVIEW.md`
(no Critical; 5 Major + minors). All RS items landed.

## Versions pinned (all looked up live, none invented)

| Tool     | Pinned value     | How verified                                                                                               |
| -------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| mise     | `v2026.6.11`     | `github.com/jdx/mise/releases/latest` — current tag, released 2026-06-16.                                  |
| mise sha | `4c1036af…1a6c9` | `SHASUMS256.txt` of that release, line for `mise-v2026.6.11-linux-x64` (plain glibc x64 binary, not musl). |
| Node     | `22.23.0`        | `nodejs.org/dist/index.json` — latest 22.x LTS ("Jod"), released 2026-06-17.                               |
| openclaw | `2026.6.5`       | Unchanged from loop-002 (Cedric's known-good pin).                                                         |

The mise SHA256 is the linux-**x64 / glibc** binary, matching the x86 `cpx21`
Ubuntu 24.04 target. `MISE_VERSION` and `MISE_SHA256` are both env-overridable
but MUST move together — a mismatch fails `sha256sum -c` and aborts the bake.

## RS fix map

| RS# | Major | What changed                                                                                                                                                                                                  | File:line (new)                 |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| RS1 | MJ-1  | Replaced `curl https://mise.run \| sh` with a pinned GitHub release-binary download + `sha256sum -c` against an in-repo `MISE_SHA256` before `install`. No unverified live remote code in the bake. Per-user. | `bootstrap.sh:24,28`, `108-131` |
| RS2 | MJ-2  | `NODE_VERSION` default `22` → exact `22.23.0`; post-`mise use -g` assert that `node -v` == `v$NODE_VERSION`, else FATAL. Doubles as the agent-user node check.                                                | `bootstrap.sh:23`, `133-146`    |
| RS3 | MJ-3  | Closed the `curl\|bash` trap. Header now mandates a repo checkout; preflight FATALs if `$SCRIPT_DIR/shell` is absent (chosen option (a) — keeps `dotfiles/shell/` the single source of truth).                | `bootstrap.sh:6-16`, `54-59`    |
| RS4 | MJ-4  | openclaw guard now exact-matches the parsed token (`awk '{print $NF}'`) instead of substring — `2026.6.50` no longer false-matches `2026.6.5`.                                                                | `bootstrap.sh:153-159`          |
| RS5 | MN-1  | `env -i` acceptance gate extended from `openclaw` only to `node -v && npm -v && openclaw --version`, covering every wired shim. Redundant `as_agent node -v`/`npm -v` verify lines dropped (see note).        | `bootstrap.sh:195`              |
| RS6 | MN-2  | `compinit` → `compinit -i -d …` (skip insecure-dir prompt, no mid-class hang).                                                                                                                                | `shell/zshrc:19`                |
| RS6 | MJ-5  | sudoers fragment (create-branch only) written to a temp file, `visudo -cf` validated, then `install -m 0440 -o root -g root`. No more world-readable / unvalidated drop-in.                                   | `bootstrap.sh:93-104`           |
| RS7 | MN-3  | Preflight assert that `/usr/local/bin` is on dash's default PATH (`env -i /bin/sh`); FATAL otherwise — a re-bake on a different base fails loud instead of silently breaking non-login resolution.            | `bootstrap.sh:64-73`            |
| RS7 | MN-4  | `$HOME`-unset hardening documented (note below) + comment at the shim section that production launchers should set `HOME=/home/ubuntu`.                                                                       | `bootstrap.sh:162-177`          |

### Nits folded (one-liners only)

- **N-1** `log()` now emits plain text when stdout isn't a TTY (`[[ -t 1 ]]`) — no
  raw ANSI in captured bake logs.
- **N-3** Dropped the unused `install -d … ~/.config` (mise creates `~/.config/mise`
  itself).
- **N-4** `typeset -U PATH path` → `typeset -U path` ($path is tied to $PATH).
- N-2/N-5/N-6 wording/no-op nits: folded the imprecise PATH comment into the
  reworked section-6 comment; left `PROMPT_SUBST` (harmless). Skipped the rest to
  keep the diff scoped.

## Decisions & assumptions (flagged)

- **RS1 approach = preferred path, fully realized.** I downloaded and verified the
  real `SHASUMS256.txt` for `v2026.6.11`, so the committed `MISE_SHA256` is the
  authentic published hash — not a placeholder. The bake fetches the release
  **binary** from `github.com/jdx/mise/releases/download/...` and checksums it; the
  only residual trust is GitHub release hosting at bake time, and a tampered binary
  is caught by `sha256sum -c`. No `mise.run` dependency remains.
- **RS4 output-shape assumption.** The guard takes the **last whitespace token** of
  `openclaw --version`, which is correct whether the tool prints `2026.6.5` or a
  prefixed `openclaw 2026.6.5`. If a future openclaw appends a suffix (e.g.
  `2026.6.5 (build …)`), `$NF` would capture the suffix and the guard would
  reinstall every run (safe, just not a no-op) — revisit if that shape changes.
- **RS5 dedup decision.** Removed the standalone `as_agent node -v` / `npm -v`
  verify lines: node is already asserted exactly in §4, and npm is now covered by
  the extended `env -i` gate, which additionally proves resolution through the
  `/usr/local/bin` shims (the thing that actually matters). No dead duplication.
- **mise re-bake reconciliation (MN-5).** The install guard now compares the
  installed `mise version` against `${MISE_VERSION#v}`, so bumping the pin triggers
  a verified re-install instead of silently keeping the old binary.
- **MISE_VERSION reports as `2026.6.11`, tag is `v2026.6.11`.** The download URL
  uses the tag (leading `v`); the version comparison strips it (`${MISE_VERSION#v}`).

## Idempotence (unchanged guarantee, re-checked)

Re-running changes nothing and errors nowhere: apt (idempotent); user block (`id`
guard, sudoers `install` overwrites in place); mise (version-matched guard, skips if
already at pin); `mise use -g`/`reshim` (idempotent); node assert (read-only);
openclaw (exact-version guard); `ln -sf` / `install -m` (overwrite-in-place); gate
(read-only).

## Static validation (run in sandbox)

- `bash -n dotfiles/bootstrap.sh` → **pass**.
- `shellcheck dotfiles/bootstrap.sh` (v0.11.0) → **clean**. One `SC2016` suppressed
  inline with justification: `$PATH` in the dash-PATH assert is intentionally
  literal (it must expand inside the `env -i /bin/sh -c` subshell, not ours).
- `zsh -n dotfiles/shell/zshrc` and `zsh -n dotfiles/shell/zshenv` → **pass**.
- Secret / NodeSource scan → only explanatory comment words; no key material, no
  live NodeSource reference.

## Human verification on the real box (post-bake)

```sh
# 1. Canonical non-login resolution gate (now covers the whole toolchain)
sudo -u ubuntu env -i /bin/sh -c 'node -v && npm -v && openclaw --version'
#    → v22.23.0 / <npm> / 2026.6.5

# 2. Versions are the exact pins
sudo -u ubuntu ~ubuntu/.local/bin/mise version    # → 2026.6.11 ...
which -a openclaw node npm                         # /usr/local/bin/... (+ shims)

# 3. Idempotence: re-run the bake from the checkout, expect no changes/errors
bash dotfiles/bootstrap.sh

# 4. curl|bash trap is closed — piping now fails loud instead of baking blind
curl -fsSL <raw-url>/dotfiles/bootstrap.sh | bash   # → FATAL: '…/shell' not found

# 5. No NodeSource residue
grep -ri nodesource /etc/apt 2>/dev/null || echo clean
```

## Stopping point

Stopped after the green gate + report, per spec. No apply / bake / snapshot —
those are human-gated later loops.
