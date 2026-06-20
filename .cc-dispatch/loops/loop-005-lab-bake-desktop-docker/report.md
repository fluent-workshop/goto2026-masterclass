# Loop 005 report — lab-layer bake: browser desktop + Docker (FR-4, FR-3)

**Mode:** file editing + static validation only. No cloud, no Terraform, no SSH,
no `docker pull`/`up`, no spend. There is no live box; this loop authors the
recipe and statically validates it. A human runs it on the first Hetzner box
(gated, later loop) to verify the desktop + services come up before snapshot.

**Path 2 (hybrid):** the existing bash golden-snapshot bake (`dotfiles/bootstrap.sh`)
was EXTENDED — no Ansible introduced, loop-003 hardening untouched.

---

## 1. What was added (FR → file:line map)

### FR-4 — Browser desktop with per-student auth

| Piece                       | File                                              | Notes                                                                    |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Bake section (install+wire) | `dotfiles/bootstrap.sh:195` (§8)                  | Xfce + TigerVNC + noVNC/websockify + nginx + apache2-utils               |
| VNC session entrypoint      | `dotfiles/desktop/xstartup`                       | `dbus-launch … xfce4-session`; installed to `~ubuntu/.vnc/xstartup`      |
| Xfce-on-VNC unit            | `dotfiles/desktop/openclaw-desktop-vnc.service`   | `:1`, `-localhost yes`, `-SecurityTypes None`, 1920×1080; runs as ubuntu |
| VNC→WebSocket bridge        | `dotfiles/desktop/openclaw-desktop-novnc.service` | `websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5901`        |
| nginx basic-auth proxy      | `dotfiles/desktop/openclaw-desktop.nginx`         | listen `8080`, `auth_basic`, WS upgrade map, proxies `127.0.0.1:6080`    |
| Per-instance cred hook      | `dotfiles/desktop/openclaw-desktop-cred.sh`       | first-boot: builds htpasswd (bcrypt) from injected `desktop.env`         |
| Cred hook unit              | `dotfiles/desktop/openclaw-desktop-cred.service`  | oneshot, `After=cloud-final` `Before=nginx`                              |

### FR-3 — Docker system containers

| Piece                       | File                                       | Notes                                                               |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Bake section (Docker+stack) | `dotfiles/bootstrap.sh:234` (§9)           | Docker CE official repo, `ubuntu`→`docker` group, sysctl, compose   |
| `vm.max_map_count` sysctl   | `dotfiles/bootstrap.sh:265`                | writes `/etc/sysctl.d/99-openclaw-sonarqube.conf` = `262144`        |
| Service stack               | `infra/services/compose.yml`               | `sonarqube:10.6.0-community` + `postgres:16.4-bookworm`, pinned     |
| Internal DB password gen    | `infra/services/openclaw-services-env.sh`  | first-boot: `openssl rand` → `.env` (never committed/baked)         |
| Bring-up unit               | `infra/services/openclaw-services.service` | oneshot `docker compose up -d` on first real boot; enabled, not run |

### Supporting changes

- `dotfiles/bootstrap.sh:55-71` — preflight now asserts `shell/`, `desktop/`, and
  `infra/services/` all exist on disk (extends the curl|bash guard to the new
  assets); adds `REPO_ROOT`.
- `dotfiles/bootstrap.sh:282` (§10) — verify section gained `nginx -t`,
  `docker compose config -q`, and a `systemctl is-enabled` check for the 5 new
  units. The loop-003 stripped-env toolchain gate is unchanged.

---

## 2. The desktop chain (what a request flows through)

```
student browser
  → Tailscale Funnel (HTTPS, TLS terminated)        ← LATER LOOP
  → nginx :8080  (HTTP basic-auth = the only door)  ← openclaw-desktop.nginx
  → websockify 127.0.0.1:6080  (serves noVNC, VNC↔WS)
  → TigerVNC :1 / 127.0.0.1:5901  (loopback, SecurityTypes None)
  → Xfce session  (xstartup → xfce4-session)
```

Why this is safe without a VNC password: VNC is bound to loopback and accepts no
remote connections; the only externally reachable hop is nginx, gated by
basic-auth. One secret to manage (the student's basic-auth password), not two.

---

## 3. Where per-instance values get injected LATER (hook points)

Nothing student-specific is baked. The snapshot is generic; cloud-init wires
identity at clone time (same pattern as `infra/cloud-init/template.yaml`).

| Value                          | Hook point (consumed at first boot)                      | Who writes it (later loop)                   |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------- |
| Desktop username/password      | `/etc/openclaw/desktop.env` → `openclaw-desktop-cred.sh` | cloud-init `write_files` per `instances.txt` |
| Public desktop URL (HTTPS)     | `tailscale funnel 8080` in front of nginx                | Tailscale loop (FR-5)                        |
| Internal SonarQube DB password | `/opt/openclaw/services/.env` (auto-generated)           | self-generated on box, never injected        |

**Funnel hook:** nginx listens plain HTTP on `8080`. The Tailscale loop runs
`tailscale serve --bg 8080` + `tailscale funnel 8080` to publish an HTTPS URL
that fronts it — no nginx change needed. Direct `http://<ip>:8080` also works as
the PRD's Wi-Fi fallback (still basic-auth gated).

**Fail-closed:** until `desktop.env` lands, no htpasswd exists and nginx returns
401/403 — the desktop is never anonymously reachable on a fresh snapshot.

**Cloud-init addition needed next loop** (out of scope here): add to
`infra/cloud-init/template.yaml` a `write_files` entry for
`/etc/openclaw/desktop.env` with `DESKTOP_USER`/`DESKTOP_PASS` placeholders, and
a clone-time substitution in the (referenced-but-unwritten) `infra/clone.sh`.

---

## 4. Docker / compose layout + the sysctl fix

- **Images pinned:** `sonarqube:10.6.0-community`, `postgres:16.4-bookworm`.
- **Memory caps (NFR ≤ 5GB):** sonarqube `mem_limit: 4g` + db `1g` = 5g. Leaves
  ≥ 20GB on the ccx33 (32GB) for OpenClaw + workloads.
- **Healthchecks:** Postgres `pg_isready`; SonarQube `GET /api/system/status`
  with a 120s `start_period` (cold ES start). `depends_on … service_healthy`.
- **Ports:** SonarQube bound to `127.0.0.1:9000` only (local code-review skill
  reaches it; not publicly routed).
- **sysctl:** `vm.max_map_count=262144` baked to `/etc/sysctl.d/` — the classic
  SonarQube/Elasticsearch boot failure; handled.
- **Docker socket = root:** `ubuntu` in `docker` group is intentional (PRD FR-3
  security note: single-student box, accepted + documented).

---

## 5. Idempotence + ordering

- **apt installs** are no-ops when satisfied; **Docker repo + key** added only if
  `docker` is absent; **group membership**, **sysctl**, **htpasswd**, and **.env**
  all guard on "already present". Re-running the whole bake changes nothing and
  errors nowhere.
- **Ordering vs loop-003:** §8/§9 are additive and sit after the toolchain wiring
  (§6) and shell layer (§7), before verify (§10). The mise/node/openclaw pins,
  the `env -i` resolution gate, and the curl|bash FATAL guard are untouched
  (the guard was _extended_ to cover the new asset dirs).
- **Units enabled, not started** where start would spend/network: the compose
  unit is `enable`d but its first `up`+pull happens on the real box's boot.

---

## 6. Static validation performed

| Check                                                    | Result                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bash -n dotfiles/bootstrap.sh`                          | ✅ pass                                                                                                    |
| `bash -n` cred.sh / services-env.sh, `sh -n` xstartup    | ✅ pass                                                                                                    |
| `shellcheck` (3 scripts)                                 | ✅ clean (2 runtime-source dirs annotated)                                                                 |
| `docker compose -f infra/services/compose.yml config -q` | ✅ valid (with throwaway DB pw)                                                                            |
| compose memory total                                     | ✅ 5g ≤ 5GB NFR                                                                                            |
| secret scan of `dotfiles/` + `infra/services/`           | ✅ none hardcoded                                                                                          |
| `nginx -t`                                               | ⚠️ NOT run — nginx not installed in sandbox; config hand-checked. Baked verify runs `nginx -t` on the box. |

`docker compose up`/`pull` and the desktop runtime were **not** exercised — no
live box, by design.

---

## 7. Human verification commands (run on the first Hetzner box, gated)

After `bash dotfiles/bootstrap.sh` completes on a fresh ccx33, BEFORE snapshot:

```bash
# Desktop chain up + nginx fails closed without creds
systemctl is-active openclaw-desktop-vnc openclaw-desktop-novnc nginx
ss -ltnp | grep -E ':(5901|6080|8080)'        # 5901/6080 loopback, 8080 listening
curl -so /dev/null -w '%{http_code}\n' localhost:8080   # expect 401 (no creds yet)

# Simulate cloud-init's credential drop, then confirm auth gates the desktop
sudo install -d /etc/openclaw
printf 'DESKTOP_USER=demo\nDESKTOP_PASS=demo-pass\n' | sudo tee /etc/openclaw/desktop.env
sudo systemctl restart openclaw-desktop-cred nginx
curl -so /dev/null -w '%{http_code}\n' localhost:8080            # expect 401
curl -sou demo:demo-pass -w '%{http_code}\n' localhost:8080/     # expect 302 → vnc.html
sudo rm /etc/openclaw/desktop.env /etc/nginx/.htpasswd           # clean before snapshot

# Docker stack healthy (this DOES pull images — first real boot)
sudo systemctl start openclaw-services
docker ps                                       # sonarqube + db (openclaw-lab-*)
docker inspect --format '{{.State.Health.Status}}' openclaw-lab-sonarqube-1   # healthy
sudo -u ubuntu docker ps                        # ubuntu runs docker w/o sudo
sysctl vm.max_map_count                         # 262144
```

`openclaw-lab-*` container names assume compose's default project naming from
`name: openclaw-lab`; adjust the inspect target if compose reports otherwise.

---

## 8. Assumptions flagged

- **Ubuntu package names** (`novnc`, `websockify`, `tigervnc-standalone-server`,
  `xfce4`) are 24.04 names; verified on the box at bake, not in this sandbox.
- **noVNC web root** assumed `/usr/share/novnc` (Ubuntu `novnc` package default).
- **`tigervncserver -xstartup` flag** — also installed xstartup to the standard
  `~/.vnc/xstartup` so the session works even if the flag is ignored.
- **xfce4 recommends kept** (no `--no-install-recommends`) so the desktop is
  actually usable; 240GB disk absorbs it. Trimmable later if image size matters.
- **SonarQube 10.6.0-community / Postgres 16.4** are compatible per SonarQube's
  supported-DB matrix; bump deliberately like the other pins.

---

## 9. Scope / safety confirmation

- `git status`: only `dotfiles/bootstrap.sh` (modified), new `dotfiles/desktop/`
  - `infra/services/`, and this loop dir. No Terraform/cloud-init behavioral
    change (cloud-init credential injection is a later loop). No secrets committed.
- loop-003 hardening intact. No Ansible. No apply/bake/snapshot performed —
  that's human-gated next.

## 10. What's NOT in this loop (later, gated)

- cloud-init `desktop.env` injection + `infra/clone.sh` substitution (FR-4 wiring)
- Tailscale join + Funnel publish + verification on the live box (FR-5)
- Service credential bag, personas, Discord, QR delivery (FR-6/7/8)
- The actual apply → first-boot verify → snapshot run
