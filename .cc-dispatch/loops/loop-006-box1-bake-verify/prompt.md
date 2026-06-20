# Loop 006 prompt — box #1 live bake + verify

Run the lab bake on the live box #1 for the first time, fix whatever breaks (in the
REPO recipe, not just the box), and verify the desktop + Docker stack come up — so
we know the recipe is snapshot-ready. This is the FIRST live execution of a recipe
that has only been statically validated.

READ FIRST (you start cold):
- `.cc-dispatch/loops/loop-006-box1-bake-verify/goal.md` — full spec, phases,
  acceptance, safety.
- `.cc-dispatch/loops/loop-006-box1-bake-verify/references/INDEX.md` — then the
  loop-005 bake report (the recipe + verify commands) and the canonical PRD.

LIVE BOX: `goto-test`, ccx33, Ubuntu 24.04.4, 8 vCPU / 30GB.
SSH: `ssh -i ~/.ssh/id_ed25519 root@87.99.153.105` (works from this host). Throwaway
box — break/re-run/fix freely. Stock `ubuntu` user also present.

Mode: autonomous (`--dangerously-skip-permissions`), repo on `main`.

CRITICAL: when the bake fails on the real box, FIX THE REPO `dotfiles/...` and re-run
— do NOT leave fixes only on the box. The snapshot must come from the committed
recipe. The bake needs a checkout (git clone / rsync the tree), NOT curl|bash (the
loop-003 guard FATALs piped runs by design).

OUT OF SCOPE: no Terraform (box exists — do NOT destroy/recreate), no snapshot
(human-gated next), no 14-clone, no cloud-init cred injection, no personas, no
Discord (deferred). Tailscale Funnel is BEST-EFFORT: there's no student-instance
auth key available yet, so verify the desktop over direct `http://87.99.153.105:8080`
(basic-auth, the PRD's Wi-Fi fallback) and FLAG the missing auth key for Cedric
rather than blocking. Do not fake a Funnel pass.

NO SECRETS COMMITTED: the test basic-auth password stays on the box only.

Done when: bootstrap.sh runs to green from a clean checkout (idempotent, all fixes
committed to the repo); desktop verified (`nginx -t` clean, `:8080` fail-closed 401
then serves noVNC+Xfce with a test cred); Docker verified (sonarqube+postgres
healthy via the baked unit, ubuntu in docker group, SonarQube boots with the sysctl
fix, within memory budget); Funnel verified over HTTPS OR direct-IP verified + auth
key flagged; `report.md` written with per-failure fixes + an explicit
snapshot-readiness verdict — or stop after 40 turns and report what's blocking.

Stop after report.md + committing recipe fixes. Do NOT snapshot or start the clone.
