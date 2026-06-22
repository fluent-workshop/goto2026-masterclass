# Loop 016 — Apply Code-Review Fixes (GCP Pivot)

**Source review:** `.cc-dispatch/reviews/20260621-213954-9a30921-gcp-pivot/MERGED-REVIEW.md`
**Outcome:** ✅ All 9 listed items fixed. `bash -n` + `shellcheck` clean on every
modified shell file; modified TypeScript parses; `clone.sh` still renders all 14.

---

## Fixes

### 🔴 Critical

1. **Tunnel prefix mismatch** — `create-tunnels.ts` hardcoded `goto2026-{box}` as
   the tunnel name while `create-tunnel-dns.ts` looked up `gt26-{box}`. Extracted
   a single source of truth `export const TUNNEL_PREFIX = 'gt26'` in
   `playwright-helpers.ts`; both scripts now import and use it (tunnel name,
   hostname infix, and the strip regex). No hardcoded `goto2026-` tunnel names
   remain. (The git-identity email `…-goto2026@…` in `openclaw-firstboot.sh` is a
   separate, intentionally-kept convention, not a tunnel name — left untouched.)

### 🟠 Major

2. **Stale Hetzner docs in `bootstrap.sh`** — Rewrote the header (run on a **GCE
   VM**, **Ubuntu 22.04**, log in as a sudo user and `sudo bash`, capture with
   `gcloud compute images create …`) and the final completion echo. Replaced the
   remaining `Ubuntu 24.04` reference and the GCP-incorrect "snapshot" wording
   with "image" throughout the bake comments.

3. **Shell injection via TOML secrets** — `CLOUDFLARED_TOKEN` and
   `POSTGRES_APP_PASSWORD` are written into `tunnel.env`, which is `source`d by
   **root** at first boot. Added strict pre-substitution validation in
   `clone.sh`: `CLOUDFLARED_TOKEN_RE='^eyJ[A-Za-z0-9._=/+-]+$'` and
   `POSTGRES_APP_PASSWORD_RE='^[A-Za-z0-9._-]+$'`, each with a hard `die()` before
   the value is substituted (subsumes the old CR/LF check). A backtick / `$(…)` /
   quote now fails the render loudly. Verified: a backtick token is rejected; all
   14 real secrets still pass.

4. **`--provision` not idempotent** — `provision_gcp()` now runs
   `gcloud compute instances describe` first and **skips** an existing instance
   (logs a note, continues). A failed `create` no longer aborts the loop — it
   warns, counts the failure, continues, and the function exits non-zero at the
   end if any box failed. Prints a `created/skipped/failed` summary.

### 🟡 Minor

5. **htpasswd password in process list** — `dotfiles/desktop/openclaw-desktop-cred.sh`
   now pipes the password via stdin: `printf '%s' "$DESKTOP_PASS" | htpasswd -iBc …`,
   so the cleartext never appears in `ps`.

6. **Misleading `CLOUDFLARED_TOKEN` comment** — Updated the `clone.sh` architecture
   header and env-var docs to state clearly that `CLOUDFLARED_TOKEN` (and
   `POSTGRES_APP_PASSWORD`) are **per-instance** from `instance-secrets.toml`;
   only `TUNNEL_SALT` is fleet-wide / governed by `TUNNEL_SECRETS_SOURCE`.

7. **`.bak` files** — Added `*.bak` to `.gitignore` (no `.bak` files were tracked).

8. **Stale comment in `openclaw-firstboot.sh`** — Comment said `After=cloud-final`;
   the unit now uses `After=network-online.target`. Corrected (and noted that
   cloud-init applies the hostname in an earlier stage, so it's already set).

### 🟢 Nit

9. **`bootstrap.sh --phase` argument guard** — `--phase` now checks `$# -ge 2`
   before assigning `$2`, so a missing value fails with a clear message instead of
   a `set -u` "unbound variable".

---

## Out-of-list review items (not in the prompt's 1–9, noted not done)

- **terraform `.terraform.lock.hcl` → google 7.x:** left at the pinned `~> 6.0`
  (v6.50.0); bumping the provider major is a deliberate decision, not a review
  mechanical fix.
- **`offline.html` `<meta refresh>`:** intentional UX (the offline page
  auto-reconnects when the service returns); removing it would regress behavior.
- **`cc-dispatch.ts` complexity:** the review itself marked this out of scope.

## Verification

```
bash -n:    infra/clone.sh, dotfiles/bootstrap.sh,
            dotfiles/desktop/openclaw-desktop-cred.sh,
            dotfiles/firstboot/openclaw-firstboot.sh   → all OK
shellcheck: all four                                    → CLEAN
TS parse:   playwright-helpers / create-tunnels /
            create-tunnel-dns                           → OK
clone.sh:   renders all 14 hosts (new validation passes every real secret);
            backtick-injection token rejected by negative test
```
