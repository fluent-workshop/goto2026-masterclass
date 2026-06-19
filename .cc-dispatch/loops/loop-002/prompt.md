# Loop 002 prompt

Convert the golden-image bake (`dotfiles/bootstrap.sh`) from NodeSource to **mise**,
wire shims into `/usr/local/bin` for non-interactive resolution, and add a stripped
**classroom** zsh profile under `dotfiles/shell/`. Then static-validate and STOP.

**READ FIRST:**
- `.cc-dispatch/loops/loop-002/goal.md` — full spec, layer boundaries, acceptance
  criteria, safety rules. Do not skip it.
- `docs/prd/PRD-001-student-exercise-infra.md` — D2 (mise decision) and FR-1.
- `~/src/divideby0/dotfiles/` — Cedric's real dotfiles. Cherry-pick the Linux path
  only (install-mise.sh, mise/config.toml, packages/apt.txt, shell/zshrc). Fork a
  STRIPPED classroom version — do NOT copy his full personal loadout.

- Mode: autonomous (`--dangerously-skip-permissions`).
- This loop is **pure file editing + static checks**. There is NO Hetzner box yet.
- **Create NO cloud resources. No Terraform. No SSH. No hcloud calls.**
- Do not touch `infra/terraform/` or `infra/cloud-init/`.
- Stop condition: `bash -n` passes, shellcheck clean (or documented), `dotfiles/shell/`
  populated, `report.md` written. Then go idle.
- Conventional commits, scope `infra`.
