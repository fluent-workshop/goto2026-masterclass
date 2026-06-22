# `dotfiles/` — what goes on the box

This directory is the **image** half of the masterclass infrastructure: the
script and assets that bake a generic golden OpenClaw box. The **fleet** half
(how that image becomes 14 student boxes) lives in [`../infra/`](../infra/README.md).

Everything here is deliberately readable — students are encouraged to open these
files. Nothing here contains a secret or a personal identity; per-box values are
injected later by cloud-init (see [`../infra/README.md`](../infra/README.md)).

## Layout

| Path            | What it is                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bootstrap.sh`  | The **bake**. Run once on a fresh GCE VM (Ubuntu 22.04) to install everything, then capture a golden image. Organized into idempotent phases.                                   |
| `mise.toml`     | The per-user toolchain (node, bun, eza, starship), pinned. Installed to `~/.config/mise/config.toml`; `bootstrap.sh` runs `mise install` from it. Edit this to add/swap a tool. |
| `starship.toml` | The shell prompt config (box name, dir, git, node). Installed to `~/.config/starship.toml`.                                                                                     |
| `shell/`        | `zshrc` + `zshenv` — the interactive shell (history, aliases, `mkcd`/`kill-port`, eza, starship). Linked to `~/.zshrc` / `~/.zshenv`.                                           |
| `desktop/`      | The browser desktop: Xfce + TigerVNC + noVNC + an nginx reverse proxy with basic-auth (`*.service` units, `*.nginx`, `xstartup`, the cred materializer, the offline page).      |
| `tunnel/`       | The Cloudflare Tunnel connector: a config-generator (`openclaw-tunnel-config.sh`) + its systemd unit. Renders ingress on first boot.                                            |
| `firstboot/`    | The per-box first-boot setup (`openclaw-firstboot.sh` + unit) — seeds the git identity from the hostname.                                                                       |

> The Docker lab services (SonarQube + Postgres) are **not** here — they live in
> [`../infra/services/`](../infra/) and are laid down (not started) by the bake.

## The two-stage model: bake time vs. first boot

The single most important idea in this repo is **when** each thing happens.

**Bake time (`bootstrap.sh`, runs once → captured into the golden image):**
everything that is _identical on every box_ — the OS packages, the toolchain
(mise/node/bun/openclaw), the desktop stack, the cloudflared binary, the systemd
units. The image is **generic**: it contains no hostname, no secret, no per-box
identity. That's what lets one image become 14 boxes.

**First boot (on each real student box, driven by `cloud-init` + a few oneshot
units):** everything that is _unique per box_ —

- **cloud-init** sets the hostname (`pikachu`, `abra`, …) and writes the per-box
  secret files (`/etc/openclaw/desktop.env`, `/etc/openclaw/tunnel.env`) that it
  was handed at provision time.
- **`openclaw-firstboot.service`** seeds the git identity from that hostname
  (e.g. `Pikachu` / `pikachu-goto2026@fluentworkshop.dev`).
- **`openclaw-desktop-cred.service`** turns `desktop.env` into the nginx
  `htpasswd`, then deletes the cleartext.
- **`openclaw-tunnel.service`** renders the Cloudflare ingress config from
  `tunnel.env` and starts the connector.

Why split it this way? **Secrets must never be in the image.** A golden image is
copied to every box (and could be shared, snapshotted, or leaked), so baking a
password or tunnel token into it would hand every student every other student's
credentials. Keeping per-box state on the first-boot side means the image stays
safe to copy and each box configures _itself_ from the small bundle cloud-init
drops. (It also keeps the bake fast and the image reproducible.)

These first-boot units are ordered `After=network-online.target` — **not**
`After=cloud-final.service`. On GCE images whose default target is
`graphical.target`, ordering on `cloud-final` forms a dependency cycle and
systemd silently drops the job. (We learned this the hard way; see
`.cc-dispatch/loops/loop-014-gcp-bake/report.md`.)

## The hostname / `TUNNEL_SALT` / `hash8` scheme

Each box exposes its services under hostnames one level below the apex
`fluentworkshop.dev`, with a `gt26-` infix:

```
pikachu-gt26-app.fluentworkshop.dev                 ← public (the shared dev server)
pikachu-gt26-desktop-<hash8>.fluentworkshop.dev     ← protected (the noVNC desktop)
pikachu-gt26-supabase-studio-<hash8>.fluentworkshop.dev
pikachu-gt26-gateway-<hash8>.fluentworkshop.dev
pikachu-gt26-ssh-<hash8>.fluentworkshop.dev
pikachu-gt26-postgres-<hash8>.fluentworkshop.dev
```

`hash8 = sha256(hostname + TUNNEL_SALT)[:8]` — a short, deterministic hex tag.
`TUNNEL_SALT` is a single fleet-wide secret (the _only_ fleet-wide tunnel
secret); the hostname varies it per box. The renderer is
`tunnel/openclaw-tunnel-config.sh`.

**Why hash the protected services?** We want the desktop/Postgres/etc. hostnames
to be _unguessable_ without issuing a wildcard TLS cert. A wildcard
(`*.fluentworkshop.dev`) would (a) appear in Certificate Transparency logs and
(b) tempt everything onto one tunnel. Instead every hostname is exactly **one
label under the apex**, so the free Cloudflare Universal SSL cert covers them all
with no per-host certificate ever issued — and the `hash8` keeps the protected
names out of reach of anyone who only knows the box name. The public `-app`
service skips the hash on purpose (students share that URL).

## Adapting this for your own OpenClaw box

You can lift this whole setup for a single personal OpenClaw VPS:

**Keep:** `bootstrap.sh`'s phase structure, `mise.toml`, the `shell/` configs,
and the desktop/tunnel/firstboot units. They're cloud-agnostic (the bake runs on
any Ubuntu 22.04 box).

**Change:**

1. **The toolchain** — edit `mise.toml` (your Node/bun, add `deno`/`uv`/whatever)
   and the pinned versions at the top of `bootstrap.sh` (OpenClaw, mise,
   cloudflared).
2. **The domain + tunnel** — point `DOMAIN_BASE` in
   `tunnel/openclaw-tunnel-config.sh` at your own zone, and supply your own
   Cloudflare Tunnel token. For a single box you don't need the `hash8` scheme at
   all — you can use plain hostnames.
3. **The secret injection** — if you're not cloning a fleet, you can drop the
   cloud-init layer entirely and just write `/etc/openclaw/{desktop,tunnel}.env`
   by hand once, then let the first-boot units consume them.
4. **The git identity** — `firstboot/openclaw-firstboot.sh` derives a name from
   the hostname; set your own there or just run `git config --global` yourself.

For the provisioning/fleet side — `clone.sh`, Terraform, the golden-image
workflow, and the `instance-secrets.toml` model — see
**[`../infra/README.md`](../infra/README.md)**.
