terraform {
  required_version = ">= 1.5"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
  }
}

# The Hetzner Cloud API token is read from the HCLOUD_TOKEN environment
# variable at runtime. It is NEVER hardcoded here and NEVER committed.
provider "hcloud" {}
