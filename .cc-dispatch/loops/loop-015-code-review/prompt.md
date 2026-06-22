BLIND CODE REVIEW — you did NOT write this code. Do NOT modify any files.

Review ALL of these files for correctness, safety, robustness, and maintainability:

1. dotfiles/bootstrap.sh          (577 lines — GCE bake script, runs as root)
2. infra/clone.sh                 (401 lines — cloud-init renderer + GCP provisioner)
3. dotfiles/tunnel/openclaw-tunnel-config.sh  (generates cloudflared ingress YAML)
4. dotfiles/firstboot/openclaw-firstboot.sh   (systemd first-boot unit script)
5. dotfiles/desktop/openclaw-desktop-cred.sh  (sets htpasswd for noVNC auth)
6. infra/services/openclaw-services-env.sh + openclaw-sonarqube-ready.sh
7. .claude/skills/cloudflare/scripts/create-tunnels.ts
8. .claude/skills/cloudflare/scripts/create-tunnel-dns.ts
9. .claude/skills/cloudflare/scripts/playwright-helpers.ts

## Context
- 14-box GCE student fleet (n2-standard-8, us-central1-a, Ubuntu 22.04)
- Each box boots from a golden image via cloud-init injecting per-box secrets
- Cloudflare Tunnels (prefix gt26-) provide public access; tokens per box
- TUNNEL_SALT derives hash8 hostnames; must match between openclaw-tunnel-config.sh and DNS
- bootstrap.sh runs ONCE on the bake box; firstboot.sh and desktop-cred.sh run per-clone at first boot via systemd
- clone.sh renders cloud-init YAMLs and provisions via `--provision` flag using `gcloud compute instances create`

## Focus areas
- **Shell safety**: `set -euo pipefail`, quoting, injection risks, proper error handling, `trap` cleanup
- **Idempotency**: scripts that may run twice (especially bootstrap.sh) — are they safe?
- **Secret handling**: env vars, files written to disk, permissions (must be 0600), no secrets in logs
- **Dead code from Hetzner pivot**: clone.sh was rewritten from hcloud to gcloud — are there leftover hcloud paths, unreachable conditions, or vestigial variables?
- **Long script structure**: bootstrap.sh and clone.sh are long — is logic well-decomposed? Risky monolithic sections?
- **Correctness**: cloudflared token injection, hostname hash derivation (sha256+salt+[:8]), cloud-init YAML escaping (base64 blocks, special chars in passwords)
- **TypeScript**: error handling, async safety, fiber token extraction robustness

## Output
Write the full review to `.cc-dispatch/reviews/20260621-213954-9a30921-gcp-pivot/cc-review.md`.
Format: ranked Critical / Major / Minor / Nit, each with file:line, description, and suggested fix.
End with a short overall assessment (2–3 sentences).
