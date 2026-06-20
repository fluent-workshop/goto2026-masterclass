# loop-009-bootstrap-modularity

Fix the nginx Critical, harden clone.sh injection risks, and refactor bootstrap.sh into independently runnable phase functions with stamp-file support.

## Success criteria

1. nginx config binds `127.0.0.1:8080` only — `ss -ltnp | grep 8080 | grep -v 127` returns empty
2. `INSTANCE_NAME` validated against RFC1123 regex before rendering — bad hostname errors out
3. `OPENCLAW_API_KEY` written via `encoding: b64` in cloud-init write_files
4. `DESKTOP_USER` validated and quoted before substitution
5. `clone.sh` fails when `API_KEY_SOURCE=stub` unless `ALLOW_STUB=1` is explicitly set
6. `/etc/openclaw/desktop.env` deleted by cred unit after htpasswd is written
7. `bootstrap.sh` has named phase functions and `--phase <name>` flag
8. Stamp files at `/var/lib/bake/<phase>.done` allow skipping completed phases on re-run
9. `--force` flag bypasses stamps for explicit re-run
10. All security fixes in one `fix(infra):` commit; modularity refactor in a separate `refactor(infra):` commit
