# Loop 013 — Snapshot + Clone 14 Student Boxes

**Run:** Sun 2026-06-21, ~3–4pm CDT (~17h to showtime).
**Outcome:** ⛔ **Stopped at Phase D by operator decision** — the Hetzner project's
dedicated-vCPU quota is maxed and cannot create the boxes. The golden snapshot is
built and all 14 cloud-init configs are rendered and correct; only server
creation is blocked, pending a quota increase.

---

## TL;DR

| Phase                 | Result                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| A — Pre-flight        | ✅ Box healthy, but **predated loop-011** (no tunnel/firstboot/cloudflared) → re-bake required first |
| Re-bake (added)       | ✅ Synced current code + ran `bootstrap.sh`; loop-011 stack now present and verified                 |
| B — Snapshot          | ✅ **Image `400123530`** `goto-2026-golden-20260621`, `available`, 240G                              |
| C — Render cloud-init | ✅ 14 files, 0 unsubstituted placeholders, per-instance tunnel tokens verified                       |
| D — Create 14 servers | ⛔ **BLOCKED — Hetzner dedicated-core quota exceeded** (can't create even 1 more ccx33)              |
| E — Verify 3 boxes    | ⬜ Not reached (no boxes created)                                                                    |

**Green gate NOT met** (no server IPs, no Phase E) — by design: operator chose
"stop and write report" once the quota wall was hit rather than spend on an
alternative instance type.

---

## Premise correction (matches loop-012 finding B2)

goal.md assumed `goto-test` was "baked … ready to snapshot." It was **not**: the
box was provisioned by an earlier loop and predated loop-011. Pre-flight on the
live box found **no `openclaw-tunnel`/`openclaw-firstboot` units, no `cloudflared`,
no `/etc/cloudflared`, no `/var/lib/bake` stamps**. Snapshotting it as-is would
have shipped 14 boxes with a `tunnel.env` file but no connector service to use it
— i.e. zero public access path. A re-bake was therefore required before Phase B,
and was performed (operator-approved).

---

## Phase A — Pre-flight

- ✅ Docker `openclaw-lab-sonarqube-1` + `openclaw-lab-db-1` both healthy (39h).
- ✅ `nginx` active; disk 7.9G/225G; no bake in progress.
- 🔴 loop-011 absent (see premise correction above).
- No existing `goto` snapshot → proceed to build one.

## Re-bake (inserted before Phase B)

1. Box repo at `/root/goto-2026-masterclass` was a **non-git stale copy**
   (`bootstrap.sh` had 0 `phase_tunnel`). Synced current code from the local
   checkout (HEAD `b1ebe3d` at the time) via `rsync -az --delete` of `dotfiles/`
   and `infra/`.
2. Ran `bash dotfiles/bootstrap.sh` (no stamps present → full run, each phase
   idempotent). Completed **rc=0**.
3. `phase_verify` assertions all passed:
   - nginx binds `8080` on **loopback only**
   - `cloudflared` installed (**2026.6.1**)
   - `/etc/cloudflared/config.yml` **absent at bake** (first-boot generated)
   - 7 lab units enabled (`firstboot`, `desktop-{vnc,novnc,cred}`, `tunnel`,
     `services`, `nginx`)
4. Post-bake health re-checked: tunnel + firstboot units enabled, cloudflared
   2026.6.1, both Docker containers still healthy, nginx active.

## Phase B — Snapshot

```
Image ID:    400123530
Name/desc:   goto-2026-golden-20260621
Status:      available
Arch:        x86 · Image size 5.07 GB · Disk size 240 GB
Created:     2026-06-21 15:29:42 CDT
```

Sequence: graceful `poweroff` → `create-image --type snapshot` (waited for action
completion) → `poweron`. Pre-snapshot hygiene confirmed clean: `/etc/openclaw`
empty, `/etc/cloudflared` absent, no `/etc/nginx/.htpasswd`, `ubuntu` git identity
unset (so per-box firstboot identity works on clones), firstboot not yet run.

## Phase C — Render cloud-init (14 instances)

- ✅ 14 files in `infra/cloud-init/generated/` (gitignored), **0 unsubstituted
  `{{…}}` placeholders**.
- ✅ **Per-instance Cloudflare Tunnel tokens** verified: every box's rendered
  `CLOUDFLARED_TOKEN` matches its entry in `instance-secrets.toml` (14/14 MATCH).
  This is the correct **per-box-tunnel** model — each box runs its own tunnel
  (distinct tunnel ID), not a shared fleet tunnel.
- `TUNNEL_SALT` is fleet-wide (correct by design — only the token is per-box).
- OpenClaw API key source = **stub** (`ALLOW_STUB=1`); real keys are a follow-on.

> Note: the first render (~15:30) ran under the older `clone.sh` (fleet-wide
> token). Commit `32f7e8e` (make CLOUDFLARED_TOKEN per-instance in clone.sh)
> landed at 16:07; the on-disk configs were regenerated and now carry
> correct per-instance tokens (verified). If regenerating again, run `clone.sh`
> with `TUNNEL_SECRETS_SOURCE=op`, `OPENCLAW_API_KEY_SOURCE=stub`, `ALLOW_STUB=1`.

## Phase D — Create 14 servers — ⛔ BLOCKED

```
hcloud: dedicated core limit exceeded (resource_limit_exceeded)
```

- The project rejects creating **even one** additional ccx33. `goto-test` (8
  dedicated cores) alone sat at the dedicated-vCPU cap.
- **14 × ccx33 = 112 dedicated cores** — far beyond a default project limit.
  Resolving this requires a **Hetzner limit increase** (Console → Limits, or a
  support request) that only the account owner can file; turnaround is uncertain.
- Substitutes that fit the 240G snapshot were identified but not used (operator
  chose to stop): `cpx51` (shared, 16c/**32G**/360G, €0.448/hr — RAM-matches
  ccx33) or `cpx41` (shared, 8c/16G/240G, €0.227/hr — half the RAM, SonarQube
  may be tight). Shared-vCPU lives in a separate, usually higher quota bucket.

## Phase E — Verify 3 boxes

Not reached — no servers were created.

---

## Anomaly observed (out-of-band, not caused by this loop)

After Phase B/C, `goto-test` **disappeared from the project** (`hcloud server
list` empty, port 22 closed) — no delete command was issued by this loop. The
SSH keys confirm it is still the same project, and **snapshot `400123530` is
intact and `available`**. Most likely removed on the operator side (e.g. to free
quota). Flagged for awareness; the golden image is safe.

---

## Blockers / open items for provisioning

1. **Hetzner dedicated-vCPU quota (PRIMARY).** Request an increase to cover
   14×ccx33 (112 cores), or re-spec the fleet to shared-vCPU (`cpx51`). Nothing
   else can proceed until servers can be created.
2. **DNS CNAMEs.** The 14 tunnels exist (tokens present), but per-box hostnames
   only resolve once `cloudflared tunnel route dns <tunnel> <hostname>` has been
   run for each service hostname. Status not verified this loop — confirm before
   relying on public URLs. (See GOT-161.)
3. **Stub OpenClaw API keys.** Clones boot with a stub key; real per-box keys are
   a follow-on (credential-bag loop). Students' OpenClaw won't authenticate until
   then.
4. **Snapshot repo-copy hygiene (verify).** The re-bake left a copy of the repo at
   `/root/goto-2026-masterclass` inside the image. The `infra/` tree was rsynced
   _before_ the local `generated/` configs were rendered, so it should contain
   **no** per-box secrets — but this could not be re-confirmed on the box (it was
   removed). Before cloning, boot one server from `400123530` and verify
   `/root/goto-2026-masterclass/infra/cloud-init/generated/` is **absent**; if
   present, it would leak every box's secrets into every clone — purge and
   re-snapshot.

## Next steps (once quota is granted)

```bash
export PATH="/opt/homebrew/bin:$PATH"
export OP_SERVICE_ACCOUNT_TOKEN=$(security find-generic-password -s "1password-service-account" -w)
export HCLOUD_TOKEN=$(op read "op://Openclaw/EVIE - Hetzner GOTO 2026 API KEY/password")
SNAPSHOT_ID=400123530
for host in $(grep -vE '^#|^$' instances.txt); do
  hcloud server create --name "goto-$host" --type ccx33 --location ash \
    --image $SNAPSHOT_ID \
    --ssh-key cedrics-macbook-pro-m4-max --ssh-key evie-mac-mini-host \
    --user-data-from-file "infra/cloud-init/generated/${host}.cloud-init.yaml" \
    --label project=goto-2026 --label hostname=$host
  sleep 2
done
```

Then Phase E: `ssh root@<ip>` and check `systemctl is-active nginx openclaw-tunnel`,
`docker ps`, and `systemctl status cloudflared`/tunnel connectivity (~5 min after
boot).

---

## Corrections to the spec (for future loops)

- **Secret references in goal.md/context.md were wrong.** The tunnel secrets live
  in `op://Openclaw/EVIE - Cloudflared goto-2026-fleet Token/{TUNNEL_SALT,
CLOUDFLARED_TOKEN}`, **not** `op://Openclaw/GOTO 2026 - Clone Secrets/…` (that
  item does not exist). Per-instance `CLOUDFLARED_TOKEN` comes from
  `instance-secrets.toml`, not the fleet item.
- **1Password service-account keychain entry** is `1password-service-account`,
  not `op-service-account-token`.
- **goal.md's `hcloud snapshot create` / `hcloud server poweroff` syntax** doesn't
  match the CLI; use `hcloud server create-image --type snapshot` and
  `hcloud server poweroff <name>`.
