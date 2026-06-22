
## Student onboarding — open items (captured during grill, 2026-06-20)

- [ ] **VS Code Remote SSH path.** Students will likely connect via VS Code Remote-SSH, not only the browser desktop. Requires a real SSH way in for an unknown student laptop:
  - Box currently trusts only baked keys (Cedric's + automation host). A student has no SSH credential.
  - Options: (a) generated per-student SSH keypair on the QR/Gist card, (b) SSH password on the card, (c) student pastes their own pubkey via the desktop terminal first.
  - Reshapes the credential card contents (FR-8) and the onboarding doc. TRACK.

- [ ] **OpenAI account/key needed (Cedric).** Codex CLI is now baked (Q2 → both CC + Codex), so the credential bag needs an OpenAI API key per student. This also reverses PRD Q6 (OpenAI/Codex was "deferred") — now IN scope. Drives: a new key in the 9→10-key bag, and an OpenAI org/account set up to mint per-student keys (same org-sub-key model as Anthropic). Reason: students replicate Cedric's code-review workflow (CC + Codex + SonarQube blind review).

## Companion app stack (Q3, from reading ~/src/spantree/gtsee)

Stack = gtsee-like: **Vite + React + TS on Bun**, Tailwind, Playwright (desktop+mobile chromium), Cloudflare Pages+Functions (Wrangler), SonarQube — **but Supabase Postgres** instead of Cloudflare D1+Vectorize.

Bake additions needed (companion-app runtime layer):
- [ ] **Bun** (pin `1.2.23`) — primary runtime/PM (mise has bun; add it).
- [ ] **Wrangler** (Cloudflare Pages/Functions) — `bun add -g wrangler` or per-repo dep.
- [ ] **Supabase CLI** — local dev / migrations against Supabase.
- [ ] **Playwright + browser binaries** — `playwright install --with-deps chromium` (heavy: ~adds browsers + apt deps; decision pending Q4). Doubles as the OpenClaw browser-automation Chromium.
- [ ] **Pre-clone the companion repo + `bun install` at bake time** so students don't `install` over conference Wi-Fi. (Need the repo URL — the Supabase variant, not gtsee itself.)
- [ ] Node 22 already baked (mise); Bun is additive.
- [ ] OPEN: which repo is the Supabase variant? gtsee is D1-based; need the forked/companion repo URL to pre-clone.

## Browsers (Q4)
- [ ] **Playwright Chromium** (`playwright install --with-deps chromium`) — e2e test runner for the companion app + OpenClaw browser automation. Baked in (not lazy).
- [ ] **Google Chrome (stable)** — real Chrome via Google's apt repo, for the desktop browser students actually click around in (inspect the running app) AND OpenClaw's `profile="chrome"` extension-relay path if used. Distinct from Playwright's bundled Chromium.
- [ ] Skip Firefox/WebKit (gtsee only tests Chromium).
- Note: both baked into snapshot; weight trivial on 240GB ccx33.

## Shell / CLI quality-of-life (Q5) — LEAN classroom set
Bake (terminal niceties): fzf, eza, bat, fd, gh, starship prompt, oh-my-zsh base (+ jq, ripgrep, tmux already in). The lean classroom zsh profile from loop-002 stays the base.
Leave OFF (infra-mgmt, student boxes don't do cloud ops): kubectl, helm, k9s, kubectx/kubie, awscli, terraform, terragrunt, pulumi, doctl, eksctl, the full 30-tool mise loadout.
Line: makes a terminal pleasant = yes; manages external infra = no.

## Q5 amendment — add cloud/app CLIs we ACTUALLY use
On top of the lean shell set, bake the management CLIs the companion-app stack uses:
- [ ] **Supabase CLI** (DB/migrations — already noted in Q3)
- [ ] **Wrangler / Cloudflare CLI** (Pages/Functions deploy — already noted in Q3)
- Line revised: terminal niceties + the CLIs for THIS stack's services (Cloudflare, Supabase) = yes; generic k8s/cloud loadout (kubectl/helm/aws/terraform/pulumi) = still no.

## Q6 — pre-seed OpenClaw workspace with INSTRUCTION-ONLY skills first
Pre-seed each box's OpenClaw with skills, but START with instruction-only ones (no API keys / MCP / OAuth / retooling-in-flight). EXCLUDE the ones being retooled now: notion, exa, research.

Recommended instruction-only seed set:
- humanizer (+ humanizer-tts/-slack if present) — writing quality, used everywhere
- grill-me — structured interview/decision walking
- adhd — parallel divergent ideation
- skill-creator — students author their own skills (very on-theme for the class)
- scripting — scripting conventions
- specdocs — RFD/PRD/ADR authoring
- wardley-mapping — strategy maps
- product-manager — discovery/prioritization framing
- cc-dispatch — delegate to Claude Code loops (core to the "autonomous agents" thesis)
- code-review — IS instruction+tooling, but tooling (CC/Codex/SonarQube) is all baked → include
- secret-scan — TruffleHog redaction (pairs with the credential exercises)
Candidates to consider: tts (needs ElevenLabs key → defer), diagram-maker, presentation/trellis (Slidev — heavy), grammarly (browser-automation, needs login → defer).
OPEN: confirm with Cedric which subset; flag the humanizer chain as highest-value.

## Q6 — Pre-seeded OpenClaw skills (LOCKED)
Seed set: humanizer (SKILL.md + TTS.md only, NOT SLACK.md — personal voice analysis) · grill-me · adhd · skill-creator · cc-dispatch · code-review · secret-scan · specdocs · scripting · product-manager
Wardley-mapping: DEFERRED — decide later.
Skills land in skills/ folder in the goto-2026-masterclass repo.
Pre-review removals before committing: humanizer/SLACK.md (personal Slack voice analysis), cc-dispatch/config.json (personal Discord bot ID).
Blind review (CC + Codex) running before commit — will catch remaining personal refs.
NOTE: cc-dispatch + adhd + secret-scan contain TypeScript — SonarQube is relevant; flag for post-review consideration.
