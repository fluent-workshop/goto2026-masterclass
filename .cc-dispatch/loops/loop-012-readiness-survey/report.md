# Loop 012 — Masterclass Readiness Survey

**Survey run:** Sun 2026-06-21, ~1pm CDT (~20h to showtime).
**Showtime:** Mon 2026-06-22, 9am–5pm CDT, Slalom / Aon Center, Chicago.
**Mode:** read-only reconnaissance. No source or infra modified.

---

## 1. Traffic-light status

| Component         | Status | One-line                                                                                                                                 |
| ----------------- | :----: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Infra**         |   🔴   | Golden image baked + 1 test box up, but it predates loop-011 (no tunnel/firstboot); 0/14 student boxes exist; no creds provisioned.      |
| **Companion App** |   🟡   | Backend scaffold + seed data work; frontend intentionally blank (live-build); no deploy artifact, not deployed.                          |
| **Slides**        |   🔴   | Slidev scaffold + layouts/components healthy, but `slides/slides.md` is ~5 placeholder slides — **zero real content**.                   |
| **Content Repo**  |   🟢   | basic-memory research KB (113 + session pages) + pre-workshop survey; SETUP.md complete. Instructor material, ready.                     |
| **Linear Board**  |   🟡   | Projects/milestones reachable; the Linear CLI has **no `issues` command**, so per-state open/done counts + assignees couldn't be pulled. |

Overall: **🔴 not ready** — two red components (infra fleet, slide content) are on the critical path for tomorrow.

---

## 2. Per-phase findings

### Phase A — Linear (GOT team)

- **Tooling limit:** `linear.ts` exposes `teams, projects, states, labels, milestones, cycles, create-*, update-*` — **no `issues` command**. Open-vs-done counts, assignees, and blocked flags per issue are **not retrievable** with this CLI. Flagging rather than guessing.
- **GOT projects (all `backlog` state):** Companion App Dry-Run, GOTO Chicago 2026 Sessions, Media Analysis, evie-agent library, Vermeulens Proposal, Daily Briefing, Trellis, [Vermeulens] Risks/Owners/Mitigations.
- **Milestones:** "GOTO Chicago 2026 Sessions" → **M1 Dry-run ready** (1 milestone). "Companion App Dry-Run" → none.
- Recent site commits reference GOT-147/149/151 (slide layout/component work), so issue tracking is active there.

### Phase B — Infra

**Loop reports 001–011 (no 010):** all carry a `report.md`; bake/desktop/docker/cloud-init/tunnel work is **complete in the repo** (latest `8513592`, cloudflared pinned 2026.6.1, gateway port confirmed).

**Test box `goto-test` (87.99.153.105, ccx33), live SSH:**

- ✅ Running: `openclaw-desktop-vnc` (TigerVNC :1), `openclaw-desktop-novnc` (websockify :6080), nginx (:8080), Docker `sonarqube` + `db` both **healthy** (up 37h). OpenClaw **2026.6.5** on PATH.
- 🔴 **Box predates loop-011 + firstboot.** Installed units are only `openclaw-desktop-{vnc,novnc,cred}` + `openclaw-services`. **No `openclaw-tunnel`, no `openclaw-firstboot`, no `/etc/cloudflared`.** cloudflared inactive/absent. → The committed tunnel + git-identity work is **not on the snapshot this box came from**; a **re-bake + re-snapshot is required** before it reflects the current repo.
- 🔴 **No credentials:** `/etc/nginx/.htpasswd` absent, `/etc/openclaw/` empty (no `desktop.env`, no `tunnel.env`). Desktop fails closed (401). OpenClaw API key not injected.
- ⚠️ nginx binds `0.0.0.0:8080` (public) — currently safe only because it fails closed; the tunnel model (loopback-only) is not yet applied here.
- Disk fine (7.9G/225G).

**Fleet:** `hcloud` CLI **not installed locally** → could not confirm via API. Per `instances.txt` + session-state, **only `goto-test` exists; 0/14 student boxes provisioned.** `infra/clone.sh` is ready (renders per-instance cloud-init; needs OpenClaw API keys, TUNNEL_SALT, CLOUDFLARED_TOKEN, POSTGRES_APP_PASSWORD — fleet-wide secrets from 1Password, plus out-of-band per-box Cloudflare CNAMEs).

### Phase C — Companion App (`goto-accelerate-companion`)

- Bun + TypeScript. Scripts: `dev` (`bun --watch src/server.ts`, :3000), `dev:client`, `migrate`, `seed`, `scrape`. Deps: `@anthropic-ai/sdk` ^0.51.0, `postgres` ^3.4.5.
- ✅ `migrate` + `seed` ready: 4 tables, **32 speakers / 31 sessions** in `data/*.json`. Defaults to `postgresql://postgres:postgres@localhost:5432/goto_companion` (override `DATABASE_URL`).
- `.env.example`: `DATABASE_URL`, **`ANTHROPIC_API_KEY` (secret)**, `PORT`. Only the Anthropic key is a true secret.
- ⚠️ **No Dockerfile / compose / deploy script / wrangler.** Not deployed anywhere. Manual deploy = Bun + Postgres + `createdb` + migrate + seed + env.
- ⚠️ **Frontend `client/src/` is empty by design** — built live in-class. `dev:client` would fail today; that's expected.
- Runs fine against the box's existing Postgres. 1 commit (Jun 16), `base44-original/` untracked.

### Phase D — Slides / Site (`goto-2026-masterclass-site`)

- 🔴 **`slides/slides.md` ≈ 5–6 slides, 100% Slidev template boilerplate** (cover / section / key-points / two-col / code / thanks). No masterclass material.
- Framework Slidev 51.8.1; monorepo (landing + slides + docs). `docs/docs/` = `intro.md` only.
- ✅ Build infra healthy: `bun.lock` + node_modules present, `build` = landing+slides+docs, no obvious import breakage; clean tree, **23 commits ahead of origin** (active layout/component work — GOT-147/149/151, last commit Jun 21 01:49).
- Deploy: `wrangler.jsonc` (project `goto-2026-masterclass-site`, out `./dist`); GHA deploy **disabled** in favor of Cloudflare native Git integration (auto-deploy on push). No live URL confirmed in README.

### Phase E — Content Repo (`…-from-code-assistants-to-autonomous-agents`)

- 🟢 A **basic-memory research knowledge base**, not student exercises. `context/memory/research/evp/` = 113 prior EVP research pages (agent-runtimes, memory-systems, data-eng, deployment, security, discord, orchestration) + `goto-sessions/` masterclass research.
- `scripts/setup.sh` (prereq-check → `direnv allow` → `.envrc.local` → `basic-memory project add` → reindex + Gemini embeddings → doctor). `scripts/export-evie-research.ts` re-exports from Notion.
- `survey/build_survey_form.gs` — Apps Script that builds the red-teamed **pre-workshop survey** (last commit Jun 18).
- **SETUP.md complete** — but it's the **instructor's** local setup (direnv, uv/uvx, Node, Google API key for embeddings). **Not** a student-facing class setup guide.

---

## 3. Blocking items (must happen today for tomorrow to work)

| #   | Blocker                                                                                                                                                                                     |     Est.     | Notes                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | ------------------------------------------------------------------------------------------------ |
| B1  | **Author real slide content** in `slides/slides.md` (currently ~5 placeholder slides).                                                                                                      |   **4–8h**   | Largest risk. Layouts/components exist; the _content_ does not. Human-led, not a loop.           |
| B2  | **Re-bake golden image** to include loop-011 (tunnel) + firstboot, then re-snapshot.                                                                                                        |  **1–1.5h**  | Test box predates this code. Must precede any clone or the fleet ships without tunnels/identity. |
| B3  | **Provision 14 student boxes** (terraform `for_each` from new snapshot) + inject per-instance keys + `openclaw doctor` verify.                                                              | **1.5–2.5h** | Needs `hcloud`/terraform + Hetzner token; `clone.sh`/`verify.sh` ready. 0/14 exist now.          |
| B4  | **Stand up fleet secrets + Cloudflare tunnels:** TUNNEL_SALT, CLOUDFLARED_TOKEN, POSTGRES_APP_PASSWORD (1Password) + per-box `cloudflared tunnel route dns` CNAMEs + per-box desktop creds. |   **1–2h**   | Without these, desktop fails closed and no public access path exists.                            |
| B5  | **Decide + provision student access creds** (SSH path + OpenAI key per student — both flagged open in `ONBOARDING-NOTES.md`).                                                               |   **1–2h**   | If the class uses Codex/CC blind review, OpenAI keys are on the critical path.                   |

(≥3 blockers identified with estimates — green gate met.)

## 4. Nice-to-have (improves class, not blocking)

- Deploy the companion app to one box as a **reference/demo backstop** (Postgres already healthy on the box; needs `createdb goto_companion` + migrate + seed + `ANTHROPIC_API_KEY`). ~30–45m.
- Add a Dockerfile/compose to the companion app for repeatable deploys. ~30m.
- Confirm the site is actually live on Cloudflare Pages (push triggers auto-deploy) + capture the URL. ~15m.
- Populate `docs/docs/` beyond `intro.md` with a student quickstart. ~1h.
- Pre-clone the companion repo + `bun install` into the bake so students don't pull over conference Wi-Fi. ~30m (folds into B2).

## 5. Recommended background loops for today's breaks

1. **loop-013 — re-bake + snapshot** (B2): run `bootstrap.sh` on a fresh box (or `--force` re-bake goto-test), confirm `openclaw-tunnel` + `openclaw-firstboot` enabled, snapshot. _Human-gated apply._
2. **loop-014 — clone-14 + verify** (B3): terraform apply 14 from the new snapshot, `clone.sh` per-instance creds, `verify.sh` until 14/14 `openclaw doctor` green. _Depends on B2 + Hetzner token._
3. **loop-015 — companion deploy backstop** (nice-to-have): deploy companion to one box, seed DB, smoke-test :3000.
4. **Slide content (B1)** — **human-led, not a loop** (judgment/teaching content). Could pair with an agent for layout fill-in once an outline exists.

> Sequencing: **B2 → B3 → B4** are a hard chain (snapshot before clone before tunnel-route). B1 (slides) and B5 (student creds) run in parallel to the infra chain. If time is short, the minimum viable demo is: **one re-baked box with a working tunnel + the companion app deployed**, with the 14-box fleet as the stretch goal.

---

## Caveats / couldn't verify

- **Linear issue-level data** (open/done counts, assignees, blocked) — CLI has no `issues` command.
- **14-instance existence** — `hcloud` CLI not installed locally; inferred absent from `instances.txt` + session-state, not confirmed via API.
- Build/deploy of the site were **not executed** (read-only); "build should pass" is a static read, not a run.
