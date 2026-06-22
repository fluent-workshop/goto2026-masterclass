Student experience pass — three parallel improvements before fleet provision.

## 1. README files for `dotfiles/` and `infra/`

Write `dotfiles/README.md` explaining:
- Directory layout (shell/, desktop/, tunnel/, firstboot/, services/)
- The cloud-init vs firstboot split: WHY some things happen at bake time vs first boot
- The TUNNEL_SALT / hash8 hostname scheme and why (security without wildcard certs)
- How a student could adapt this for their own OpenClaw instance (what to change, what to keep)
- Pointer to infra/README.md for the provisioning side

Write `infra/README.md` explaining:
- clone.sh: what it does (render cloud-init templates + optionally provision)
- Terraform: only manages goto-test bake box, NOT the student fleet
- The instance-secrets.toml model (why per-box secrets, what lives there, why gitignored)
- The GCP golden image → cloud-init → fleet model end to end
- How a student would replicate this for their own multi-box deployment

## 2. Extract mise toolchain to `dotfiles/mise.toml`

Currently bootstrap.sh has Node pinned inline and installs tools ad-hoc.
Create `dotfiles/mise.toml` (goes to `~/.config/mise/config.toml` on the agent user) with:
- node (same version currently used — check bootstrap.sh phase_toolchain)
- bun (same version)
- eza (for the ls alias)
- starship (for the prompt)
Any other tools installed via mise in bootstrap.sh should move here too.

Update bootstrap.sh `phase_toolchain` to run `mise install` from this file instead of
installing tools piecemeal. This makes the toolchain readable at a glance and lets
students add/swap tools by editing one file.

## 3. Adopt niceties from divideby0/dotfiles

The live repo is at ~/src/divideby0/dotfiles. Read it. Adopt what makes sense for
a student learning environment:

**Shell (dotfiles/shell/zshrc additions):**
- History deduplication: HIST_IGNORE_SPACE, HIST_IGNORE_DUPS, HIST_FIND_NO_DUPS, SHARE_HISTORY
- Useful functions: mkcd() (mkdir + cd), kill-port() (lsof + kill by port)
- eza alias: alias ls="eza --icons" (if eza is installed via mise.toml above)
- Lazy completions: pattern for gh, bun (the tools students will actually use —
  NOT the full kubernetes/cloud suite from Cedric's config, keep it focused)
- PATH dedup: typeset -U PATH

**Prompt:**
- Add starship config to dotfiles/ (a minimal config.toml — Cedric's uses the default,
  but a custom one showing git branch, node version, and a clean prompt line is friendlier
  for students unfamiliar with terminal prompts)
- Update phase_toolchain / the shell dotfile to init starship

**Keep it focused:** Students are learning agentic coding, not Kubernetes. Skip kubectl,
helm, k9s, docker completion, etc. Pick the things that reduce friction in a coding session.

## Acceptance
- bash -n on any modified .sh files
- Commit and push everything with descriptive messages
- Write report.md
