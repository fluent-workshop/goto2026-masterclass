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

**Render (always):** for each host in `instances.toml` (or hosts passed as args)
it substitutes every `{{PLACEHOLDER}}` in `cloud-init/template.yaml` —
hostname, desktop credentials, Anthropic API key, fleet-wide student API keys,
`TUNNEL_SALT`, `CLOUDFLARED_TOKEN`, `POSTGRES_APP_PASSWORD`, `ELEVENLABS_VOICE_ID`
— and writes a ready-to-boot file to the **gitignored** `cloud-init/generated/`
dir. The golden image carries none of this; the rendered files are the _only_
place the assembled per-box secrets exist on disk.

```bash
# render every box in instances.toml (reads fleet keys from .envrc.local)
export $(grep -v '^#' .envrc.local | xargs)
TUNNEL_SECRETS_SOURCE=env bash infra/clone.sh
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

## `instances.toml` — the instance roster (git-tracked)

The canonical host list and non-sensitive per-box config, committed to git:

```toml
[pikachu]
elevenlabs_voice_id = "BZgkqPqms7Kj9ulSkVzn"  # ElevenLabs voice ID (not a secret)
role = "instructor"

[abra]
elevenlabs_voice_id = "dn9HtxgDwCH96MVX9iAO"
role = "student"
```

`clone.sh` reads section names as the host list (replacing the old `instances.txt`)
and reads `elevenlabs_voice_id` per-box for cloud-init rendering. Anything that's
not a credential belongs here — voice IDs, roles, future group assignments.

## `instance-secrets.toml` — per-box secrets (gitignored)

Holds every per-instance credential, keyed by hostname. See
`instance-secrets.toml.example` at the repo root for the full shape and field
descriptions. Key fields:

```toml
[pikachu]
CLOUDFLARED_TOKEN          = "eyJ…"      # this box's own Cloudflare Tunnel token
POSTGRES_APP_PASSWORD      = "word-word-word"
ANTHROPIC_API_KEY          = "sk-ant-…"  # per-box, for billing isolation
OPENAI_API_KEY             = ""           # leave blank until issued
ELEVENLABS_API_KEY         = "sk_…"      # fleet-wide (same on every box)
EXA_API_KEY                = "…"          # fleet-wide
FIRECRAWL_API_KEY          = "fc-…"      # fleet-wide
CODERABBIT_API_KEY         = "cr-…"      # fleet-wide
VSCODE_TUNNEL_GITHUB_TOKEN = "ghp_…"     # fleet-wide (class GitHub account PAT)
DESKTOP_PASS               = "word-word-word"  # noVNC basic-auth password
```

- **Gitignored, always.** `.gitignore` blocks it; never commit it.
- **Per-box vs fleet-wide.** `CLOUDFLARED_TOKEN`, `POSTGRES_APP_PASSWORD`,
  `ANTHROPIC_API_KEY`, and `DESKTOP_PASS` are unique per box. The six skill API
  keys and the VS Code tunnel token are fleet-wide (same value, copied to every
  section for uniformity — `clone.sh` reads them from here rather than requiring
  separate env vars).
- **Why per-box tunnels?** So one box's token can't impersonate another. A shared
  token would load-balance across all connectors — wrong for per-box hostname routing.

## Replicating this for your own multi-box deployment

To stand up your own fleet from one image:

1. **Bake + image:** run `dotfiles/bootstrap.sh` on a base VM, stop it, and
   `gcloud compute images create … --family <your-family>`.
2. **List your hosts** in `instances.toml` (section name = hostname, plus any
   non-sensitive per-box metadata), and create `instance-secrets.toml` (one
   section per host, same shape as `instance-secrets.toml.example`). Keep the
   secrets file out of git.
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
