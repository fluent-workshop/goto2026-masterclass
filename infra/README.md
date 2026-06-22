# `infra/` — turning one golden image into a fleet

This directory is the **provisioning** half of the masterclass infrastructure:
how the generic golden image baked by [`../dotfiles/`](../dotfiles/README.md)
becomes 14 individually-configured student boxes on GCP.

If you haven't read it yet, start with
[`../dotfiles/README.md`](../dotfiles/README.md) — it explains the bake and the
bake-time-vs-first-boot split that the rest of this document assumes.

## The end-to-end model

```
  dotfiles/bootstrap.sh                infra/clone.sh                 GCE
  ────────────────────                 ──────────────                 ───
  bake one generic box   ──image──▶    render per-box cloud-init  ──▶ 14 boxes
  (no secrets, no host)                from template + secrets        each self-
                                                                      configure on
  gcloud compute images create         gcloud compute instances       first boot
    --family goto2026-golden             create … --metadata-from-     (cloud-init +
                                         file user-data=<rendered>     firstboot units)
```

1. **Bake** a generic box and capture it as a GCP **custom image** in the family
   `goto2026-golden` (newest image in the family is always the one used).
2. **Render** a per-box cloud-init file for each host with `clone.sh` — this is
   where the per-box hostname and secrets get baked into a `user-data` document.
3. **Create** one GCE instance per host from the golden image, handing each its
   rendered cloud-init as instance metadata.
4. On **first boot**, cloud-init + the first-boot systemd units configure the box
   from that metadata (hostname, desktop password, tunnel token, git identity).

## `clone.sh` — render, and optionally provision

`clone.sh` does two things; rendering is the default and is side-effect-free.

**Render (always):** for each host in `instances.txt` (or hosts passed as args)
it substitutes every `{{PLACEHOLDER}}` in `cloud-init/template.yaml` —
hostname, desktop user/password, OpenClaw API key, `TUNNEL_SALT`,
`CLOUDFLARED_TOKEN`, `POSTGRES_APP_PASSWORD` — and writes a ready-to-boot file to
the **gitignored** `cloud-init/generated/` dir, plus a credential manifest. The
golden image carries none of this; the rendered files are the _only_ place the
assembled per-box secrets exist on disk.

```bash
# render every box in instances.txt (op = pull fleet salt from 1Password)
TUNNEL_SECRETS_SOURCE=op \
  OP_TUNNEL_SALT_ITEM='op://Openclaw/EVIE - Cloudflared goto-2026-fleet Token/TUNNEL_SALT' \
  OPENCLAW_API_KEY_SOURCE=stub ALLOW_STUB=1 \
  bash infra/clone.sh
```

**Provision (opt-in, `--provision` / `PROVISION=1`):** after rendering, create
one GCE instance per host from the `goto2026-golden` family, injecting that box's
cloud-init as the `user-data` metadata key. It is **idempotent** — an instance
that already exists is skipped, and a failed create logs and continues rather
than aborting the whole fleet.

```bash
bash infra/clone.sh pikachu --provision   # render + create just pikachu
```

Secrets fed into the root-sourced `tunnel.env` are validated against a strict
charset before substitution, so a stray backtick in `instance-secrets.toml`
can't become code that runs as root on the box.

## Terraform — the bake box, _not_ the fleet

`terraform/` manages exactly **one** resource: the `goto-test` GCE VM used to run
the bake. It does **not** manage the 14 student boxes.

Why the split? The bake box is a long-lived, hand-tended thing you `terraform
apply` once and keep around to re-bake. The fleet is ephemeral, created in bulk
from an image via `clone.sh --provision`, and torn down after the class —
modeling 14 nearly-identical throwaway boxes as Terraform resources would add
state-management friction for no benefit. Terraform owns the durable box; a shell
loop owns the disposable fleet.

```bash
cd infra/terraform && terraform apply    # create/refresh the goto-test bake box
```

## `instance-secrets.toml` — per-box secrets

This gitignored file at the repo root holds the **per-instance** secrets, keyed
by hostname:

```toml
[pikachu]
CLOUDFLARED_TOKEN     = "eyJ…"          # pikachu's OWN Cloudflare Tunnel token
POSTGRES_APP_PASSWORD = "skill-crisp-mouse"
```

- **Per-box, not fleet-wide.** Each box runs its _own_ Cloudflare Tunnel (its own
  connector token) and its own Postgres password. The only fleet-wide tunnel
  secret is `TUNNEL_SALT` (it just salts the hostname hash), which lives in
  1Password, not here.
- **Gitignored, always.** It contains live credentials. `clone.sh` reads it to
  render cloud-init; it must never be committed (`.gitignore` blocks it, and so
  does `*.bak`).
- **Why per-box tunnels?** So one box's token can't impersonate another, and so a
  request for `pikachu-…` is routed only by _pikachu's_ connector. (A single
  shared tunnel would load-balance requests across all connectors — wrong for
  per-box routing.)

## Replicating this for your own multi-box deployment

To stand up your own fleet from one image:

1. **Bake + image:** run `dotfiles/bootstrap.sh` on a base VM, stop it, and
   `gcloud compute images create … --family <your-family>`.
2. **List your hosts** in `instances.txt`, and create a
   `<your-family>`/secrets file like `instance-secrets.toml` (one section per
   host). Keep it out of git.
3. **Template:** adapt `cloud-init/template.yaml` to write whatever per-box files
   your first-boot units expect.
4. **Render + provision:** `clone.sh` (pointing `GCP_IMAGE_FAMILY`,
   `GCP_PROJECT`, `GCP_ZONE`, etc. at your project) renders and, with
   `--provision`, creates the boxes.
5. **DNS/tunnel:** create one Cloudflare Tunnel per box and the CNAMEs that point
   your hostnames at them (the `.claude/skills/cloudflare/scripts/` helpers
   automate this for the `gt26-` scheme — adapt the prefix in
   `playwright-helpers.ts`).

The model is cloud-portable: swap the `gcloud` calls in `clone.sh`'s
`provision_gcp()` for your provider's "create instance from image with user-data"
call and the rest carries over.
