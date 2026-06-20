# Variables are designed for the eventual "clone 14" loop: the same server_type
# / image / location feed a `for_each` over instances.txt. Keep them generic.

variable "location" {
  description = "Hetzner Cloud location. 'ash' = Ashburn, VA (US-East)."
  type        = string
  default     = "ash"
}

variable "server_type" {
  description = <<-EOT
    Hetzner server type. Must be AVAILABLE in var.location and large enough to
    hold the full lab stack (Xfce desktop + noVNC + SonarQube + Postgres +
    OpenClaw + browser automation).

    Default 'ccx33' = x86, 8 DEDICATED vCPU / 32 GB / 240 GB NVMe — confirmed
    available in Ashburn (ash) via Hetzner API 2026-06-19, ~€0.266/hr. Dedicated
    vCPU avoids noisy-neighbor jitter during the live demo. The earlier 'cpx21'
    (4 GB) / 'cx22' types were undersized for this stack and are superseded.
    NOTE: 8 vCPU / 32 GB / 240 GB is ccx33; ccx43 is the larger 16 vCPU / 64 GB.
    See report.md for the full server_type rationale and alternatives.
  EOT
  type        = string
  default     = "ccx33"
}

variable "image" {
  description = "Base OS image slug."
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_key_names" {
  description = <<-EOT
    Names of SSH keys already present in the Hetzner project (looked up, never
    created). Both Cedric's laptop and the automation host are attached so
    cc-dispatch can SSH in to drive the bake/verify on the box.
    'evie-mac-mini-host' = this automation host's id_ed25519 (added 2026-06-19).
  EOT
  type        = list(string)
  default     = ["cedrics-macbook-pro-m4-max", "evie-mac-mini-host"]
}
