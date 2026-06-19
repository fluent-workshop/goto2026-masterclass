# Loop 003 prompt

Land the loop-002 review fixes into the golden-image bake (`dotfiles/bootstrap.sh`)
and the classroom zsh profile. Then static-validate and STOP.

**READ FIRST (in order):**
- `.cc-dispatch/loops/loop-003/goal.md` — the prioritized fix list (RS1–RS7) with
  exact file:line targets and acceptance criteria. Do not skip it.
- `.cc-dispatch/reviews/20260619-173741-fbdfed0-dirty/MERGED-REVIEW.md` — the full
  review with reviewer attribution; authority if goal.md is ambiguous.

Headline fixes: pin+verify mise (RS1), pin exact Node patch (RS2), close the
`curl|bash` shell-config trap (RS3), exact-match the openclaw version guard (RS4),
extend the `env -i` gate to node/npm (RS5), compinit + sudoers hardening (RS6).

- Mode: autonomous (`--dangerously-skip-permissions`).
- Pure file editing + static checks. There is NO Hetzner box.
- **Create NO cloud resources. No Terraform. No SSH. No hcloud.**
- Do not touch `infra/terraform/` or `infra/cloud-init/`.
- **Do not invent version numbers** — pin only real, verified release tags; flag a
  TODO if you can't verify one offline.
- Stop condition: `bash -n` + shellcheck clean, `zsh -n` clean, all RS items landed
  or explicitly flagged, `report.md` written. Then go idle.
- Conventional commits, scope `infra`; reference RS#/MJ# in commit bodies.
