# Variables for the GCP bake-test box. We pivoted off Hetzner (hard dedicated
# vCPU quota cap) to GCP project goto2026-masterclass-500200. The golden image
# taken from this box is what the clone loop replicates for the student fleet, so
# keep these generic.

variable "project_id" {
  description = "GCP project that owns the bake-test box and golden image."
  type        = string
  default     = "goto2026-masterclass-500200"
}

variable "region" {
  description = "GCP region. us-central1 = Iowa."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for the instance and its disk/image."
  type        = string
  default     = "us-central1-a"
}

variable "machine_type" {
  description = <<-EOT
    GCP machine type. Must hold the full lab stack (Xfce desktop + noVNC +
    SonarQube + Postgres + OpenClaw + browser automation).

    Default 'n2-standard-8' = 8 vCPU / 32 GB, the GCP analogue of the prior
    Hetzner ccx33 (8 vCPU / 32 GB). One box is 8 vCPU; the 14-box fleet (112
    vCPU) will need a regional CPU quota increase before the clone loop.
  EOT
  type        = string
  default     = "n2-standard-8"
}

variable "boot_image_family" {
  description = "Public image family for the boot disk."
  type        = string
  default     = "ubuntu-2204-lts"
}

variable "boot_image_project" {
  description = "Project that publishes the boot image family."
  type        = string
  default     = "ubuntu-os-cloud"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB. 256 leaves room for the desktop + Docker images + Postgres data."
  type        = number
  default     = 256
}

variable "boot_disk_type" {
  description = "Persistent disk type. pd-balanced = SSD-backed, good price/perf for the lab."
  type        = string
  default     = "pd-balanced"
}

variable "ssh_user" {
  description = <<-EOT
    Login username injected into instance metadata ssh-keys. cc-dispatch SSHes in
    as this user (key below) to drive the bake/verify, then runs the bake with
    sudo. OS Login is disabled on the instance so metadata keys apply predictably.
  EOT
  type        = string
  default     = "cedric"
}

variable "ssh_public_key_path" {
  description = <<-EOT
    Path to the public key whose private half this automation host holds
    (~/.ssh/id_ed25519). Injected via metadata so `ssh -i ~/.ssh/id_ed25519
    <ssh_user>@<ip>` works for the bake. Cedric retains access independently via
    `gcloud compute ssh` (which manages its own keys).
  EOT
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}
