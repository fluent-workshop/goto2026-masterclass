# Loop 001 — Terraform for a single test VPS + live bake

## Context

This repo provisions the GOTO 2026 masterclass exercise environment: 14 named
student VPS instances on **Hetzner Cloud**, each running a pre-baked OpenClaw agent.

The provisioning model is **bake once, clone 14**:
1. Stand up ONE test server (this loop).
2. Run `dotfiles/bootstrap.sh` on it → snapshot it (golden image).
3. Later loop: `terraform for_each` over `instances.txt` to clone 14 from the snapshot.

**Layer boundaries (do not cross):**
- **Terraform** owns Hetzner *resources only* (servers, SSH keys, firewall, network).
- **bash/cloud-init** owns everything *inside* the box. No config-management tool
  (no Ansible) goes in the image — students must be able to read the setup.

## Existing repo artifacts (read before writing)

- `instances.txt` — canonical 14-name roster (hostname = each line). NOT used this
  loop (single test box), but the later clone loop will `for_each` over it. Design
  your variables with that future in mind.
- `dotfiles/bootstrap.sh` — the Linux bake script. Pinned openclaw `2026.6.5`,
  Node 22, creates a `student` user. You will run this over SSH on the test box.
- `infra/cloud-init/template.yaml` — per-instance hostname + key injection. NOT
  needed for the bare test box, but read it to understand the eventual shape.

## Phases

### F1 — Terraform skeleton for one test server
Write Terraform under `infra/terraform/`:
- Provider: `hetznercloud/hcloud`. API token read from env var `HCLOUD_TOKEN`
  (NEVER hardcode; NEVER commit the token). Add a `variables.tf` with:
  - `location` (string, default `"ash"` — Ashburn US-East)
  - `server_type` (string, default `"cx22"` — verify this is the current ≥4GB
    shared-vCPU type; Hetzner renamed the cx line, confirm via `hcloud server-type list`
    or the provider docs and use whatever maps to 4GB RAM / 2 vCPU)
  - `image` (string, default `"ubuntu-24.04"`)
  - `ssh_key_name` (string, default `"cedrics-macbook-pro-m4-max"` — already in the
    Hetzner project)
- One `hcloud_server` resource named `test`, hostname `goto-test`, tagged with
  labels `{ project = "goto-2026", role = "bake-test" }`.
- Attach the existing SSH key by name (data source lookup, don't create a new key).
- Output the server's public IPv4.

### F2 — Plan only, STOP
- `terraform init` and `terraform plan`. Capture the plan output into
  `report.md`. **DO NOT `terraform apply`.** Apply creates billable resources and
  is human-gated — Cedric or Evie runs it after reviewing your plan.

## Acceptance criteria (green gate)

- `terraform validate` passes.
- `terraform plan` runs clean and shows exactly ONE server to create, no errors.
- No secret material in any tracked file (`git diff --staged` clean of tokens).
- `report.md` contains: the plan summary, the resolved `server_type` you chose and
  WHY (the 4GB mapping), and the exact apply command Cedric will run.

## Safety rules

- **NEVER run `terraform apply`.** Plan only. Full stop.
- **NEVER commit secrets.** `HCLOUD_TOKEN` comes from the environment at runtime.
- Conventional commits, scope `infra` (e.g. `feat(infra): terraform skeleton for test VPS`).
- If `server_type`/region naming is ambiguous, pick the safe 4GB option, document the
  choice in `report.md`, and flag it rather than guessing silently.
- Stop at the plan. Do not proceed to bake/snapshot — that's a later loop gated on
  Cedric reviewing this plan.
