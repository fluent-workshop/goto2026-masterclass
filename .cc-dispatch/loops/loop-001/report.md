# Loop 001 — Report: Terraform for a single bake-test VPS

**Status:** ⛔ Plan blocked on missing credential. Everything that does not need
the API token is done and green. `terraform validate` passes; `terraform plan`
cannot run because `HCLOUD_TOKEN` was never injected into this environment.

---

## What was built

Terraform under `infra/terraform/`:

| File           | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `versions.tf`  | TF `>= 1.5`, `hetznercloud/hcloud ~> 1.49`; token read from env.   |
| `variables.tf` | `location`, `server_type`, `image`, `ssh_key_name` (clone-ready).  |
| `main.tf`      | `data.hcloud_ssh_key` lookup + one `hcloud_server "test"`.         |
| `outputs.tf`   | `test_server_ipv4`.                                                |
| `.gitignore`   | Excludes state, `*.tfvars`, `.terraform/`. Lock file IS committed. |

The server: name `goto-test`, image `ubuntu-24.04`, labels
`{ project = "goto-2026", role = "bake-test" }`, existing SSH key attached by
name via data-source lookup (no new key created). IPv4 is output.

Variables are intentionally generic so the later "clone 14" loop can `for_each`
over `instances.txt` against the same `server_type` / `image` / `location`.

---

## Acceptance criteria

| Gate                                        | Result                                         |
| ------------------------------------------- | ---------------------------------------------- |
| `terraform validate` passes                 | ✅ `Success! The configuration is valid.`      |
| `terraform plan` clean, exactly ONE server  | ⛔ Blocked — `Missing Hetzner Cloud API token` |
| No secret material in any tracked file      | ✅ Token is env-only; nothing hardcoded.       |
| `report.md` with plan summary + server_type | ✅ This file.                                  |

### The blocker (verbatim)

```
Error: Missing Hetzner Cloud API token
  with provider["registry.terraform.io/hetznercloud/hcloud"],
  on versions.tf line 14, in provider "hcloud":
  14: provider "hcloud" {}
While configuring the provider, the Hetzner Cloud API token was not found in
the HCLOUD_TOKEN environment variable or provider configuration block token attribute.
```

The loop prompt states the token "is in env as `HCLOUD_TOKEN`," but it is not
present — checked the dispatch shell, the login shell (`zsh -li`), `~/.config`,
and the repo. No `hcloud` CLI is installed either. I will not hardcode a token
(safety rule), so the plan step needs the credential supplied by a human.

---

## `server_type` decision — `cpx21`, NOT the spec's `cx22`

The spec suggested `cx22` and asked me to verify it maps to ~4 GB / 2 vCPU and
is available in the chosen location. It does **not** work in `ash`:

- **`cx22`** is part of Hetzner's **Intel (CX)** line, which is offered **only in
  the EU locations** (Nuremberg `nbg1`, Falkenstein `fsn1`, Helsinki `hel1`).
  It is **not available in the US locations** (`ash`, `hil`). With the spec's
  default `location = "ash"`, requesting `cx22` would fail at apply.
- The US locations carry the **AMD (CPX, x86)** and **Ampere (CAX, ARM)** lines.

4 GB options actually available in `ash`:

| Type      | Arch       | vCPU | RAM  | Notes                                                |
| --------- | ---------- | ---- | ---- | ---------------------------------------------------- |
| **cpx21** | AMD x86    | 3    | 4 GB | **Chosen.** x86 → safest for the openclaw/Node bake. |
| cax11     | Ampere ARM | 2    | 4 GB | Exact 2 vCPU, but ARM (see flag below).              |
| cx22      | Intel x86  | 2    | 4 GB | EU-only; unavailable in `ash`.                       |

**Why `cpx21`:** it satisfies the hard floor (≥ 4 GB shared vCPU) and stays on
**x86**, which is the safe choice for the bake — `dotfiles/bootstrap.sh` runs
NodeSource Node 22 + `build-essential` + `npm i -g openclaw@2026.6.5`, and that
pinned openclaw build has not been confirmed on ARM. The extra vCPU (3 vs 2) is
harmless. Per the safety rule, I picked the safe 4 GB option rather than guess
silently.

> ⚠️ **Flag for Cedric/Evie — please confirm two things:**
>
> 1. **Architecture / type.** If you want the exact 2 vCPU footprint and have
>    verified openclaw runs on ARM, switch to `cax11`. If you'd rather keep the
>    EU Intel `cx22`, also change `location` to `nbg1`/`fsn1`/`hel1`.
> 2. **I could not hit the API** (no token, no `hcloud` CLI) to confirm live
>    availability — the table above is from Hetzner's published catalog. A quick
>    `hcloud server-type list` / `hcloud location list` will verify before apply.

---

## Exact commands to finish the loop (human-gated)

```bash
# 1. Provide the token (do NOT commit it; env only):
export HCLOUD_TOKEN="<your-hetzner-project-token>"

cd infra/terraform

# 2. Re-run the plan — expect exactly 1 resource to add, 0 to change/destroy:
terraform plan

# 3. Review the plan. Then, and only then, apply (BILLABLE — human-gated):
terraform apply
```

After review, override the type/region without editing files, e.g.:

```bash
terraform plan -var 'server_type=cax11'          # ARM, exact 2 vCPU
terraform plan -var 'server_type=cx22' -var 'location=fsn1'   # EU Intel
```

**Stop point:** this loop does **not** apply, bake, or snapshot. Next steps
(run `dotfiles/bootstrap.sh`, snapshot the golden image, then the clone-14 loop)
are gated on Cedric/Evie reviewing this plan.
