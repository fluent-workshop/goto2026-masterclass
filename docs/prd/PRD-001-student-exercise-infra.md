---
title: "GOTO 2026 Masterclass — Student Exercise Infrastructure"
prd: PRD-001
status: Draft
owner: "Cedric Hurst"
issue: "GOT-35, GOT-36, GOT-37, GOT-38, GOT-39, GOT-40"
date: 2026-06-19
version: "1.0"
---

# PRD: GOTO 2026 Masterclass — Student Exercise Infrastructure

---

## 1. Problem & Context

The GOTO 2026 OpenClaw masterclass needs a fleet of disposable, identical lab
environments — one per attendee — that boot into a **ready-to-use OpenClaw agent**
with zero in-class installation. Students will SSH into a named box, run exercises
against a pre-installed, pinned `openclaw` build, and (inevitably) wedge it; we need
a one-command reset that returns any instance to clean state without a re-bake.

The repo (`spantree/goto-2026-masterclass`) currently has the scaffolding: a
canonical 14-name roster (`instances.txt`), a `dotfiles/bootstrap.sh` bake script,
a per-instance `cloud-init` template, and a plan-only Terraform skeleton for a
single bake-test server (loop-001, complete and green). What's missing is the
end-to-end golden-image pipeline, the clone-14 Terraform, key injection, the verify
pass, the Cloudflare Tunnel access layer for the live demo, and the reset script — plus this PRD to anchor
the decisions already made so they don't get relearned.

The hard gate: everything must be **provisioned and verified before the M1 dry-run
(Sun 2026-06-21 EOD)**. That is ~2 days out, so the architecture deliberately favors
reproducibility and speed over long-term fleet management.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| **Zero cold installs in class** | Time from student SSH to working agent | < 10s (boot + login only) |
| **Identical environments** | Variance between instances | Byte-identical from one snapshot; only hostname + key differ |
| **Spellable support** | Hostnames usable from verbal instruction | 14 names, all unambiguous under stress |
| **Recoverable instances** | Time to reset a wedged box | < 2 min, one command, no re-bake |
| **Capacity headroom** | Registered seats vs provisioned boxes | 10 registered + 4 buffer = 14 |
| **Ready before gate** | All 14 verified | `openclaw doctor` green on each before Sun 6/21 EOD |

**Guardrails (must not regress):**
- No secret material (Hetzner token, per-instance API keys) ever committed to the repo.
- The image must stay readable by attendees — no opaque config-management layer (no Ansible/Jinja inside the box).
- Pinned `openclaw` version stays fixed across all 14 (no drift between bake and clones).

---

## 3. Users & Use Cases

### Primary: Masterclass attendee

> As a student, I want to SSH into a named box and immediately have a working
> OpenClaw agent, so that I spend class time on exercises, not setup.

**Preconditions:** Student has their QR/access sheet (hostname + key) and the box is booted from the golden snapshot.

### Secondary: Instructor / support (Cedric, Evie)

> As support during the class, I want to refer to instances by spellable name
> ("Pikachu is wedged"), so that I can triage and reset without hunting IPs.

### Future: Reusable lab harness (enabled by this work)

> As a future masterclass author, I want the same bake-once/clone-N pipeline
> parameterized by a roster file, so that a new class is a new `instances.txt`
> plus a re-bake — not a rebuild.

---

## 4. Scope

### In scope

1. **Golden-image bake** — `dotfiles/bootstrap.sh` on one fresh Hetzner VPS → snapshot (GOT-35).
2. **Clone 14** — Terraform `for_each` over `instances.txt` from the snapshot (GOT-36).
3. **Per-instance key injection** — cloud-init writes each box's API key at clone time (GOT-37).
4. **Verify pass** — `openclaw doctor` green on every instance (GOT-38).
5. **Tunnel access** — all 14 reachable via per-box Cloudflare Tunnel subdomains for the live demo (GOT-39).
6. **Reset-to-clean** — `infra/reset.sh` restores a wedged instance without re-bake (GOT-40).
7. **Classroom shell profile** — stripped zsh forked from Cedric's Ubuntu dotfiles variant.
8. **Node via mise** — with shims wired into `/usr/local/bin` for non-interactive contexts.

### Out of scope / later

| What | Why | Tracked in |
|------|-----|------------|
| LLM API key procurement + caps | Separate cost/vendor workstream | GOT-41, GOT-44 |
| Hetzner capacity procurement | Account/quota concern, not provisioning code | GOT-43 |
| Instance tracking sheet | Ops artifact; consumes this pipeline's output | GOT-42 |
| Exercise/lab content | Blocked on GOT-38; not infra | GOT-55→61 |
| Long-term fleet management / patching | Boxes have a ~2-day lifespan | N/A (intentional) |

### Design for future (build with awareness)

Terraform variables (`server_type`, `image`, `location`) are already generic so the
clone loop can `for_each` over any roster. The roster lives in one file
(`instances.txt`) and the per-instance layer is the *only* place names/keys appear —
so re-targeting a future class is "swap the roster + re-bake," not a rewrite. Keep
the bake script idempotent so iterating the recipe never requires a fresh box.

---

## 5. Functional Requirements

### FR-1: Golden-image bake (GOT-35)

Stand up one fresh Hetzner VPS (Ubuntu 24.04, `ccx33` — 8 dedicated vCPU / 32GB /
240GB NVMe), run the idempotent bake, then snapshot. The snapshot is the single
source of truth for all clones.

**Acceptance criteria:**

```gherkin
Given a fresh Ubuntu 24.04 Hetzner VPS of type ccx33 (8 dedicated vCPU / 32GB RAM)
When dotfiles/bootstrap.sh runs to completion
Then node 22 (via mise), npm, and openclaw 2026.6.5 resolve on PATH for the agent user
  And `openclaw --version` prints 2026.6.5
  And the script is safe to re-run (idempotent) with no errors
```

**Files:**
- `dotfiles/bootstrap.sh` — bake recipe (switch Node install from NodeSource to mise; wire shims).
- `dotfiles/shell/` — classroom zsh profile (forked, stripped).

### FR-2: Clone 14 from snapshot (GOT-36)

Terraform `for_each` over `instances.txt` creates 14 servers from the golden
snapshot, each with its hostname set via cloud-init.

**Acceptance criteria:**

```gherkin
Given a golden snapshot exists and instances.txt has 14 names
When `terraform apply` runs against the clone configuration
Then exactly 14 servers are created from the snapshot image
  And each server's hostname equals its roster name
  And `terraform plan` is idempotent (0 changes) on a second run
```

**Files:**
- `infra/terraform/clone.tf` (or `for_each` extension of `main.tf`) — the 14-clone config.
- `infra/clone.sh` — renders cloud-init per row (hostname + key substitution).

### FR-3: Per-instance API key injection (GOT-37)

Each clone receives its own OpenClaw API key at create time via cloud-init
`write_files`, root-readable only, owned by the agent user. Keys never touch the repo.

**Acceptance criteria:**

```gherkin
Given a per-instance key is supplied at clone time (from 1Password, not the repo)
When the instance boots
Then /home/ubuntu/.openclaw/credentials/api-key exists with mode 0600 owned by ubuntu
  And the key value matches the one assigned to that hostname
  And no key material appears in any tracked git file
```

### FR-4: Verify openclaw doctor on each instance (GOT-38)

A verification pass confirms every instance is green before the dry-run gate.

**Acceptance criteria:**

```gherkin
Given all 14 instances are cloned and booted
When the verify script SSHes to each and runs `openclaw doctor`
Then every instance reports healthy
  And a single summary lists all 14 with pass/fail
  And any failure is named by hostname for fast triage
```

**Files:**
- `infra/verify.sh` — loops the roster, SSHes, runs doctor, summarizes.

### FR-5: Cloudflare Tunnel access for live demo (GOT-39)

Each box runs one `cloudflared` connector (baked, enabled) whose ingress rules
route `${host}-goto2026-*` hostnames — one label under the apex
`fluentworkshop.dev`, protected ones hash-obscured — to local services (noVNC
desktop, code-server, Supabase Studio, the OpenClaw gateway, SSH, Postgres).
Cloudflare terminates TLS at its edge; nothing listens on a public interface. The
instructor and students reach any box by browser URL — no client install for the
HTTP services, the `cloudflared` client for SSH/Postgres — without per-box
public-IP juggling. The token + salt are injected per instance via cloud-init
(`/etc/openclaw/tunnel.env`); the per-box `config.yml` is rendered at first boot.
DNS is NOT a fleet wildcard (that points every box at one tunnel); each box gets
explicit flat per-service CNAMEs to its OWN tunnel via `cloudflared tunnel route
dns` at clone time. Keeping every hostname one label under the apex lets the free
Universal SSL cert (`*.fluentworkshop.dev`) cover them, so no per-host cert hits
Certificate Transparency logs. Independent of the bake chain. (See loop-011.)

**Acceptance criteria:**

```gherkin
Given the instances are provisioned with their tunnel token + salt
When the openclaw-tunnel.service connector starts on first boot
Then each box's services are reachable at their ${host}-goto2026-* fluentworkshop.dev hostnames
  And public services (the dev server) use a bare -goto2026-app name
  And protected services are obscured by the hostname-derived hash
```

### FR-6: Reset-to-clean script (GOT-40)

`infra/reset.sh <hostname>` returns a wedged instance to clean classroom state in
under two minutes without re-baking or re-cloning.

**Acceptance criteria:**

```gherkin
Given a student has wedged their instance (corrupted config / runaway state)
When `infra/reset.sh <hostname>` runs
Then the agent's working dirs / config reset to the golden baseline
  And the instance is usable again in < 2 min
  And the reset does not require destroying/recreating the server
```

**Files:**
- `infra/reset.sh` — reset logic (snapshot-restore of agent state or rebuild-from-image, decision in D4).

---

## 6. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | `ccx33` — 8 **dedicated** vCPU / 32GB RAM / 240GB NVMe per instance. 32GB is required to hold the full lab stack (Xfce desktop + noVNC + SonarQube + Postgres + OpenClaw + browser automation); the earlier 4GB figure was a stale brief constraint that cannot hold this stack. Dedicated vCPU avoids noisy-neighbor jitter during the live demo. |
| **Reproducibility** | All clones byte-identical from one snapshot; `openclaw` pinned to 2026.6.5. |
| **Security** | No secrets in repo; keys 0600, agent-owned; agent does not run as root. |
| **Operability** | Hostnames spellable from verbal instruction; reset is one command. |
| **Readability** | Image setup followable by attendees — bash + cloud-init, no Ansible. |
| **Timeline** | All 14 verified green before Sun 2026-06-21 EOD (M1 dry-run gate). |

---

## 7. Risks & Assumptions

### Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| `openclaw@2026.6.5` unverified on ARM | Medium | Medium | Bake on x86; `ccx33` is x86 (Intel/AMD dedicated). Only move to ARM after a confirmed ARM smoke test. |
| `server_type` unavailable in `ash` | Medium | Low | `ccx33` confirmed available in `ash` (Hetzner API, 2026-06-19). The spec's original `cx22`/`cpx21` were undersized and are superseded by `ccx33`. |
| mise shims not resolving in systemd/non-interactive context | Medium | Medium | Symlink shims into `/usr/local/bin`; verify with a non-login `openclaw --version`. |
| Hetzner capacity/quota blocks 14-server create | High | Low | Pre-flight quota check (GOT-43) before clone apply. |
| Per-instance key mix-up (wrong key on wrong box) | Medium | Low | Drive injection from one roster→key map; verify in FR-3 acceptance. |
| Tight timeline (2 days) | High | Medium | Parallelize: GOT-39 (tunnel access) runs independent of the bake chain. |

### Assumptions

- Cedric's Hetzner project already has the SSH key `cedrics-macbook-pro-m4-max`.
- The Hetzner API token is supplied via env (`HCLOUD_TOKEN`) at apply time, never committed.
- 10 registered attendees + 4 buffer = 14 is the right count.
- The stock Ubuntu cloud-image `ubuntu` user (passwordless sudo, injected SSH key) is the agent user; the agent itself does not run as uid 0.
- `openclaw doctor --fix` + message-queue mode are sufficient student recovery tools in-class; `reset.sh` is the heavy fallback.

---

## 8. Design Decisions

### D1: Bake-once / clone-14 (snapshot) vs Ansible-managed fleet

**Options considered:**
1. Golden snapshot + cloud-init per-instance layer — reproducible, fast clone, readable.
2. Ansible/config-management run per box — flexible but opaque to attendees, slower, drift-prone.

**Decision:** Golden snapshot, cloned 14×, with cloud-init as the only per-instance layer.

**Rationale:** A 2-day-lifespan lab wants reproducibility over manageability. A snapshot is more reproducible than any re-run, and bash + cloud-init is readable by attendees who don't read Python/Jinja.

### D2: Node via mise (not NodeSource)

**Options considered:**
1. mise-managed Node + shims into `/usr/local/bin` — consistent with Cedric's dotfiles; one toolchain story.
2. NodeSource apt repo — simple but diverges from how Cedric manages Node everywhere else.

**Decision:** mise, with `mise use -g node@22` and shims symlinked into `/usr/local/bin`.

**Rationale:** Consistency with existing dotfiles. The shim symlink ensures systemd / non-interactive launchers resolve `node`/`openclaw` without needing `mise activate` in the environment.

**Future path:** A future class inherits the same mise toolchain story; bumping Node is a one-line pin change.

### D3: Stock `ubuntu` user with passwordless sudo; agent not root

**Options considered:**
1. Reuse stock cloud-image `ubuntu` user (passwordless sudo, SSH key already injected).
2. Create a dedicated `student` user and harden.

**Decision:** Reuse `ubuntu`. Throwaway boxes, no hardening needed — but the agent process is not uid 0.

**Rationale:** Less to bake, fewer moving parts, and the cloud image already wires sudo + SSH. Hardening is wasted effort on a 2-day box.

### D4: Reset strategy — agent-state restore vs full server rebuild

**Options considered:**
1. Restore agent working dirs/config from a baked baseline tarball (fast, in-place).
2. Destroy + recreate the server from snapshot (clean but slower, new IP / tunnel re-onboarding churn).

**Decision:** Default to in-place agent-state restore in `reset.sh`; keep rebuild-from-snapshot as the escalation path.

**Rationale:** In-place reset hits the <2-min target and avoids tunnel/IP churn mid-class. Rebuild stays available for a truly bricked box.

### D5: Hostname roster — spellable Gen-1 names

**Options considered:**
1. Curated Pokémon names chosen for unambiguous spelling under stress.
2. Generic `student-01..14`.

**Decision:** Curated roster (Abra, Ditto, Dragonite, Gengar, Jolteon, Lapras, Machamp, Meowth, Onix, Pikachu, Rapidash, Squirtle, Vaporeon, Vulpix).

**Rationale:** Named boxes make verbal support tractable ("Pikachu is wedged") and are more memorable than numbers. Names were filtered to drop spelling traps (dropped Eevee — collides with "Evie"; Charizard, Psyduck, Bulbasaur, Arcanine — misspelling risk).

---

## 9. File Breakdown

| File | Change type | FR | Description |
|------|-------------|-----|-------------|
| `dotfiles/bootstrap.sh` | Modify | FR-1 | Switch Node to mise + shims; keep idempotent. |
| `dotfiles/shell/zshrc` | New | FR-1 | Stripped classroom zsh profile. |
| `dotfiles/shell/zshenv` | New | FR-1 | PATH/env for non-interactive resolution. |
| `infra/terraform/main.tf` | Modify | FR-2 | `for_each` over roster from single test server. |
| `infra/terraform/clone.tf` | New | FR-2 | 14-clone config from snapshot image. |
| `infra/clone.sh` | New | FR-2, FR-3 | Render cloud-init per row (hostname + key). |
| `infra/cloud-init/template.yaml` | Modify | FR-3 | Confirm key path/permissions; tunnel.env (salt/token) hook. |
| `infra/verify.sh` | New | FR-4 | SSH each instance, run doctor, summarize. |
| `dotfiles/tunnel/` | New | FR-5 | cloudflared connector: config helper + unit baked; per-box `config.yml` first-boot rendered. |
| `infra/reset.sh` | New | FR-6 | In-place agent-state reset; rebuild escalation. |
| `docs/prd/PRD-001-student-exercise-infra.md` | New | — | This PRD. |

---

## 10. Dependencies & Constraints

- **Hetzner Cloud** — `hetznercloud/hcloud` Terraform provider `~> 1.49`; `HCLOUD_TOKEN` via env.
- **Region/type** — `ccx33` (x86, 8 **dedicated** vCPU / 32GB / 240GB NVMe) in `ash` — confirmed available via Hetzner API 2026-06-19, €0.266/hr. Supersedes the earlier `cpx21`/`cx22` (both undersized for the lab stack). NOTE: an earlier PRD draft labeled this "CCX43" next to 8 vCPU / 32GB specs — that was a mislabel; 8 vCPU / 32GB / 240GB is `ccx33`. `ccx43` is the larger 16 vCPU / 64GB SKU.
- **openclaw** — pinned `2026.6.5` (Cedric's known-good build).
- **Node** — 22 LTS via mise.
- **Cloudflare** — `fluentworkshop.dev` zone; a per-box `cloudflared` tunnel + token; flat per-service `${host}-goto2026-*.fluentworkshop.dev` CNAMEs to each box's own tunnel, created out-of-band via `cloudflared tunnel route dns` (NOT a fleet wildcard). `CLOUDFLARED_TOKEN` + `TUNNEL_SALT` injected via cloud-init (source from 1Password).
- **1Password** — `EVIE - Hetzner GOTO 2026 API KEY` + per-instance OpenClaw keys.

---

## 11. Rollout Plan

1. **GOT-35** — bake one test box (loop-001 Terraform → apply, human-gated), run bootstrap, snapshot. *(Terraform skeleton already plan-clean; apply needs token.)*
2. **GOT-39** — Cloudflare Tunnel onboarding in parallel (independent of bake chain; unblocks demos).
3. **GOT-36** — clone 14 from snapshot via `for_each`.
4. **GOT-37** — inject per-instance keys at clone time.
5. **GOT-38** — verify `openclaw doctor` green on all 14.
6. **GOT-40** — reset script, tested against a deliberately wedged box.
7. **Gate** — all 14 verified before Sun 2026-06-21 EOD.

---

## 12. Open Questions

| # | Question | Owner | Due | Status |
|---|----------|-------|-----|--------|
| Q1 | Final server_type — confirm SKU + RAM for the full lab stack | Cedric | 2026-06-20 | **Resolved:** `ccx33` (x86, 8 dedicated vCPU / 32GB / 240GB NVMe), x86 to avoid ARM risk on the pinned openclaw build. Earlier `cpx21`/4GB was a stale-brief constraint, superseded (Cedric, 2026-06-19). |
| Q2 | Tunnel onboarding — connector baked generic, token/salt injected per-clone via cloud-init? | Evie | 2026-06-20 | **Resolved (loop-011):** connector + config helper baked generic; `CLOUDFLARED_TOKEN` + `TUNNEL_SALT` injected via cloud-init; per-box `config.yml` first-boot rendered. |
| Q3 | Reset granularity — reset agent state only, or also clear shell history / scratch? | Cedric | 2026-06-20 | Open |
| Q4 | Per-instance OpenClaw keys — are these the same as the LLM API keys (GOT-41), or distinct OpenClaw creds? | Cedric | 2026-06-20 | Open |

---

## 13. Related

| Issue | Relationship |
|-------|-------------|
| GOT-35 Provision base Hetzner VPS image | This PRD's FR-1; head of the critical chain |
| GOT-36 Bake 14 named instances | FR-2; depends-on GOT-35 |
| GOT-37 Inject per-instance API keys | FR-3; depends-on GOT-36 |
| GOT-38 Verify openclaw doctor | FR-4; depends-on GOT-37; **blocks** exercises GOT-55→61 |
| GOT-39 Cloudflare Tunnel access | FR-5; independent, enables live demo |
| GOT-40 Reset-to-clean script | FR-6; enables in-class recovery |
| GOT-41 Procure 14 LLM API keys | depends-on / feeds FR-3 |
| GOT-42 Instance tracking sheet | consumes this pipeline's output |
| GOT-43 Procure Hetzner capacity | blocks FR-2 (clone apply) |
| GOT-44 API spend ceiling + alerting | parallel cost workstream |

---

## 14. Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-06-19 | Initial draft — anchors decisions from infra brief + loop-001 | Evie |
| 2026-06-19 | Q1 resolved: x86 `cpx21` locked (no ARM) | Evie |
| 2026-06-19 | Instance size corrected: `ccx33` (8 dedicated vCPU / 32GB / 240GB NVMe) per PRD §6 + Cedric. Fixed the stale 4GB/`cpx21` references and the "CCX43" SKU mislabel (8 vCPU/32GB = ccx33, not ccx43). | Evie |
| 2026-06-19 | loop-004 reconciliation vs canonical Notion PRD-001 v1.1: repo is a lean headless box; canonical spec is a full graphical lab (~6 of 9 FRs absent). Path 2 (hybrid, sequenced MVP-first) chosen. | Evie |
| 2026-06-19 | **4 blocking decisions resolved (Cedric):** (1) browser desktop **IN** — Xfce+noVNC+nginx basic-auth baked, per-student auth over the public access layer; (2) Anthropic **org sub-keys** — provisioned via admin API, per-key spend caps, revoked at teardown; (3) Discord **new dedicated server** — 14 channels + roles + per-student bot, nuked at teardown; (4) the public access layer + gateway auth **verified on the first Hetzner box** as a pass/fail gate before snapshot (access layer later switched to Cloudflare Tunnels — see 2026-06-20 below). | Evie |
| 2026-06-20 | **Access layer switched to Cloudflare Tunnels (loop-011).** Replaces the earlier VPN-based access approach: each box runs one baked `cloudflared` connector routing `${host}-goto2026-*.fluentworkshop.dev` hostnames (one label under the apex; protected ones hash-obscured) to local services (noVNC desktop, code-server, Supabase Studio, gateway, SSH, Postgres); Cloudflare terminates TLS at its edge. Token-based connector (no cert.pem); `CLOUDFLARED_TOKEN` + `TUNNEL_SALT` injected via cloud-init. Flat per-box CNAMEs (no fleet wildcard) so free Universal SSL covers them. code-server added to the bake. FR-5 + dependencies updated accordingly. | loop-011 |

---

## 15. Verification (Appendix)

1. On the bake box, run `sudo -u ubuntu env -i openclaw --version` (stripped env) → confirms shim resolution without `mise activate`.
2. `terraform plan` on the clone config shows exactly 14 to add, 0 to change, from the snapshot image ID.
3. After clone, `infra/verify.sh` prints 14/14 green; intentionally break one box and confirm it's named in the failure summary.
4. `ssh <host>-goto2026-ssh-<hash>.fluentworkshop.dev` (via the `cloudflared` client) reaches a box by name (not IP) for at least 3 random instances.
5. Wedge a box (corrupt `~/.openclaw/config`), run `infra/reset.sh <hostname>`, confirm agent works and elapsed < 2 min.
6. `git grep -nE '(hcloud|api[_-]?key|token)' -- . ':!*.lock.hcl'` returns no secret values in tracked files.
