# Loop 007 — Cloud-init desktop-cred injection + clone.sh (per-instance wiring)

## Context

Box #1's golden recipe is verified green (loop-006). The one piece of FR-4 still
unwired is the **per-instance credential injection**: the baked first-boot unit
expects cloud-init to drop `/etc/openclaw/desktop.env` with `DESKTOP_USER` /
`DESKTOP_PASS`, but the cloud-init template doesn't write it yet, and the
`infra/clone.sh` that renders the template per instance **doesn't exist** (it's
referenced in the template header but was never written).

This loop builds that per-instance layer so a cloned box comes up with its own
desktop login. It's **file-editing + validation against the live box**, no snapshot,
no 14-clone, no spend beyond the already-running box #1.

## READ FIRST (you start cold)

- `references/INDEX.md` — the exact `desktop.env` contract + current state.
- `references/loop-006-verify-report.md` — what's baked + the hand-off.
- The actual files: `infra/cloud-init/template.yaml`, `instances.txt`,
  `dotfiles/desktop/openclaw-desktop-cred.sh` (the consumer).

## Phases

### F1 — Extend the cloud-init template (FR-4 wiring)
Add a `write_files` block to `infra/cloud-init/template.yaml` that drops
`/etc/openclaw/desktop.env` with `DESKTOP_USER` and `DESKTOP_PASS`, owned
`root:root`, mode `0600` (it's a secret; the cred hook reads it as root at first
boot). Use placeholders (e.g. `{{DESKTOP_USER}}`, `{{DESKTOP_PASS}}`) consistent
with the existing `{{HOSTNAME}}` / `{{OPENCLAW_API_KEY}}` style. Ensure ordering is
fine: cloud-final writes the file, then `openclaw-desktop-cred.service`
(`After=cloud-final`) builds the htpasswd — that wiring already exists, just feed it.

### F2 — Write `infra/clone.sh` (the renderer)
Create the missing `infra/clone.sh` that, per row of `instances.txt`, renders
`template.yaml` → a per-instance cloud-init file by substituting ALL placeholders:
`{{HOSTNAME}}`, `{{OPENCLAW_API_KEY}}`, `{{DESKTOP_USER}}`, `{{DESKTOP_PASS}}`.
Requirements:
- **Generate a strong per-instance desktop password** (e.g. `openssl rand` or
  similar), unique per box. The username can be a stable convention (e.g. `student`
  or the hostname) — decide and document.
- Write rendered files to a **gitignored** output dir (e.g.
  `infra/cloud-init/generated/` — confirm/extend `.gitignore`; the repo already
  ignores `infra/cloud-init/generated/`). NEVER write secrets into a tracked path.
- Emit a **credential manifest** (hostname → desktop user/pass, and where the
  OpenClaw key came from) to a gitignored path so the later QR/Gist loop can consume
  it. Make clear these are secrets.
- Source the `OPENCLAW_API_KEY` per instance from a parameter/env/1Password lookup
  placeholder — do NOT hardcode. For this loop, a documented placeholder/stub for
  the key source is fine (real key provisioning is the credential-bag loop); the
  DESKTOP creds are the focus here.
- Idempotent / safe to re-run; clear usage (`clone.sh` reads instances.txt, writes
  generated/).

### F3 — Validate against the live box (no snapshot, no commit of secrets)
- `bash -n infra/clone.sh` + shellcheck clean.
- Render for ONE test hostname, and validate the cloud-init YAML parses
  (`cloud-init schema --config-file <rendered>` if available on the box, or a YAML
  parser locally; the box has cloud-init).
- Prove the mechanism end-to-end on box #1 WITHOUT baking a secret into anything
  tracked: drop a rendered `desktop.env` to `/etc/openclaw/desktop.env` on the box,
  run the cred hook (`systemctl start openclaw-desktop-cred.service` or the script),
  confirm `http://87.99.153.105:8080/` now returns **200 with the generated cred**
  and 401 without. Then **remove the test `desktop.env` + htpasswd and leave the box
  fail-closed (401)**, exactly as loop-006 left it. The generated test password
  lives on the box only, never committed.

### F4 — Report
`report.md`: the template change, the clone.sh design (password gen, username
convention, output + manifest paths, key-source stub), the live-box proof
(401→200→401), and what the NEXT loops consume (the credential manifest feeds
QR/Gist; the 14-clone feeds off clone.sh + the snapshot). Confirm the box is back
fail-closed and no secret was committed.

## Acceptance criteria (gradeable)

- `infra/cloud-init/template.yaml` writes `/etc/openclaw/desktop.env`
  (root:root 0600) via placeholders.
- `infra/clone.sh` exists, renders all 4 placeholders per `instances.txt` row to a
  **gitignored** output dir, generates a unique strong desktop password per box, and
  emits a gitignored credential manifest. `bash -n` + shellcheck clean. Idempotent.
- Live-box proof: rendered cred → cred hook → `:8080` returns 200 with the cred and
  401 without; box left **fail-closed**, test secret removed, nothing secret
  committed.
- `git status`: only `infra/` (template + clone.sh) and the loop-007 dir changed;
  `git grep`/secret-scan shows no password/key material in tracked files.
- `report.md` written with the design + proof + next-loop hand-off — or stop after
  30 turns and report what's blocking.

## Safety rules

- **No snapshot, no 14-clone, no terraform, no destroy.** Box #1 stays as-is, ends
  fail-closed.
- **No secrets in git.** Generated passwords/keys go ONLY to gitignored paths and the
  live box (then removed). Verify with a secret scan before committing.
- Do NOT regress the baked recipe (dotfiles/) — this loop is the per-instance layer
  (`infra/`), not the image.
- Conventional commits, scope `infra`; reference FR-4. Stop after F4 + report.
