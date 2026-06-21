# loop-011-cloudflare-tunnels

**READ FIRST:**
- `.cc-dispatch/loops/loop-011-cloudflare-tunnels/goal.md` — full spec. Phases A–E. Do not skip.
- `.cc-dispatch/loops/loop-011-cloudflare-tunnels/references/` — CURRENT-* snapshots of the live files you're editing. Read all four before changing anything.

Mode: autonomous. Work on `main` of `~/src/spantree/goto-2026-masterclass`. Commit when done.

Replace the Tailscale-fronted access model with Cloudflare Tunnels (cloudflared). Add code-server. Add a new `phase_tunnel` to bootstrap.sh following the EXACT phase-function + stamp + `--phase`/`--force` pattern already there. Extend nginx with fail-fast 503s. Thread TUNNEL_SALT/CLOUDFLARED_TOKEN/POSTGRES_APP_PASSWORD through clone.sh + cloud-init (stub-safe). Remove every Tailscale reference.

Do NOT touch skills/, the companion app, or anything outside dotfiles/, infra/, docs/.
Do NOT run the bake (needs root). Verify via shellcheck + bash -n + off-box logic.
Done when: goal.md "Done when" checklist passes, grep for tailscale/Funnel is clean, report.md written.
Stop: write report.md and idle after phases complete or 45 turns.
