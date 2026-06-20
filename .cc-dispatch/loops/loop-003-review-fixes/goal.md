# Loop 003 — Bake recipe hardening (review fixes from loop-002)

## Context

This is the GOTO 2026 masterclass exercise environment: 14 named student VPS on
Hetzner, **bake once / clone 14** (see `docs/prd/PRD-001-student-exercise-infra.md`).

Loop-002 converted `dotfiles/bootstrap.sh` from NodeSource to **mise** and added a
stripped classroom zsh profile. A three-source blind review (Codex + Sonnet + a
fresh CC session) ran on that change. **No Critical, but 5 Majors** — all
reproducibility / supply-chain / one shell-config trap. This loop lands those fixes.

**Read the merged review first:**
`.cc-dispatch/reviews/20260619-173741-fbdfed0-dirty/MERGED-REVIEW.md`
It has every finding with file:line, the reviewer attribution, and the exact fix.
This goal.md is the prioritized subset to implement; the merged review is the
authority if anything here is ambiguous.

## Layer boundaries (unchanged from loop-002)

- This loop owns ONLY what's inside the image: `dotfiles/bootstrap.sh` and
  `dotfiles/shell/`. Do NOT modify `infra/terraform/` or `infra/cloud-init/`.
- No config-management tool in the image (no Ansible). Plain bash + files only.
- The bake script stays **idempotent**. Every step guards on "already present."
- **Create NO cloud resources.** No Terraform, no SSH, no `hcloud`. Pure file
  editing + static checks. There is still no live Hetzner box.

## Phases — the fixes (RS = review-sourced)

### RS1 — Pin + verify mise (MJ-1, all three reviewers; the headline fix)
`bootstrap.sh:69`. `curl -fsSL https://mise.run | sh` is unpinned in an image whose
own header says "Pin everything." It's also the one piece of unverified remote code
the bake trusts, run as `ubuntu` (which has passwordless sudo).
- Introduce `MISE_VERSION="${MISE_VERSION:-v2026.x.y}"` near the other pins at the
  top (alongside `OPENCLAW_VERSION` / `NODE_VERSION`). Use a real, current mise
  release tag — look one up; do NOT invent a version. If you cannot verify a real
  tag offline, leave a clearly-marked `# TODO: confirm latest mise release tag`
  placeholder and flag it in report.md rather than guessing a plausible-looking one.
- Preferred: download the release binary from GitHub
  (`https://github.com/jdx/mise/releases/download/${MISE_VERSION}/...`) and verify a
  committed `MISE_SHA256` with `sha256sum -c` before installing to `$MISE_BIN`.
- Acceptable fallback if pinning the raw binary is too fiddly: keep the installer
  script but pass `MISE_VERSION` into its environment so it fetches that exact tag,
  AND document in report.md that the installer script itself is still fetched live
  (residual, smaller risk).
- Keep it idempotent and keep mise installed as the **agent user** (per-user tool).

### RS2 — Pin exact Node patch version (MJ-2, all three)
`bootstrap.sh:18,73`. `NODE_VERSION=22` floats to latest-22.x at bake time.
- Change default to an exact semver, e.g. `NODE_VERSION="${NODE_VERSION:-22.x.y}"`
  (look up a real current 22.x LTS patch; same "don't invent" rule as RS1).
- Guard the install so a re-bake with the same pin is a no-op AND verify the result:
  after `mise use -g`, assert `as_agent node -v` equals `v$NODE_VERSION`; fail loud
  if not.

### RS3 — Fix the `curl | bash` shell-config trap (MJ-3, Sonnet — subtle, high-impact)
`bootstrap.sh:108-109`. The header documents `curl -fsSL …/bootstrap.sh | bash`.
Over a pipe, `${BASH_SOURCE[0]}` is empty → `SCRIPT_DIR` resolves to `pwd`, not the
repo → the `shell/` copy block is skipped → the box bakes with NO zshenv/zshrc
(no shims on interactive PATH, no hostname prompt, no compinit). Session-killer.
- Pick ONE: (a) drop the `curl|bash` example from the header and require a repo
  checkout (`git clone … && bash dotfiles/bootstrap.sh`), updating the usage comment
  accordingly; OR (b) make the script self-contained by embedding the zshrc/zshenv
  as heredocs so it works piped. (a) is simpler and keeps `dotfiles/shell/` as the
  single source of truth — prefer it unless you have a strong reason for (b).
- If you choose (a), also add a guard: if `SCRIPT_DIR/shell` is absent, FAIL loudly
  with a clear message ("run from a checkout, not a pipe") rather than silently
  baking a profile-less box.

### RS4 — Exact-match the openclaw version guard (MJ-4, Codex)
`bootstrap.sh:80-81`. `[[ "$current_oc" != *"$OPENCLAW_VERSION"* ]]` substring-matches,
so `2026.6.50` would false-match `2026.6.5` and skip a needed reinstall.
- Parse the version token and compare exactly, e.g.
  `current_oc="$(as_agent openclaw --version 2>/dev/null | awk '{print $NF}' || true)"`
  then `[[ "$current_oc" == "$OPENCLAW_VERSION" ]]`.
- Confirm `openclaw --version` output shape first (it may print just the version, or
  a prefixed string) and parse accordingly; note the assumption in report.md.

### RS5 — Extend the `env -i` acceptance gate to node/npm (MN-1, Codex + CC)
`bootstrap.sh:128`. The symlink loop wires `node npm npx openclaw`, but the stripped
gate validates only `openclaw`. A dangling `node`/`npm` shim would pass the bake yet
break at runtime.
- Extend to: `sudo -u "$AGENT_USER" env -i /bin/sh -c 'node -v && npm -v && openclaw --version'`.
- Since this now covers node/npm, the redundant `as_agent node -v` / `npm -v` lines
  (≈121-122) can be dropped or kept as a separate "toolchain present for the user"
  check — your call, but don't leave dead duplication; note the decision.

### RS6 — Cheap hardening (MN-2 + MJ-5)
- **compinit** (`dotfiles/shell/zshrc`): change bare `compinit` to
  `compinit -i -d "$HOME/.zcompdump"` so a group/world-writable fpath dir never
  produces a mid-class interactive "insecure directories" prompt.
- **sudoers** (`bootstrap.sh:56`, in the user-CREATE branch only): write to a temp
  file, validate with `visudo -c -f`, then `install -m 0440 -o root -g root`. This
  branch only runs on non-cloud images (stock Ubuntu already has the user), so it's
  low real-world hit rate — but it's cheap and correct. Keep the change scoped to
  that branch.

### RS7 — Optional defense-in-depth (MN-3, MN-4) — do if time allows
- **Dash-PATH assert** (claim A): early in the script, assert `/usr/local/bin` is in
  dash's default PATH so a re-bake on a different base fails loudly:
  `_p="$(env -i /bin/sh -c 'printf %s "$PATH"')"; [[ "$_p" == */usr/local/bin* ]] || { echo "FATAL: /usr/local/bin not in default PATH"; exit 1; }`
- **HOME-unset hardening** (claim B): a one-line note in report.md (and optionally a
  comment near the shim section) that production launchers should set
  `HOME=/home/ubuntu` (systemd `User=ubuntu` already does) so mise resolution never
  depends on the passwd fallback.

Nits (N-1..N-6 in the merged review) are optional cleanup — fold in any that are
one-liners (e.g. the imprecise PATH comment, redundant `.config` create); skip the
rest. Don't let nits balloon the diff.

## Acceptance criteria (green gate)

- `bash -n dotfiles/bootstrap.sh` passes; `shellcheck dotfiles/bootstrap.sh` clean
  (or any new warning documented + justified).
- `zsh -n dotfiles/shell/zshrc` and `zsh -n dotfiles/shell/zshenv` pass.
- mise is pinned (RS1) and Node is pinned to exact patch (RS2) — no `latest`/major-
  only resolution remains. If a real tag couldn't be verified offline, the TODO is
  clearly flagged, NOT a fabricated version.
- The `curl|bash` trap (RS3) is closed: either the header no longer advertises piping,
  or the script is self-contained; and a profile-less bake now fails loud.
- openclaw guard is exact-match (RS4); the `env -i` gate covers node+npm+openclaw (RS5).
- compinit is non-interactive-safe (RS6); sudoers hardened in the create branch (RS6).
- Script remains idempotent — re-running changes nothing, errors nowhere.
- No secrets, no NodeSource references, no cloud resources touched.
- `report.md` written: a table mapping each RS# → what changed → file:line, the
  mise/node versions chosen (with how you verified they're real), and the human
  verification commands for the real box.

## Safety rules

- **Create NO cloud resources.** No Terraform apply, no `hcloud`, no SSH. Pure file
  edits + static checks.
- **Do not invent version numbers.** Pin only real, verified release tags; if you
  can't verify one in this environment, leave a flagged TODO and say so in report.md.
- **Do not commit secrets.** Nothing here references a real key.
- Conventional commits, scope `infra`. Reference the RS#/MJ# in commit bodies, e.g.
  `fix(infra): pin mise version + verify checksum (RS1/MJ-1)`.
- Stop after the green gate + report. No apply / bake / snapshot — those are
  human-gated later loops.
