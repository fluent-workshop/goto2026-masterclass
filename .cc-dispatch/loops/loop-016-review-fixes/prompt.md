Apply the code review fixes from .cc-dispatch/reviews/20260621-213954-9a30921-gcp-pivot/MERGED-REVIEW.md.

## Priority order (fix Critical first, then Major, then Minor/Nits)

### Critical
1. **Tunnel prefix mismatch** — `create-tunnels.ts` still hardcodes `goto2026-` in the
   inline JavaScript payload sent to the browser. Audit the file and align all tunnel
   naming to use `gt26-` consistently (the same prefix used by `create-tunnel-dns.ts`,
   the DNS records, and `openclaw-tunnel-config.sh`). Extract to a shared constant.

### Major
2. **Stale Hetzner docs in bootstrap.sh** — The header comments and the final echo
   still reference Hetzner, Ubuntu 24.04, and `hcloud server create-image`. Rewrite
   them for the actual GCE bake flow (GCE, Ubuntu 22.04, `gcloud compute images create`).
   Also fix any other lingering Hetzner references in bootstrap.sh.

3. **Shell injection via TOML secrets** — `clone.sh` writes CLOUDFLARED_TOKEN and
   POSTGRES_APP_PASSWORD raw into tunnel.env which is sourced as root. Add strict
   validation (JWT regex for token, alnum for password) with a hard die() before
   substitution.

4. **clone.sh --provision not idempotent** — Add a check before creating each GCE
   instance; skip (log a note) if the instance already exists. Do not abort the loop.

### Minor
5. **htpasswd leaks password in process list** — Change `htpasswd -b ...` to use
   stdin: `printf '%s' "$DESKTOP_PASS" | htpasswd -iBc ...`

6. **Misleading CLOUDFLARED_TOKEN comment** — Update the architecture comments at the
   top of clone.sh to clearly say the token is per-instance (not fleet-wide).

7. **Remove .bak sentinel files from .gitignore** — There are .bak files left from
   `sed -i.bak` operations. Add `*.bak` to .gitignore so they never get committed.

8. **Stale comment in firstboot.sh** — The comment says "After=cloud-final" but
   the service uses "After=network-online.target". Fix the comment.

### Nit
9. **bootstrap.sh --phase argument guard** — Validate `$2` exists before assigning
   SELECTED_PHASE to avoid set -u errors.

## After applying fixes
- Run `bash -n` on all modified .sh files to confirm syntax is clean.
- Commit all changes with a descriptive message.
- Push to origin.
- Write a summary to loop-016 report.md.
