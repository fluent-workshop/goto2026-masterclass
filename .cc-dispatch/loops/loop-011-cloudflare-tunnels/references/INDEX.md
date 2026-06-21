# References — loop-011-cloudflare-tunnels

Snapshots of the live files at loop start (2026-06-20). Read all before editing the real files in `dotfiles/` and `infra/`.

| File | Live path it mirrors | Why |
|---|---|---|
| `CURRENT-bootstrap.sh` | `dotfiles/bootstrap.sh` | The bake. Phase functions + stamp/`--phase`/`--force` dispatch. Add `phase_tunnel` matching this pattern; add code-server to `phase_desktop`; extend `phase_verify`. |
| `CURRENT-nginx.conf` | `dotfiles/desktop/openclaw-desktop.nginx` | noVNC reverse proxy. Add 2s connect timeout + reusable `@offline` pattern. |
| `CURRENT-clone.sh` | `infra/clone.sh` | Per-instance render. Thread the 3 new placeholders through, stub-safe + validated. |
| `CURRENT-cloud-init.yaml` | `infra/cloud-init/template.yaml` | Per-instance cloud-init. Add `/etc/openclaw/tunnel.env` write_files entry. |

These are read-only references. Edit the real files in the repo, not these copies.
