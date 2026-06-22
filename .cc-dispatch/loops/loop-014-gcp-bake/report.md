# Loop 014 — Pivot GOTO 2026 Infra from Hetzner to GCP

**Run:** Sun 2026-06-21 evening CDT.
**Outcome:** ✅ **Complete and validated end-to-end.** GCP project
`goto2026-masterclass-500200` has a working golden image
(`goto2026-golden-20260621c`), Terraform and `clone.sh` are GCP-native, and a
full canary boot confirmed the entire pipeline — including **public Cloudflare
tunnel registration** (after the tokens were recreated under the `gt26-` prefix
and the image re-baked to match). Remaining work is fleet-scale only: a
`us-central1` CPU-quota bump, then provision all 14.

---

## Why we pivoted

Hetzner capped the project at **8 dedicated vCPU** and would not grant more in
time (loop-013): 14 × ccx33 = 112 dedicated cores. We moved the whole stack to
GCP, where Cedric created project `goto2026-masterclass-500200`.

---

## What shipped

| Step                 | Result                                                               |
| -------------------- | -------------------------------------------------------------------- |
| 1. Rewrite Terraform | ✅ `infra/terraform/` is now `google` provider (was `hcloud`)        |
| 2. Apply Terraform   | ✅ `goto-test` created (n2-standard-8, us-central1-a)                |
| 3. Run the bake      | ✅ `bootstrap.sh --force` rc=0 on the GCP box                        |
| 4. Golden image      | ✅ **`goto2026-golden-20260621c`** (family `goto2026-golden`), READY |
| 5. Update `clone.sh` | ✅ opt-in `--provision` → `gcloud compute instances create`          |
| 6. report.md         | ✅ this file                                                         |
| (validation)         | ✅ full canary boot; found + fixed a first-boot ordering bug         |

### 1. Terraform (`infra/terraform/`)

- `versions.tf`: provider `hashicorp/google ~> 6.0` (v6.50.0); creds from ambient
  gcloud ADC.
- `variables.tf`: GCP vars — `project_id` (default `goto2026-masterclass-500200`),
  `region`/`zone` (`us-central1` / `us-central1-a`), `machine_type`
  (`n2-standard-8` — 8 vCPU/32 GB, the ccx33 analogue), `boot_image_family`
  (`ubuntu-2204-lts` from `ubuntu-os-cloud`), `boot_disk_size_gb` (256),
  `boot_disk_type` (`pd-balanced`), `ssh_user` (`cedric`), `ssh_public_key_path`.
- `main.tf`: `google_compute_instance "test"` named `goto-test`, ephemeral
  external IP, `metadata.ssh-keys` (automation key) + `enable-oslogin=FALSE` so
  metadata keys are honored, `allow_stopping_for_update=true`.
- `outputs.tf`: external IP, ssh_user, instance_name, zone.
- The old hcloud state/lock were moved aside (`*.hcloud.bak`) for a clean init.

### 3. Bake

`rsync` of `dotfiles/` + `infra/` to the box, then
`sudo bash dotfiles/bootstrap.sh --force`. rc=0; `phase_verify` passed (nginx
loopback-only, cloudflared 2026.6.1 installed, `/etc/cloudflared/config.yml`
absent at bake, 7 lab units enabled). Ubuntu **22.04.5** (vs Hetzner's 24.04 —
per the `ubuntu-2204-lts` spec; bake handled it cleanly).

### 4. Golden image

`gcloud compute images create goto2026-golden-<date> --source-disk=goto-test
--source-disk-zone=us-central1-a --family=goto2026-golden`. The `goto2026-golden`
**family** is what `clone.sh` references, so the newest non-deprecated image is
always picked. Final image is **`goto2026-golden-20260621c`** (see the gt26-
section below for why it was re-imaged twice).

> **Secret-leak hygiene (important):** the rsynced repo on the box contained the
> 14 rendered cloud-init files + `credentials-manifest.tsv` (because `infra/` was
> synced after a local render). These were **purged before imaging**, and the
> image was verified clean (`generated/` absent, no htpasswd, `/etc/openclaw`
> empty, git identity unset). This confirms the leak risk flagged in loop-013 was
> real — any image/snapshot must purge `infra/cloud-init/generated/` first.

### 5. `clone.sh`

Rendering stays the default (side-effect-free). New **opt-in** provisioning:
`infra/clone.sh <hosts> --provision` (or `PROVISION=1`) runs
`gcloud compute instances create goto-<host>` from the golden family, injecting
that host's cloud-init via `--metadata-from-file=user-data=…` (GCE's cloud-init
datasource reads the `user-data` key), plus `enable-oslogin=FALSE` and an admin
`ssh-keys` entry. Tunable via `GCP_*` env vars (project/zone/machine/image
family/disk/prefix/ssh). `bash -n` + `shellcheck` clean.

---

## Validation (canary boot) — and a bug we fixed

Provisioned a `pikachu` canary from the image via `clone.sh --provision` and
watched first boot. The GCE cloud-init path worked: hostname set, `tunnel.env` +
`desktop.env` written, the tunnel-config helper rendered the correct per-box
config (`host=pikachu domain=fluentworkshop.dev`), Docker sonarqube + db came up
healthy, nginx active and failing closed (401).

**Bug found:** `openclaw-firstboot.service` and `openclaw-desktop-cred.service`
**did not run at boot** (git identity unset, no htpasswd, no journal entries),
though manually starting them worked perfectly. Root cause: the GCE Ubuntu
image's default target is **`graphical.target`**, in which `cloud-final.service`
runs late; `After=cloud-final.service` + `WantedBy=multi-user.target` forms an
**ordering cycle**, so systemd silently drops these jobs. This was a latent
loop-011 defect — loop-013 never booted a clone, so it was never exercised.

**Fix:** re-ordered both units onto `network-online.target` (matching the lab
units that did run; cloud-init's files are present by then — the tunnel unit
already depends on it) and added `ConditionPathExists=/etc/openclaw/desktop.env`
to cred so it's a clean no-op on the bake box. Re-baked, re-imaged
(`…-20260621b`, old image deprecated), and re-validated on a fresh canary:

```
openclaw-firstboot    active   → git user.name=Pikachu, user.email=pikachu-goto2026@fluentworkshop.dev
openclaw-desktop-cred active   → /etc/nginx/.htpasswd present
nginx / openclaw-tunnel / openclaw-services  active
docker: sonarqube + db healthy ; nginx localhost:8080 → 401 (fails closed)
```

All first-boot automation now runs unattended. Canary was then **torn down**
(reproducible in ~1 min via `clone.sh pikachu --provision`).

---

## Tunnel-token + gt26- infix resolution (RESOLVED)

The first validation hit `cloudflared: Unauthorized: Invalid tunnel secret` —
the original per-box tokens belonged to zombie tunnels from UI-automation
retries. Cedric recreated 14 fresh tunnels under a **`gt26-`** prefix, extracted
the active tokens into `instance-secrets.toml`, created the 84 CNAMEs, and
switched the ingress renderer's infix from `-goto2026-` to `-gt26-`
(`openclaw-tunnel-config.sh`).

Because the golden image is baked from `openclaw-tunnel-config.sh`, the image was
**re-baked + re-imaged** so its rendered ingress matches the live CNAMEs (an
image with the old infix would 404 every protected hostname). New golden:
**`goto2026-golden-20260621c`**. A pre-image scrub was required — the now-fixed
firstboot unit runs on the bake box's boot and had seeded the git identity to
`Goto-test`; it was unset so clones seed their own.

**Final canary validation (fresh boot from `…-20260621c`, no manual steps):**

```
ingress hostnames: pikachu-gt26-app / -gt26-desktop-<h> / -gt26-…   (match CNAMEs)
cloudflared: Registered tunnel connection x4 (quic, ord edge)        ← token valid
firstboot: git user.name=Pikachu, user.email=pikachu-goto2026@fluentworkshop.dev
desktop-cred: /etc/nginx/.htpasswd present
nginx / openclaw-tunnel / openclaw-services / firstboot / cred  all active
docker: sonarqube + db healthy
```

The pipeline is now working end-to-end including public tunnel registration.

## Current state

- `goto-test`: **TERMINATED** (stopped) — terraform-managed bake source; restart
  to re-bake. Left stopped (disk-only cost).
- Image **`goto2026-golden-20260621c`**: READY, family `goto2026-golden` (the
  newest, so `clone.sh` picks it). `…-20260621b` (goto2026- infix) and the
  original `…-20260621` (broken first-boot) are deprecated.
- No student instances running (canary torn down).

## Next steps (fleet)

1. **Regional CPU quota:** 14 × n2-standard-8 = **112 vCPU** in `us-central1`.
   The default quota is far lower — request an increase before the fleet clone.
2. Provision the fleet: `infra/clone.sh --provision` over `instances.txt` (renders
   then creates all 14 from `goto2026-golden`). Verify each with
   `cloud-init status`, `systemctl is-active`, and `journalctl -u openclaw-tunnel`
   (expect "Registered tunnel connection").

## Notes / corrections for future loops

- goal.md said `infra/bootstrap.sh`; the bake actually lives at
  `dotfiles/bootstrap.sh`.
- SSH to GCP boxes: `ssh -i ~/.ssh/id_ed25519 cedric@<ip>` (metadata key,
  OS Login disabled); Cedric also retains `gcloud compute ssh`.
- 1Password service-account keychain entry is `1password-service-account`; tunnel
  secrets item is `op://Openclaw/EVIE - Cloudflared goto-2026-fleet Token/…`.
