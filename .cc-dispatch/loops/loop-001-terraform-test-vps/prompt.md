# Loop 001 prompt

Write the Terraform for a SINGLE Hetzner Cloud test VPS, then `terraform plan` and STOP.

**READ FIRST:** `.cc-dispatch/loops/loop-001/goal.md` — full spec, layer boundaries,
acceptance criteria, and safety rules. Do not skip it.

- Mode: autonomous (`--dangerously-skip-permissions`).
- Hetzner token is in env as `HCLOUD_TOKEN`. Never hardcode or commit it.
- Stop condition: `terraform plan` is clean and `report.md` is written.
- **DO NOT run `terraform apply`** — that's human-gated. Plan only, then go idle.
