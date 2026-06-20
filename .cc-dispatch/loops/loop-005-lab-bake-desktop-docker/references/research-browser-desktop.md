# Browser Desktop for Agent Demos

Source: https://app.notion.com/p/3832e80c997d819db9aff333b806ccd9

Here is the result of "view" for the Page with URL https://app.notion.com/p/3832e80c997d819db9aff333b806ccd9 as of 2026-06-18T21:52:38.226Z:
<page url="https://app.notion.com/p/3832e80c997d819db9aff333b806ccd9">
<ancestor-path>
<parent-data-source url="collection://3342e80c-997d-81b6-b6e6-000b8e244d75" name="Research"/>
<ancestor-2-database url="https://app.notion.com/p/3342e80c997d80ed8179fa99fd9db122" title=""/>
</ancestor-path>
<properties>
{"Created":"2026-06-18T21:45:36.953Z","Model":"exa-research-pro","Name":"Browser Desktop for Agent Demos","Research ID":"","Status":"Drafted","date:Completed:is_datetime":0,"date:Started :is_datetime":0,"url":"https://app.notion.com/p/3832e80c997d819db9aff333b806ccd9"}
</properties>
<content>
# Objective
A hands-on AI agent workshop needs to give each student access to their own remote Linux desktop entirely through a web browser — no VNC client, no SSH tunnel, no local software install. The specific experience: the instructor hands each student a URL, the student opens it in their browser, enters a student-specific username and password, and immediately sees a live graphical desktop session running on their cloud VPS where an AI agent is operating. This report surveys browser-based remote desktop solutions that support this exact flow — credentialed multi-user access over plain HTTPS — and evaluates them on setup complexity, per-student auth model, session isolation, latency over conference Wi-Fi, and how well they fit an ephemeral 20–50 student classroom environment.
### Focus Areas
**noVNC with token-based or per-instance auth** — noVNC itself has no built-in username/password auth — it typically uses a token file or websockify proxy. Evaluate the options for adding per-student authentication in front of noVNC: token URLs (each student gets a unique link), HTTP basic auth via nginx reverse proxy, and lightweight auth wrappers. Also evaluate whether the model is one noVNC instance per VPS (student owns the whole machine) or one central server proxying many sessions. Cover setup steps on Ubuntu 24.04, expected latency, and known failure modes.
**KasmWorkspaces for credentialed multi-user streaming** — KasmWorkspaces is purpose-built for exactly this UX: users hit a URL, log in with a username/password, and get a streaming desktop or browser session in their browser tab. Evaluate: self-hosted deployment on a single VPS vs Kasm Cloud, per-user account provisioning (can you bulk-create 40 student accounts via API or CSV?), container-based session isolation, visual quality and latency, cost for a one-day workshop at 20–50 students, and what an instructor needs to set up before class day.
**Apache Guacamole as a centralized auth gateway** — Guacamole is specifically designed to sit in front of many VNC/RDP targets and provide a single login portal with per-user connection assignments. Evaluate it for this use case: one Guacamole instance proxying 40 student VPS desktop sessions, each student logs in with their own credentials and only sees their own machine. Cover: bulk user provisioning, connection assignment automation, TOTP or LDAP auth support, session recording, and whether Guacamole's operational complexity is worth it compared to simpler per-instance approaches.
**Lightweight alternatives: Xpra, RustDesk, and WebRTC** — Survey lighter-weight alternatives to the full Guacamole/Kasm stack: Xpra in HTML5 mode (streams individual app windows rather than a full desktop, with a web UI and built-in auth), RustDesk self-hosted (open-source remote desktop with a relay server model and web client), and WebRTC-based approaches. Evaluate which, if any, offer native username/password auth at a URL with a setup footprint small enough to run on a per-student VPS without adding much resource overhead.
**Credential provisioning and pre-class setup workflow** — The instructor needs to bulk-provision 20–50 student credentials before class starts and distribute them (email, printed sheet, QR code, simple handout URL). Survey the tooling each solution offers for this: API-driven user creation, CSV import, auto-generated per-student credential sheets, and how to revoke access at session end. Also cover TLS/HTTPS setup (students should never see a cert warning), and how to validate that all sessions are working before students arrive.
### Desired Output
A structured comparison of browser-based remote desktop solutions — KasmWorkspaces, Apache Guacamole, noVNC+proxy, Xpra, and RustDesk — specifically evaluated against this workflow: instructor provisions N student credentials, students open a URL, log in, and immediately access their desktop. Include a recommendation with justification, a complexity/latency/isolation comparison table, and a minimal setup walkthrough for the recommended approach on Ubuntu 24.04 with HTTPS.
### Out of Scope
Production remote work or permanent VDI deployments
Windows Remote Desktop as primary solution
Mobile device access
Solutions requiring a fat client install on the participant machine
# Report
*Pending execution...*
# References
*Pending execution...*
</content>
</page>