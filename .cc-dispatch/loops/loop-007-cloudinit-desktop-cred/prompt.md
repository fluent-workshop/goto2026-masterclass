# Loop 007 prompt — cloud-init desktop-cred injection + clone.sh

Build the per-instance credential wiring so a cloned box comes up with its own
desktop login. The bake already expects cloud-init to drop
`/etc/openclaw/desktop.env` (DESKTOP_USER/DESKTOP_PASS) at first boot — this loop
makes the cloud-init template write it and writes the missing `infra/clone.sh`
renderer. File-editing + live-box validation. No snapshot, no 14-clone, no spend.

READ FIRST (you start cold):
- `.cc-dispatch/loops/loop-007-cloudinit-desktop-cred/goal.md` — full spec.
- `.cc-dispatch/loops/loop-007-cloudinit-desktop-cred/references/INDEX.md` — the exact
  desktop.env contract + current per-instance state; then the loop-006 report.
- The files: `infra/cloud-init/template.yaml`, `instances.txt`,
  `dotfiles/desktop/openclaw-desktop-cred.sh`.

Mode: autonomous (`--dangerously-skip-permissions`), repo on `main`.
LIVE BOX for validation: `ssh -i ~/.ssh/id_ed25519 root@87.99.153.105` (goto-test).

Do: (1) add a `write_files` block to template.yaml dropping
`/etc/openclaw/desktop.env` (root:root 0600) via `{{DESKTOP_USER}}`/`{{DESKTOP_PASS}}`
placeholders; (2) write `infra/clone.sh` that renders template.yaml per
`instances.txt` row, generating a unique strong desktop password per box, writing
rendered files + a credential manifest to a GITIGNORED dir
(`infra/cloud-init/generated/` is already ignored), with the OpenClaw key source as a
documented placeholder/stub; (3) validate on the live box: rendered cred → cred hook
→ `:8080` returns 200 with cred, 401 without, then REMOVE the test cred and leave the
box fail-closed (401); (4) write report.md.

OUT OF SCOPE / FORBIDDEN: no snapshot, no terraform, no 14-clone, no Tailscale/Funnel
(separate loop, needs an auth key Cedric hasn't minted), no real API-key provisioning
(credential-bag loop), no regressions to dotfiles/ (the baked image). NO SECRETS
COMMITTED — generated passwords go only to gitignored paths + the live box (then
removed); secret-scan before committing.

Done when: template.yaml writes desktop.env; `infra/clone.sh` renders all 4
placeholders per row to a gitignored dir with per-box password gen + a gitignored
manifest (bash -n + shellcheck clean, idempotent); live-box proof 401→200→401 with
the box left fail-closed; `git status` shows only `infra/` + the loop-007 dir, no
secret material tracked; report.md written — or stop after 30 turns and report.

Stop after report.md + committing (conventional commits, scope infra, ref FR-4). Do
NOT snapshot or start the clone.
