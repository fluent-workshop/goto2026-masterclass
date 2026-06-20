# references/ — loop-007 cloud-init desktop-cred wiring

| File | What it is | Why CC needs it |
|------|-----------|-----------------|
| `loop-006-verify-report.md` | The box #1 verify report. Section "Box state at hand-off" + the FR-4 wiring hand-off (#2) define exactly what's missing. | Tells CC the cred contract the bake already expects, and that the box is live + fail-closed. |

## The exact contract (already baked, verified in loop-006)

The golden image's first-boot unit `openclaw-desktop-cred.service` runs
`/usr/local/sbin/openclaw-desktop-cred.sh`, which reads **`/etc/openclaw/desktop.env`**
expecting two vars:

```
DESKTOP_USER=<per-student username>
DESKTOP_PASS=<per-student password>
```

It then builds the bcrypt htpasswd nginx uses for basic-auth. **Until that file
exists, nginx fails closed (401).** This loop's job is to make cloud-init DROP that
file per instance — the bake side is done and verified.

## Current state of the per-instance layer

- `infra/cloud-init/template.yaml` EXISTS but only injects `{{HOSTNAME}}` +
  `{{OPENCLAW_API_KEY}}`. It does NOT write `desktop.env`.
- `infra/clone.sh` is **referenced in the template's header comment but does NOT
  exist** — it must be written: render the template per row of `instances.txt`,
  substituting the placeholders.
- `instances.txt` = 14 hostnames (abra…vulpix).

## Live box for testing

- `goto-test`, ccx33, `87.99.153.105`. SSH: `ssh -i ~/.ssh/id_ed25519 root@87.99.153.105`.
- Currently fail-closed (no desktop.env). This loop can test the rendered cloud-init
  / cred mechanism against it, but must NOT commit any real secret and must leave it
  fail-closed at the end.

## Decisions locked

- Per-student desktop password is a **generated secret per instance**, injected at
  clone time — never baked, never committed.
- Funnel (FR-5) and the actual 14-clone are OTHER loops. This loop is the per-instance
  injection plumbing only.
