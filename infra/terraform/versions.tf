terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

# Project / region / zone come from variables. Credentials are taken from the
# ambient gcloud Application Default Credentials (gcloud auth) — never hardcoded
# and never committed.
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
