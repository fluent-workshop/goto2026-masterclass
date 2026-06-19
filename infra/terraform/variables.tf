# Variables are designed for the eventual "clone 14" loop: the same server_type
# / image / location feed a `for_each` over instances.txt. Keep them generic.

variable "location" {
  description = "Hetzner Cloud location. 'ash' = Ashburn, VA (US-East)."
  type        = string
  default     = "ash"
}

variable "server_type" {
  description = <<-EOT
    Hetzner server type. Must be a >=4GB shared-vCPU type that is AVAILABLE in
    var.location.

    Default 'cpx21' = AMD x86, 3 vCPU / 4 GB / 80 GB SSD — offered in the US
    locations (ash, hil). The spec's suggested 'cx22' (Intel, 2 vCPU / 4 GB) is
    an EU-only line and is NOT offered in Ashburn, so it would fail at apply.
    See report.md for the full server_type rationale and alternatives.
  EOT
  type        = string
  default     = "cpx21"
}

variable "image" {
  description = "Base OS image slug."
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_key_name" {
  description = "Name of an SSH key already present in the Hetzner project. Looked up, never created."
  type        = string
  default     = "cedrics-macbook-pro-m4-max"
}
