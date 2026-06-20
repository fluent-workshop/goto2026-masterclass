# Loop 007 report — cloud-init desktop-cred injection + clone.sh

**Mode:** file-editing + live-box validation against box #1 (`goto-test`,
`87.99.153.105`). No snapshot, no 14-clone, no terraform, no spend beyond the
already-running box. Box left **fail-closed** exactly as loop-006 handed it off.

This loop wires the last unwired piece of FR-4: the **per-instance desktop
credential**. The golden image's baked `openclaw-desktop-cred.service` already
expects cloud-init to drop `/etc/openclaw/desktop.env` (DESKTOP_USER /
DESKTOP_PASS) at first boot and turn it into the nginx bcrypt htpasswd — but the
cloud-init template didn't write that file, and the `infra/clone.sh` that renders
the template per instance didn't exist. Both now do.

## Result: ✅ GREEN — per-instance cred injection wired and proven on real hardware

- `infra/cloud-init/template.yaml` now writes `/etc/openclaw/desktop.env`
  (`root:root`, `0600`) via `{{DESKTOP_USER}}` / `{{DESKTOP_PASS}}`.
- `infra/clone.sh` renders all four placeholders per `instances.txt` row to the
  gitignored `infra/cloud-init/generated/`, generating a unique strong desktop
  password per box and emitting a gitignored credential manifest.
- Live-box proof: rendered cred → baked cred hook → `:8080` returns **200** with
  the cred and **401** without; box returned to **fail-closed**.
- No secret committed (secret-scan clean; `generated/` is gitignored).

---

## 1. Template change (F1)

Added a second `write_files` entry to `infra/cloud-init/template.yaml`:

```yaml
- path: /etc/openclaw/desktop.env
  owner: root:root
  permissions: "0600"
  content: |
    DESKTOP_USER={{DESKTOP_USER}}
    DESKTOP_PASS={{DESKTOP_PASS}}
```

`0600 root:root` because it's a secret read by the cred hook as root.
**Ordering is already correct:** cloud-init's `write_files` runs in the config
stage, well before `cloud-final`; the baked unit is `After=cloud-final`, so the
file is present when the hook fires. No unit change needed — the bake side was
done and verified in loop-006; this loop just feeds it.

The template header was reworded so it no longer contains the literal
`{{…}}` tokens (they were being substituted inside the comment, duplicating the
password into a comment line). The header now names the placeholders in prose.

## 2. `infra/clone.sh` design (F2)

Renders `template.yaml` → one cloud-init file per host, substituting all four
placeholders. `bash -n` + `shellcheck` clean.

| Concern              | Decision                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Host list**        | `instances.txt` by default (comments/blanks stripped); or hostnames as args (`clone.sh pikachu gengar`) — used to render the throwaway test host without touching the roster.                                                                                |
| **Desktop username** | Stable convention **`student`** on every box (override via `DESKTOP_USER`). Same login to print on every card; only the password is per-box.                                                                                                                 |
| **Desktop password** | Generated per box: 20 alphanumerics (~119 bits) from `/dev/urandom`. Alnum-only so it survives a basic-auth prompt, an `.env` line, and a printed card without quoting surprises.                                                                            |
| **OpenClaw API key** | Documented **stub** (`OPENCLAW_API_KEY_SOURCE=stub` default) emits a clearly-fake `REPLACE_ME__…` placeholder so rendering never needs a real key. `env` and `op` (1Password) sources are stubbed in for the credential-bag loop to wire. **Not hardcoded.** |
| **Output**           | `infra/cloud-init/generated/<host>.cloud-init.yaml`, mode `0600`, in the already-gitignored `generated/` dir.                                                                                                                                                |
| **Manifest**         | `infra/cloud-init/generated/credentials-manifest.tsv` (`0600`, gitignored): `hostname → desktop_user → desktop_pass → api_key_source`, header-flagged SECRET. Feeds the later QR/Gist delivery loop.                                                         |
| **Idempotency**      | Re-running reuses any desktop password already in the manifest (already-distributed creds stay valid) and only generates for new hosts; a partial/targeted render carries forward the other hosts' manifest rows. `--force` rotates all.                     |
| **Safety**           | Substitution via bash `${var//…}` (no `sed` escaping pitfalls); post-render guard fails if any `{{…}}` remains; secrets only ever land in `generated/` (and, at boot, on the box).                                                                           |

Verified behaviour locally:

- First run renders all 14 roster hosts + manifest (14 rows).
- Second run: pikachu password **unchanged** (idempotent).
- `--force`: pikachu password **rotated**.
- Targeted `clone.sh clonetest`: renders the one host, roster's 14 manifest rows
  preserved.
- All 14 rendered files parse as YAML and contain the `desktop.env` write_files
  entry.

## 3. Live-box proof (F3) — 401 → 200 → 401

Rendered a **throwaway** host `clonetest` (not a real student) so no real
credential ever touched the box.

| Step                                                                            | Result                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cloud-init schema --config-file clonetest.cloud-init.yaml` (on the box)        | **Valid schema** ✅                                                                                  |
| `/` before, no creds                                                            | **401** (fail-closed) ✅                                                                             |
| Drop rendered `desktop.env` → `systemctl restart openclaw-desktop-cred.service` | unit `active`; built `/etc/nginx/.htpasswd` (`root:www-data 0640`), `student:$2y$05$…` **bcrypt** ✅ |
| `/` no creds                                                                    | **401** ✅                                                                                           |
| `/` wrong password                                                              | **401** ✅                                                                                           |
| `/` correct generated cred                                                      | **200** ✅                                                                                           |

> Note: the oneshot cred unit is `RemainAfterExit`, so it must be **restarted**
> (not `start`ed) to re-run `ExecStart` once it's already `active (exited)` — a
> bare `start` is a no-op and leaves no htpasswd (nginx then 403s cred attempts).
> On a real clone this is a non-issue: the unit runs once at first boot when the
> cloud-init-dropped `desktop.env` is already present.

**Cleanup:** removed `/etc/openclaw/desktop.env`, `/etc/nginx/.htpasswd`, and the
`/tmp` rendered file; reset the unit. Box re-verified **fail-closed** (`/` and
`/vnc.html` both 401). The throwaway password lived on the box only and is gone.

## 4. No secrets committed

- `git check-ignore` confirms `generated/` (rendered files + manifest) is ignored
  (`.gitignore:11`); `git add -n` refuses to stage it.
- Tracked-file scan for `DESKTOP_PASS=<value>` / `REPLACE_ME__openclaw_api_key`:
  **none**.
- Committed in this loop: `infra/cloud-init/template.yaml`, `infra/clone.sh`, and
  this loop-007 dir only.

## 5. What the next loops consume

- **QR / Gist delivery loop** reads `credentials-manifest.tsv`
  (hostname → user/pass) to hand each student their desktop login.
- **Credential-bag loop** replaces the API-key stub in `clone.sh` with the real
  per-instance source (`env`/`op` paths are already stubbed).
- **The 14-clone** (human-gated, after snapshot) runs `clone.sh` to render all 14
  cloud-init files, then boots each box from the golden snapshot + its rendered
  per-instance file.
- **Funnel (FR-5)** still blocked on a Tailscale auth key Cedric must mint.

## 6. Out of scope this loop (unchanged)

No snapshot, no 14-clone, no terraform, no Tailscale/Funnel, no real API-key
provisioning, no changes to the baked image (`dotfiles/`).

## 7. Box state at hand-off

Box #1 still **running**, desktop **fail-closed** (no `desktop.env`, no
htpasswd), Docker stack healthy — identical to the loop-006 hand-off. Ready for a
human to inspect and snapshot.
