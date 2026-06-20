# Loop 004 — PRD Reconciliation & Divergence Map

**Mode:** analysis only. The only file written is this `report.md`. No source
files in `dotfiles/`, `infra/`, or `docs/` were modified. No Terraform, hcloud,
SSH, or spend.

**Sources reconciled:**

- **Canonical** — `references/prd-lab-infrastructure.md` (Notion PRD-001 v1.1,
  "Masterclass Lab Infrastructure", fetched 2026-06-19). Cited below as **LAB**.
- **Discord** — `references/prd-discord-architecture.md` (Notion PRD-003). Cited
  as **DISC**.
- **Repo state** — `references/current-repo-state.md` (snapshot as of loop-003).
  Cited as **REPO** with the underlying file path.
- **In-repo PRD (drifted)** — `docs/prd/PRD-001-student-exercise-infra.md`, the
  lean headless version Evie wrote off a stale brief. Cited as **INREPO**.

**Headline:** the repo implements a _different product_ than the canonical PRD
specifies. The repo is a **lean headless agent box** (Terraform + bash bake +
cloud-init, SSH-only, mise/Node/openclaw, 14 Pokémon clones). The canonical PRD
specifies a **full graphical lab** (Ansible-provisioned, browser desktop, Docker
services, 9-key credential bag via Vault, Tailscale Funnel, 12 agent personas,
QR/Gist delivery). Of the 9 canonical functional requirements, the repo
meaningfully touches **one and a half** (FR-1 partial, FR-6 one key of nine);
the rest are absent or contradicted. If we baked and cloned the current image,
we'd ship the wrong box.

---

## Part A — Divergence Map

Status legend: **Present** (built, matches) · **Partial** (some of it exists) ·
**Absent** (nothing in repo) · **Contradicts** (repo made the opposite choice).

### Functional Requirements (LAB §5)

| Req      | One-line                                                                                      | Status                    | Evidence                                                                                                                                                                                        | Gap                                                                                                                                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FR-1** | Provision N Hetzner instances **via Ansible**, SSH in 3 min, write `inventory/instances.json` | **Partial / Contradicts** | `infra/terraform/main.tf` creates **one** `goto-test` server; `variables.tf` defaults `server_type=ccx33`, `image=ubuntu-24.04`, `location=ash`. `instances.txt` holds the 14-name roster.      | Mechanism contradicts: Terraform + bash, **not Ansible** (LAB D3). Only a single bake-test server exists — the 14-instance `for_each` clone config (INREPO FR-2, `clone.tf`) is **not yet written** (not in the file tree). No `inventory/instances.json`; roster lives in `instances.txt` instead. |
| **FR-2** | OpenClaw installed **+ workspace cloned + gateway on Funnel URL + Discord bot connected**     | **Partial**               | `bootstrap.sh:148-160` installs `openclaw@2026.6.5` via mise npm; `:323-330` verifies it resolves. `cloud-init/template.yaml` runs `openclaw doctor` on first boot.                             | Only the **binary** is installed. No masterclass workspace clone, no gateway running on a Tailscale Funnel URL, no Discord bot connection. Three of four FR-2 clauses absent.                                                                                                                       |
| **FR-3** | Docker CE + **SonarQube CE + Postgres** containers; openclaw user in `docker` group           | **Absent**                | `bootstrap.sh:75-84` installs only `curl git build-essential ca-certificates zsh tmux jq ripgrep unzip`. No Docker, no containers.                                                              | Entire FR absent. No Docker install, no SonarQube/Postgres, no docker-group membership.                                                                                                                                                                                                             |
| **FR-4** | **Browser desktop** at HTTPS URL with per-student user/password                               | **Absent / Contradicts**  | Nothing in repo. The bake is headless; INREPO §6 Readability NFR mandates "bash + cloud-init, no Ansible" and SSH-only access.                                                                  | No Xfce, no noVNC/Kasm/Guacamole, no web desktop, no per-student desktop auth. INREPO actively chose headless SSH-only — a direct conflict (see Part B-2).                                                                                                                                          |
| **FR-5** | **Tailscale Funnel** HTTPS for gateway + desktop; ACL `tag:student-instance`                  | **Absent**                | No Tailscale in `bootstrap.sh` or `cloud-init/template.yaml`. INREPO FR-5 plans an `infra/tailnet.sh` but it is **not in the file tree**.                                                       | No tailnet join, no Funnel, no ACL. INREPO's planned tailnet is for instructor SSH-by-name only — **not** the public HTTPS Funnel gateway LAB requires.                                                                                                                                             |
| **FR-6** | **9-key** service credential bag injected **via Ansible Vault**; nothing in git               | **Partial / Contradicts** | `cloud-init/template.yaml` injects **one** key — `OPENCLAW_API_KEY` → `/home/ubuntu/.openclaw/credentials/api-key` (0600, ubuntu-owned). INREPO FR-3 sources it from 1Password, never the repo. | Only 1 of 9 keys (Anthropic, Discord token+app ID, GitHub, Exa, Supabase, ElevenLabs, Cloudflare, SonarQube, Tailscale all absent). Injection is cloud-init + 1Password, **not Ansible Vault** (LAB D3/NFR). The "no secrets in git" intent **is** honored (INREPO §15 step 6 git-grep gate).       |
| **FR-7** | **12 named agent personas** (SOUL.md + Discord bot + avatar), assigned at provision           | **Absent / Contradicts**  | No `agent-personas/` dir, no SOUL.md anywhere. `instances.txt` uses **Pokémon hostnames** (abra…vulpix), not personas (Scout/Atlas/Wren…).                                                      | No persona definitions, no SOUL.md, no avatars, no Discord bot naming. The naming model differs entirely (Part B-5).                                                                                                                                                                                |
| **FR-8** | **QR → secret GitHub Gist** per student + printable QR card PDF                               | **Absent**                | Nothing in repo. INREPO §3 mentions students "have their QR/access sheet" in passing but builds no generator.                                                                                   | No `gen-credentials.ts`, no Gist creation, no QR card PDF.                                                                                                                                                                                                                                          |
| **FR-9** | Teardown playbook: destroy, **rotate keys, 48h handoff** via `swap-credentials.sh`            | **Absent**                | Nothing in repo. INREPO FR-6 plans `infra/reset.sh` but it is **not in the file tree**, and it is a _different concept_ (reset a wedged box in-class, not teardown/rotate/handoff).             | No teardown, no rotation queue, no 48h grace, no swap script, no cost report.                                                                                                                                                                                                                       |

### Non-Functional Requirements (LAB §6)

| NFR                 | Requirement                                | Status                         | Evidence                                                                                                     | Gap                                                                                                                                                                         |
| ------------------- | ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance spec       | "CCX43: 8 vCPU / 32GB / 240GB"             | **Present** (label bug in LAB) | `variables.tf` default `ccx33`, comment notes 8 dedicated vCPU / 32GB / 240GB confirmed in `ash` 2026-06-19. | Hardware matches. LAB's **"CCX43" label is wrong** — 8vCPU/32GB/240GB is `ccx33`; ccx43 = 16vCPU/64GB. INREPO already corrected this; LAB + DISC still mislabel (Part B-4). |
| Cost                | < $200 total (~$160)                       | **Partial**                    | INREPO targets the same envelope; ccx33 ≈ €0.266/hr.                                                         | No cost ceiling enforced in code; no teardown/cost-report (FR-9 absent). Conceptually aligned.                                                                              |
| Provisioning time   | All 10–12 ready < 10 min of one invocation | **Absent**                     | Single bake-test server only; no parallel multi-host provisioner.                                            | No 14-host one-command provision exists to time.                                                                                                                            |
| Desktop latency     | < 200ms input lag                          | **Absent**                     | No desktop.                                                                                                  | N/A until FR-4 exists.                                                                                                                                                      |
| Docker headroom     | SonarQube+Postgres ≤5GB; OpenClaw ≥20GB    | **Absent**                     | No Docker (FR-3 absent).                                                                                     | N/A until FR-3 exists.                                                                                                                                                      |
| Session isolation   | No cross-student desktop/Tailnet access    | **Partial**                    | Per-instance VMs give VM-level isolation.                                                                    | No Tailnet ACL (`tag:student-instance`), no desktop session isolation — both absent.                                                                                        |
| Credential security | No keys in git; **all via Ansible Vault**  | **Partial / Contradicts**      | "No keys in git" honored (INREPO §15 step 6).                                                                | Mechanism is cloud-init + 1Password, **not Ansible Vault**.                                                                                                                 |
| Iteration speed     | **Ansible** re-run on live host ≤ 5 min    | **Contradicts**                | INREPO ships an idempotent bash bake (`bootstrap.sh:19` `set -euo pipefail`, re-run-safe guards).            | Repo's idempotency is bash, not Ansible — opposite tool (Part B-1).                                                                                                         |

### Design Decisions (LAB §8, D1–D7)

| Dec    | Canonical decision                                                                                 | Status          | Evidence                                                                                                                                                      | Gap / conflict                                                                          |
| ------ | -------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **D1** | Per-student instances (10–12)                                                                      | **Present**     | `instances.txt` = 14 (10 + 4 buffer); INREPO D1 matches.                                                                                                      | Aligned. Count differs (14 vs 10–12) — buffer, not a conflict.                          |
| **D2** | Browser desktop solution TBD (noVNC/Kasm/Guacamole)                                                | **Absent**      | No desktop chosen or built.                                                                                                                                   | Repo never engages D2 — it dropped the desktop entirely rather than picking a solution. |
| **D3** | **Ansible** over shell scripts                                                                     | **Contradicts** | INREPO D1 + §6 Readability NFR explicitly choose "golden snapshot + bash + cloud-init … no opaque config-management layer (no Ansible/Jinja inside the box)." | Head-on contradiction (Part B-1).                                                       |
| **D4** | Single shared Tailnet with `tag:student-instance` ACLs                                             | **Absent**      | No Tailscale in repo; INREPO FR-5 (tailnet.sh) unbuilt and ACL-less.                                                                                          | No tailnet, no ACL model, no Funnel.                                                    |
| **D5** | QR → secret GitHub Gist                                                                            | **Absent**      | Not built.                                                                                                                                                    | No Gist/QR pipeline.                                                                    |
| **D6** | SonarQube self-hosted per instance (Docker)                                                        | **Absent**      | No Docker, no SonarQube.                                                                                                                                      | Entire decision unrealized.                                                             |
| **D7** | Pre-assigned personas (Scout, Atlas, Wren, Cedar, Nova, Dune, Echo, Fern, Coda, Lark, Sage, Crest) | **Contradicts** | INREPO D5 chose **Pokémon hostnames** for verbal spellability; no personas.                                                                                   | Different identity model (Part B-5).                                                    |

---

## Part B — Named Contradictions

These are genuine _opposed choices_, not just "not built yet."

**B-1 · Provisioning tool: bash bake vs Ansible.**

- _Repo:_ Terraform creates the VM; an idempotent bash `bootstrap.sh` bakes a
  golden snapshot that is cloned 14×; cloud-init does the per-instance layer.
  INREPO D1 + Readability NFR make non-Ansible a hard guardrail ("no Ansible/Jinja
  inside the box") so the image stays readable by attendees.
- _Canonical:_ LAB D3 chose Ansible (playbooks + roles + Vault) for idempotency,
  parallel multi-host runs, and credential injection. Entire LAB §9 file
  breakdown is `infra/ansible/*.yml`.
- _At stake:_ the whole provisioning architecture and ~10 playbooks' worth of
  work. This is the root contradiction most others descend from. Note both
  approaches deliver idempotency — the real divergence is Vault, parallel
  multi-host config, and the readable-image guardrail.

**B-2 · Desktop: headless SSH-only vs browser desktop.**

- _Repo:_ headless. The student UX is `ssh <name>` (INREPO §3, FR primary use case).
- _Canonical:_ LAB FR-4 + the primary persona (LAB §3) require a **no-install,
  no-SSH, browser-desktop** experience — scan QR → URL → login → graphical desktop
  in <30s. This is the headline student-facing promise.
- _At stake:_ the entire student access model, plus the desktop-streaming stack
  (Xfce + noVNC/Kasm/Guacamole) and its auth. The repo's lean sizing rationale
  even _cites_ this stack ("32GB required to hold Xfce + noVNC + SonarQube + …",
  INREPO §6) while building none of it.

**B-3 · Agent user: stock `ubuntu` vs a dedicated `openclaw` user.**

- _Repo:_ INREPO D3 reuses the stock cloud-image `ubuntu` user; `bootstrap.sh:29`
  bakes `AGENT_USER=ubuntu`, key path `/home/ubuntu/.openclaw/...`.
- _Canonical:_ LAB FR-3 repeatedly references "the OpenClaw process user" / "the
  `openclaw` user in the `docker` group" — implying a named service account, not
  the generic `ubuntu`.
- _At stake:_ low-effort but real — FR-3's docker-group grant, FR-6's config paths,
  and persona wiring all assume a known service user. Needs a one-line decision so
  paths don't drift.

**B-4 · SKU label: "CCX43" (LAB/DISC) vs `ccx33` (actual hardware). DOC BUG.**

- LAB §4/§5/§6 and the DISC NFRs call the 8vCPU/32GB/240GB box "CCX43." That SKU
  is wrong: Hetzner `ccx43` is **16 vCPU / 64GB**; **8 vCPU / 32GB / 240GB is
  `ccx33`**. INREPO already fixed this (`variables.tf` comment + changelog).
- _Action (doc-only, a later loop):_ correct "CCX43" → "ccx33" in **both** the
  canonical LAB PRD and the in-repo PRD's residual references, and in any DISC
  copy. Flagged here, not fixed (analysis-only).

**B-5 · Identity model: Pokémon hostnames vs agent personas.**

- _Repo:_ 14 Pokémon hostnames (INREPO D5) chosen for unambiguous verbal spelling
  ("Pikachu is wedged").
- _Canonical:_ LAB D7 + DISC require 12 _personas_ (Scout, Atlas, Wren…) each with
  a SOUL.md, a named Discord bot, an avatar, and a workspace channel
  (`#scout-workspace`).
- _At stake:_ these are orthogonal axes (a box can be `pikachu` _hosting_ persona
  `Scout`) but the repo only has the hostname axis. The persona axis — the
  student-facing identity, SOUL.md, and the entire DISC Discord layer — is absent.
  Needs reconciliation: keep Pokémon as infra hostnames, add personas on top, or
  rename to personas.

**B-6 · Scope: lean agent host vs full lab (quantified).**

- Of **9 canonical FRs**: FR-1 partial (wrong tool, single server), FR-2 partial
  (binary only, 1 of 4 clauses), FR-6 partial (1 of 9 keys). **FR-3, FR-4, FR-5,
  FR-7, FR-8, FR-9 are absent.** → ~**6 of 9 FRs untouched**, the other 3 only
  fractionally met.
- The **entire DISC PRD (PRD-003)** — guild, 14 channels, role model, bot perms,
  per-instance channel config, posting rules, day-of onboarding — is **0%** in repo.
- _At stake:_ this is not drift to patch; it's a scope gap of a second whole system.

**B-7 · Credential injection: cloud-init + 1Password vs Ansible Vault.**

- _Repo:_ one key via cloud-init `write_files`, sourced from 1Password at clone time.
- _Canonical:_ LAB FR-6 + Credential-security NFR mandate the full 9-key bag via
  **Ansible Vault**, written to OpenClaw config + companion-app `.env`.
- _At stake:_ the secrets mechanism and 8 missing keys. The shared _principle_ (no
  secrets in git) is honored by both — only the tool and the bag size diverge.

**B-8 · Reset vs teardown (concept gap, not opposed).**

- INREPO FR-6 `reset.sh` = restore a wedged box mid-class. LAB FR-9 = post-conference
  destroy + rotate + 48h handoff. Different lifecycles; both are needed; neither is
  built. Listed so they aren't conflated in the rescope.

**B-9 · Internal contradictions inside the canonical PRD itself (flag for Cedric).**

- LAB §1 says the masterclass is **"June 22, 2026"** but LAB §11 rollout says
  **"Monday June 23 (class)"** and the QR metric (§2) targets **"8:00 AM June 23."**
  The class date is internally inconsistent in the canonical PRD. (Today is
  2026-06-19; dress rehearsal Sat Jun 21 is fixed.) Ties to open question Q3.
- INREPO's gate is "Sun 2026-06-21 EOD (M1 dry-run)"; LAB's dress rehearsal is also
  Sat Jun 21 — these align, but the _class_ date needs Cedric to settle.

---

## Part C — Rescope Proposal

Today is **2026-06-19** (Fri). Dress rehearsal **Sat Jun 21**; class **Jun 22 or
23** (unresolved, B-9). That is **~1–2 working days** to first live use. Budget
< $200. The gap is large enough that "finish the PRD" is not achievable on this
timeline — Cedric needs to pick how much lab to ship.

### Path 1 — Honor the canonical PRD fully (Ansible + all 9 FRs)

- **What survives from repo:** the Hetzner/Terraform resource-creation knowledge,
  the ccx33 sizing decision, the openclaw/Node/mise version pins, the roster, and
  the "no secrets in git" discipline. The **bash bake is largely thrown away** in
  favor of Ansible roles.
- **Effort:** rebuild provisioning as ~10 Ansible playbooks (LAB §9) + desktop
  stack + Docker/SonarQube/Postgres + Vault 9-key bag + personas + Discord (all of
  PRD-003) + QR/Gist + teardown. Realistically **days-to-weeks**, not hours.
- **Deadline risk:** **Severe.** Cannot land a tested full lab by Sat Jun 21.
  Would blow past the dress rehearsal with an unproven stack.
- **First steps:** scaffold `infra/ansible/`, port the bake into `configure.yml`,
  pick the desktop solution (Q1), stand up Vault.
- **Verdict:** infeasible on the stated deadline.

### Path 2 — Hybrid: keep Terraform for resources, add a config layer (RECOMMENDED)

- **What survives:** _everything in the repo._ Terraform keeps creating Hetzner
  boxes; the bash bake / golden snapshot stays as the base image; cloud-init keeps
  the per-instance layer. We **add** a thin config layer on top for the lab
  services — either extend the existing bash bake (fastest, keeps the
  readable-image guardrail) or introduce Ansible _only_ for the day-of credential
  and Discord wiring (honors D3 where it pays off, Vault).
- **Effort:** medium, and **incremental** — each FR can be added to the working
  base without a rewrite. Desktop (FR-4) and Docker/SonarQube (FR-3) are the two
  big additions; everything else is scripting on a known-good box.
- **Deadline risk:** **Manageable** if scope is sequenced (desktop + Docker first,
  personas/Discord next, QR/teardown last). The golden-snapshot model means the
  expensive bits are baked once, then cloned — which fits the deadline.
- **First steps:** (1) decide bash-extension vs Ansible-for-config with Cedric;
  (2) add Xfce + noVNC + nginx basic-auth to the bake (closes the FR-4 default per
  LAB D2 risk row); (3) add Docker + SonarQube/Postgres to the bake (FR-3).
- **Verdict:** best balance — salvages loops 001–003, reaches the canonical target
  by addition, and lets Cedric stop at any FR boundary if time runs out.

### Path 3 — Minimum-viable-for-class (smallest subset that makes the 2h exercise work)

- **Premise:** the exercise runs _through Discord_ (DISC §1). The truly load-bearing
  pieces for a 2-hour class are: a running OpenClaw agent per student (FR-2), the
  credentials it needs (FR-6, at least Anthropic + Discord), Discord channels
  (PRD-003), and _some_ way in. The browser desktop (FR-4) is the most expensive
  promise and is arguably **optional** if students steer via Discord, not a desktop.
- **What ships:** repo's bake + clone (FR-1/FR-2 finished) → workspace clone +
  gateway → minimal credential injection (Anthropic + Discord per box) → Discord
  guild/channels/personas (PRD-003 core) → tailnet for instructor SSH. **Cut for
  post-provision:** browser desktop (FR-4), SonarQube (FR-3/D6), QR/Gist polish
  (FR-8 → plain credential sheet instead), full 9-key bag (inject only what the
  exercise touches), teardown automation (FR-9 → manual destroy).
- **Effort:** lowest; mostly finishing the repo's own INREPO FR-2..FR-5 plus a
  Discord setup script.
- **Deadline risk:** **Lowest** — achievable for Sat Jun 21 if started now.
- **Cut list is explicit:** no in-browser desktop (SSH/Discord only), no SonarQube,
  no QR cards (printed sheet), no auto-teardown. These become Sunday/post-class work.
- **Verdict:** the safe floor if Path 2 slips.

**Recommendation: Path 2, sequenced so that Path 3's MVP subset lands first.**
Build the hybrid on top of the working repo, but order the work as Path 3 — agent +
credentials + Discord before desktop + SonarQube — so that at every checkpoint
there is a class-ready box. If time holds, keep adding FRs toward the canonical
target; if it slips, you stop at the MVP line having lost nothing. This requires
Cedric to settle: **(a) is the browser desktop in or out for class day?** and
**(b) bash-extension or Ansible for the config layer?**

---

## Part D — Open Questions (blocking vs deferred for the rescope)

The canonical PRD's 8 open questions (LAB §12), classified by whether they block
the rescope decision. Not answered here — surfaced for Cedric.

**Blocking (the rescope can't proceed cleanly without these):**

- **Q1 — Browser desktop solution (noVNC/Guacamole/Kasm).** Gates FR-4 entirely
  and is the single biggest scope/effort lever. Path 2 vs Path 3 hinges on whether
  the desktop is in scope at all. LAB D2 default (noVNC + nginx basic-auth by Fri
  Jun 20) is already overdue — **decide now or cut it.**
- **Q4 — Anthropic keys: per-student or org sub-keys.** Gates FR-6 / FR-2 — the
  agent can't run without its key. Needed for even the Path 3 MVP.
- **Q5 — Discord server: new or existing Spantree server.** Gates PRD-003 in full
  and FR-7 personas/bots. The exercise runs through Discord, so this blocks the MVP.
- **Q7 — Tailscale Funnel + OpenClaw gateway auth confirmed.** Gates FR-2/FR-5 (the
  gateway-on-Funnel access path). If Funnel is unconfirmed, the access model for
  every path is at risk.

**Deferrable (won't block starting the build; resolve in parallel):**

- **Q2 — Hetzner vs DigitalOcean.** Effectively settled in practice: the repo runs
  on Hetzner ccx33, confirmed available in `ash`. Treat as closed unless Cedric
  reopens.
- **Q3 — Exact conference end date.** Affects cost ceiling and FR-9 teardown timing
  only, not the build. (Also ties to the class-date inconsistency in B-9 — worth
  settling, but not build-blocking.)
- **Q6 — OpenAI/Codex inclusion.** Additive (one more key); defer past MVP.
- **Q8 — ElevenLabs shared vs per-student.** A single credential-bag detail; defer.

**DISC PRD open questions** (DISC §12 Q1–Q6) become live the moment Path 2/3 reaches
the Discord layer — notably **DISC-Q5** (one bot app per student vs one shared bot),
which the DISC PRD itself flags as gating browser-automation effort. Deferred until
the Discord build starts, but Cedric should pre-empt Q5 since it shapes provisioning.

---

## Completion

All four parts present; every status cited to a PRD section or repo file. No source
files modified — `git status` shows only this `report.md` and the loop's
`references/` folder added. No code written, no spend, no servers touched. Next
step is **Cedric's** path choice (Part C) and the four blocking answers (Part D) —
the build itself is a later, gated loop.
