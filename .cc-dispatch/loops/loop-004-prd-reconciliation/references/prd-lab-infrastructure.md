# Masterclass Lab Infrastructure

Source: https://app.notion.com/p/3832e80c997d813cb5f7cf5b66d27fdc

Here is the result of "view" for the Page with URL https://app.notion.com/p/3832e80c997d813cb5f7cf5b66d27fdc as of 2026-06-18T23:51:36.326Z:
<page url="https://app.notion.com/p/3832e80c997d813cb5f7cf5b66d27fdc">
<ancestor-path>
<parent-data-source url="collection://cb519d29-a4cd-4b3b-a88c-b80f11732c41" name="Masterclass PRDs"/>
<ancestor-2-database url="https://app.notion.com/p/d892a3df0ecf43e8bba9795e1d8d037d" title="Masterclass PRDs"/>
<ancestor-3-page url="https://app.notion.com/p/3812e80c997d80e28de8dff407a30eee" title="Masterclass: From Code Assistants to Autonomous Agents"/>
<ancestor-4-page url="https://app.notion.com/p/07f2e80c997d82fb85d481d5f8f96df7" title="Cedric’s GOTO 2026 Sessions"/>
</ancestor-path>
<properties>
{"Name":"Masterclass Lab Infrastructure","Owner":"Cedric Hurst","PRD":"PRD-001 v1.1","Status":"Draft","date:Date:is_datetime":0,"date:Date:start":"2026-06-18","url":"https://app.notion.com/p/3832e80c997d813cb5f7cf5b66d27fdc"}
</properties>
<content>
```yaml
title: "Masterclass Lab Infrastructure"
prd: PRD-001
status: Draft
owner: "Cedric Hurst"
issue: "N/A"
date: 2026-06-18
version: "1.1"
```
# PRD: Masterclass Lab Infrastructure
---
## 1. Problem & Context
The GOTO Chicago masterclass (June 22, 2026) includes a \~2-hour hands-on exercise where 10–12 students each steer their own OpenClaw agent instance via Discord to build features on a companion app. Each student needs a dedicated cloud VM with the full OpenClaw stack pre-configured — agent runtime, browser automation, local databases, Docker-managed services — and a browser-accessible desktop reachable from the conference venue without any local install.
Beyond class day, instances live from Saturday June 21 through the end of the GOTO conference (\~Thursday June 26) so students can keep working with their agent during the conference week. Post-conference, students who want to keep their instance swap in their own API keys; others get credentials rotated and instances destroyed.
Two credential layers exist: (1) instance access credentials (desktop login, SSH, Tailscale gateway URL + token) and (2) a per-student service credential bag (Anthropic, Discord, GitHub, Exa, Supabase, ElevenLabs, Cloudflare, SonarQube) injected at provision time and rotated at teardown. Students are not known in advance, so instances are pre-assigned named agent personas that students "adopt" and customize during the session.
---
## 2. Goals & Success Metrics
```plain text
Goal | Metric | Target
**Instances live before dress rehearsal** | All 10–12 instances SSH-accessible | By 10:00 AM Saturday June 21
**Browser desktop access** | Student scans QR, opens URL, logs in, sees desktop | < 30s from login
**Per-student QR credential card** | Unique secret gist URL per student, printed as QR | Ready by 8:00 AM June 23
**Full service stack running** | OpenClaw + Docker containers healthy on each instance | Verified before class
**Cost ceiling** | Total cloud cost Saturday → conference end | < $200
**Teardown** | Instances destroyed, credentials rotated | Within 24h of conference end
```
---
## 3. Users & Use Cases
### Primary: Workshop Participant
> As a workshop participant, I want to scan a QR code, open a URL in my browser, enter my credentials, and immediately access a running OpenClaw desktop — no install, no SSH, no configuration.
\*\*Preconditions:\*\* Participant has a laptop with a modern browser and conference Wi-Fi access.
### Secondary: Instructor
> As the instructor, I want to provision all student instances with a single Ansible command on Saturday, verify them, and tear them down with a single command at conference end — with zero infrastructure work during the class itself.
### Future: Student Taking Over Their Instance
> As a student who wants to keep their agent after the workshop, I want to run a credential-swap script that replaces the class API keys with my own so that I have a persistent personal OpenClaw setup.
---
## 4. Scope
### In scope
1. \*\*Per-student VPS provisioning\*\* — 10–12 Hetzner CCX43 instances (32GB RAM, 8 dedicated vCPU) via Ansible + hcloud, alive Saturday June 21 → conference end
2. \*\*Full OpenClaw stack\*\* — agent runtime, masterclass workspace, Discord integration, browser automation, skills
3. \*\*Docker-managed services\*\* — SonarQube Community Edition, Postgres; OpenClaw user in \`docker\` group for agent-driven container management
4. \*\*Browser desktop access\*\* — web-based remote desktop (solution TBD from research) with per-student username/password auth
5. \*\*Tailscale integration\*\* — shared Tailnet, \`tag:student-instance\` ACL, Tailscale Funnel for public HTTPS gateway URL and desktop access
6. \*\*Service credential bag\*\* — per-student API keys injected via Ansible Vault; rotated at teardown
7. \*\*Agent persona pre-assignment\*\* — 12 named personas (SOUL.md + Discord bot + avatar) pre-generated; assigned at provision time
8. \*\*QR code credential delivery\*\* — secret GitHub Gist per student with access credentials; printed as QR cards
9. \*\*Credential handoff / burn\*\* — post-conference playbook to swap or rotate; 48h grace window for handoff
### Out of scope / later
```plain text
What | Why | Tracked in
Shared SonarQube dashboard across students | Per-instance simpler on deadline | Future cohort v2
HTTPS custom domain per instance | Tailscale Funnel provides HTTPS | Post-launch
Monitoring / alerting | Manual check sufficient for ~10 instances | Future
Ollama / local LLM | CPU-only instances; inference too slow for interactive use | Out
```
---
## 5. Functional Requirements
### FR-1: Per-Student VPS Provisioning
Create N Hetzner CCX43 instances in parallel via Ansible. SSH-accessible within 3 minutes.
```gherkin
Given the instructor has Hetzner API credentials and Ansible inventory configured
When they run ansible-playbook provision.yml -e "count=12"
Then 12 CCX43 instances are created and SSH-accessible within 3 minutes
And instance metadata (IP, hostname, agent persona) is written to inventory/instances.json
```
### FR-2: OpenClaw Stack Pre-Installed and Running
Each instance boots with OpenClaw installed, the masterclass workspace cloned, and the gateway running on its Tailscale Funnel URL. Discord bot connected to the student's assigned channel.
```gherkin
Given an instance has been provisioned
When the instructor runs the verify playbook
Then openclaw status reports running with the masterclass workspace active
And the Discord bot responds in the student's assigned channel
```
### FR-3: Docker System Containers
Docker CE installed. SonarQube Community Edition and Postgres run as managed Docker containers. The OpenClaw process user is in the \`docker\` group.
```gherkin
Given an instance has completed provisioning
When the instructor runs docker ps via the verify playbook
Then sonarqube and postgres containers are running and healthy
And the openclaw user can run docker commands without sudo
```
\*\*Security note:\*\* Docker socket access is functionally root on the instance. This is intentional — the agent needs container management. Instances are single-student; the risk is accepted and documented.
### FR-4: Browser Desktop Access with Per-Student Auth
Each instance exposes a browser-accessible desktop at a stable HTTPS URL. Students enter a username and password — no client install, no SSH.
```gherkin
Given a provisioned instance is running with desktop software active
When a student navigates to their desktop URL and enters credentials
Then they see a full graphical desktop session in their browser within 30 seconds
And no other student can access their session
```
### FR-5: Tailscale Integration
Each instance joins the shared Spantree Tailnet via pre-authorized ephemeral auth key. Tailscale Funnel provides stable public HTTPS URLs for the OpenClaw gateway and browser desktop. ACL policy: \`tag:student-instance\` can reach instructor machine only.
```gherkin
Given a Tailscale auth key is injected at provision time
When provisioning completes
Then the instance appears in the Tailnet tagged as student-instance
And tailscale funnel status shows an active HTTPS endpoint
And the instructor can SSH to the instance via its Tailnet hostname
```
### FR-6: Service Credential Bag Injection
Each student instance receives a full set of per-student API keys, injected via Ansible Vault. Keys are written to the OpenClaw config and companion app .env.
Credential bag per student:
- Anthropic API key
- Discord bot token + application ID
- GitHub token
- Exa API key
- Supabase project URL + service role key
- ElevenLabs API key
- Cloudflare API token + account ID
- SonarQube token (local instance)
- Tailscale auth key (ephemeral)
```gherkin
Given the Ansible vault contains per-student credential bags
When the credentials playbook runs for a student instance
Then all API keys are present in the OpenClaw config and companion app .env
And no credentials are written to any git-tracked file
```
### FR-7: Agent Persona Pre-Assignment
12 named agent personas pre-generated with SOUL.md, Discord bot name, and avatar. Assigned at provision time. Students adopt and customize during class.
```gherkin
Given agent-personas/ contains 12 persona definitions
When provisioning assigns persona "Scout" to instance 3
Then the workspace contains Scout's SOUL.md and the Discord bot is named Scout
And the QR credential card for that student reads "Your agent: Scout"
```
### FR-8: QR Code Credential Delivery
One secret GitHub Gist per student, containing access credentials only (not raw API keys). A printable QR card PDF is generated — one card per student, labeled with agent name.
Gist contents per student:
- Browser desktop URL + password
- OpenClaw gateway URL (Tailscale Funnel)
- OpenClaw gateway token
- Discord channel invite
- SSH credentials (optional, for advanced students)
```gherkin
Given instances.json and Tailscale Funnel URLs are resolved
When the instructor runs the gen-credentials playbook
Then one secret GitHub Gist is created per student
And a QR card PDF is generated with one card per student labeled by agent name
```
### FR-9: Credential Rotation and Student Handoff
Post-conference teardown playbook. Opted-in students get 48h to run swap-credentials.sh. All others: instances destroyed, class API keys rotated.
```gherkin
Given conference has ended and teardown is initiated
When the instructor runs ansible-playbook teardown.yml
Then opted-out student instances are destroyed within 60 seconds
And opted-in instances stay live for 48 hours with swap-credentials.sh available
And all class API keys are added to the rotation queue
And total billed cost is printed
```
---
## 6. Non-Functional Requirements
```plain text
Category | Requirement
**Instance spec** | Hetzner CCX43: 8 dedicated vCPU, 32GB RAM, 240GB NVMe
**Cost** | ~$160 total for 10 instances × 5.5 days at ~$0.12/hr
**Provisioning time** | All 10–12 instances ready within 10 minutes of playbook invocation
**Desktop latency** | < 200ms input lag on conference Wi-Fi
**Docker headroom** | SonarQube + Postgres ≤ 5GB RAM; OpenClaw + workloads get ≥ 20GB
**Session isolation** | No cross-student desktop or Tailnet access
**Credential security** | No API keys in git-tracked files; all secrets via Ansible Vault
**Iteration speed** | Ansible playbook re-run on a live instance ≤ 5 minutes during prep
```
---
## 7. Risks & Assumptions
### Risks
```plain text
Risk | Severity | Likelihood | Mitigation
Conference Wi-Fi throttles 10 concurrent desktop streaming sessions | High | Medium | Test with hotspot; Xpra as lower-bandwidth fallback; confirm venue Wi-Fi capacity
Browser desktop solution not selected before Saturday | High | Medium | Default to noVNC + nginx basic auth if research not back by Friday
Tailscale Funnel blocked or rate-limited at venue | Medium | Low | Fallback to direct VPS IP:port
Docker socket access exploited by runaway agent | Medium | High | Intentional and documented; single-student instances, not multi-tenant
Secret gist URL leaks post-conference | Low | Medium | Gists deleted at teardown; only access creds (not API keys) in gist; acceptable window
Credential provisioning failure (a key missing on one instance) | High | Medium | verify.yml checks all 9 credentials present before class day
10+ Discord bots on one server hitting rate limits | Medium | Low | Separate Discord applications (not just tokens) per student
```
### Assumptions
- Hetzner Cloud is primary provider — pending research confirmation
- GOTO conference ends \~Thursday June 26 — confirm exact date
- Tailscale Funnel is supported on Hetzner CCX43 instances (no NAT issues)
- Masterclass workspace repo is clonable before Saturday
- Discord server and student channel assignments exist before provisioning
- Agent persona SOUL.md files authored before Saturday June 21
---
## 8. Design Decisions
### D1: Per-Student Instances
\*\*Options considered:\*\*
1. One instance per team (2 total) — shared desktop, lower cost
2. One instance per student (10–12 total) — full isolation, portable take-home
\*\*Decision:\*\* Per-student.
\*\*Rationale:\*\* Team composition unknown pre-class. Cost delta is negligible (\~\$160 total). Each student gets a personalizable take-home agent.
### D2: Browser Desktop Solution
\*\*Options considered:\*\*
1. noVNC + websockify + nginx basic auth
2. KasmWorkspaces
3. Apache Guacamole
\*\*Decision:\*\* TBD — pending research report.
\*\*Rationale:\*\* Default to noVNC + nginx if research not back by Friday June 20.
### D3: Ansible over Shell Scripts
\*\*Options considered:\*\*
1. Shell scripts (provision.sh, setup.sh, etc.)
2. Ansible playbooks + roles
\*\*Decision:\*\* Ansible.
\*\*Rationale:\*\* Idempotency for safe re-run after partial failures. Ansible Vault for credential injection. Parallel execution across 10+ hosts. Easier to extend with new service roles. 2–3h upfront cost pays back at the first dress rehearsal.
### D4: Single Shared Tailnet with ACLs
\*\*Options considered:\*\*
1. Per-student Tailnet (separate org per student)
2. Shared Tailnet with tag-based ACL isolation
\*\*Decision:\*\* Shared Tailnet, \`tag:student-instance\`.
\*\*Rationale:\*\* Instructor needs fast SSH access to any machine during class. ACL policy isolates student instances from each other. Post-class, students migrating can re-auth with a new personal auth key.
### D5: QR Code → Secret GitHub Gist
\*\*Options considered:\*\*
1. Printed plain-text credential sheet
2. Secret GitHub Gist URL via QR
3. One-time-use burn URL
\*\*Decision:\*\* Secret GitHub Gist per student.
\*\*Rationale:\*\* One-time URLs too fragile for classroom (tab close = lost). Gists are updatable without reprinting. Access credentials only (not API keys) in gist — acceptable security posture for conference week.
### D6: SonarQube Self-Hosted per Instance
\*\*Options considered:\*\*
1. SonarCloud (free for public repos, requires org setup)
2. SonarQube Community Edition in Docker per instance
\*\*Decision:\*\* Self-hosted Docker per instance.
\*\*Rationale:\*\* Existing code-review skill wired to local server — zero reconfiguration. No external dependency on class day. 32GB instances absorb \~2.5GB overhead easily.
### D7: Pre-Assigned Agent Personas
\*\*Options considered:\*\*
1. Students name and configure from scratch
2. Pre-generated named personas assigned at class start
\*\*Decision:\*\* Pre-assigned personas.
\*\*Rationale:\*\* Cold-start naming burns 15+ min on a packed day. Pre-assigned names (Scout, Atlas, Wren, Cedar, Nova, Dune, Echo, Fern, Coda, Lark, Sage, Crest) give students something to react to. SOUL.md is still authored by the student — the name is just the seed.
---
## 9. File Breakdown
```plain text
File | Change type | FR | Description
`infra/ansible/provision.yml` | New | FR-1 | Create N Hetzner CCX43 instances via hcloud Ansible module
`infra/ansible/configure.yml` | New | FR-2, FR-3 | Install OpenClaw, Docker, SonarQube, Postgres, clone workspace
`infra/ansible/desktop.yml` | New | FR-4 | Install Xfce + desktop streaming solution (TBD)
`infra/ansible/tailscale.yml` | New | FR-5 | Join Tailnet, enable Funnel, verify HTTPS endpoint
`infra/ansible/credentials.yml` | New | FR-6 | Inject per-student service credential bag from Vault
`infra/ansible/persona.yml` | New | FR-7 | Write SOUL.md, configure Discord bot name/avatar per instance
`infra/ansible/verify.yml` | New | FR-2–FR-6 | Pre-class health check: OpenClaw, Docker, desktop, Discord, credentials
`infra/ansible/teardown.yml` | New | FR-9 | Destroy instances, report cost, enqueue credential rotation
`infra/ansible/inventory/` | New | All | Dynamic inventory generated from Hetzner API
`infra/ansible/vault/` | New | FR-6 | Ansible Vault: encrypted per-student credential bags
`infra/scripts/gen-credentials.ts` | New | FR-8 | Create secret GitHub Gists, generate printable QR card PDF
`infra/scripts/swap-credentials.sh` | New | FR-9 | Student-facing script to replace class keys with own keys
`infra/agent-personas/` | New | FR-7 | 12 persona definitions: name, SOUL.md template, avatar
`infra/README.md` | New | All | Instructor runbook: Sat provision → Sun verify → Mon class → Thu teardown
```
---
## 10. Dependencies & Constraints
- Hetzner Cloud account + API token with billing enabled
- Tailscale account (Spantree org) + pre-authorized ephemeral auth keys (1 per instance)
- 10–12 Discord bot applications (separate app IDs, not just tokens)
- Anthropic API org: 10–12 API keys or sub-keys
- GitHub token for Gist creation
- Exa, ElevenLabs, Supabase, Cloudflare accounts with per-student keys pre-provisioned
- Masterclass workspace repo clonable via git before Saturday June 21
- Agent persona SOUL.md templates authored before Saturday
- Browser desktop solution selected by Friday June 20
---
## 11. Rollout Plan
1. \*\*Friday June 20 AM:\*\* Research reports reviewed, browser desktop solution decided (closes Q1 + Q2)
2. \*\*Friday June 20:\*\* Ansible roles scaffolded, single-instance end-to-end test, persona names finalized
3. \*\*Saturday June 21 AM:\*\* \`ansible-playbook provision.yml -e "count=12"\` — all instances live
4. \*\*Saturday June 21:\*\* Run verify.yml, fix failures, full student UX dress rehearsal
5. \*\*Sunday June 22:\*\* Snapshot golden image, generate Gists, print QR cards
6. \*\*Monday June 23 8:00 AM:\*\* Final verify run; QR cards ready at registration
7. \*\*Mon June 23 → Thu June 26:\*\* Instances live through GOTO conference
8. \*\*Thursday June 26 (conference end):\*\* \`ansible-playbook teardown.yml\` — destroy, rotate, report cost
---
## 12. Open Questions
```plain text
# | Question | Owner | Due | Status
Q1 | Which browser desktop solution? (noVNC vs Guacamole vs Kasm) | Cedric | Jun 20 | Open — research pending
Q2 | Hetzner vs DigitalOcean as primary provider? | Cedric | Jun 20 | Open — research pending
Q3 | Exact GOTO conference end date? | Cedric | Jun 19 | Open
Q4 | Separate Anthropic keys per student or org sub-keys? | Cedric | Jun 19 | Open
Q5 | Discord server — new or existing Spantree server? | Cedric | Jun 19 | Open
Q6 | Include OpenAI/Codex? (adds OpenAI key per student) | Cedric | Jun 20 | Open
Q7 | Tailscale Funnel confirmed working with OpenClaw gateway auth? | Evie | Jun 20 | Open
Q8 | ElevenLabs — shared key or per-student? | Cedric | Jun 19 | Open
```
---
## 13. Related
```plain text
Issue | Relationship
Research: Workshop VPS Provisioning | Informs FR-1, FR-2, provider choice (Q2)
Research: Browser Desktop for Agent Demos | Informs FR-4, desktop solution (Q1)
Masterclass Open Questions (Notion) | VM host + Discord server questions addressed here
```
---
## 14. Changelog
```plain text
Date | Change | Author
2026-06-18 | Initial draft | Evie
2026-06-18 | v1.1 — Per-student instances, 32GB CCX43, Ansible, full service credential bag, Docker containers, Tailscale integration, agent personas, QR delivery, conference-week timeline | Evie
```
</content>
</page>