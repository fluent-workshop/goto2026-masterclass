# Goal: Pivot GOTO 2026 infra from Hetzner to GCP

## Context
We hit a hard dedicated vCPU quota limit on Hetzner (capped at 8).
We are pivoting to GCP. Cedric has created the GCP project: `goto2026-masterclass-500200`.

## Steps
1. **Rewrite Terraform** in `infra/terraform/`:
   - Change provider from `hcloud` to `google`.
   - Update `main.tf` to create a `google_compute_instance` named `goto-test`.
   - Machine type: `n2-standard-8`, Zone: `us-central1-a`.
   - Boot disk: 256GB `pd-balanced`, image family `ubuntu-2204-lts`, project `ubuntu-os-cloud`.
   - Ensure the instance has an external IP and we inject Cedric's SSH keys via OS Login or metadata so we can SSH in.
2. **Apply Terraform** to spin up the test box.
3. **Run the Bake**:
   - SSH into the new `goto-test` GCP instance.
   - Run `infra/bootstrap.sh --force` (you will need to upload/sync the local code to the box first, like you did for loop-011).
   - Ensure services (noVNC, Postgres, etc.) come up cleanly.
4. **Create GCP Golden Image**:
   - Stop the instance.
   - Create a custom image from its disk: `gcloud compute images create goto2026-golden-YYYYMMDD --source-disk=... --source-disk-zone=us-central1-a --project=goto2026-masterclass-500200`
5. **Update `infra/clone.sh`**:
   - Replace `hcloud server create` logic with `gcloud compute instances create`.
   - Inject the cloud-init via `--metadata-from-file=user-data=...`.
6. Write `report.md` when done.
