# Resolve the newest image in the requested Ubuntu LTS family at apply time, so
# the box always boots a current, patched base.
data "google_compute_image" "ubuntu" {
  family  = var.boot_image_family
  project = var.boot_image_project
}

# Single bake-test instance. The golden image taken from this box is what the
# clone loop replicates 14 times, so keep it generic (no per-instance config).
resource "google_compute_instance" "test" {
  name         = "goto-test"
  machine_type = var.machine_type
  zone         = var.zone

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    network = "default"
    # Empty access_config => ephemeral external IP so we can SSH in to bake.
    access_config {}
  }

  metadata = {
    # Inject the automation host's key for the bake; disable OS Login so the
    # metadata key is honored rather than overridden by org/project OS Login.
    ssh-keys       = "${var.ssh_user}:${trimspace(file(pathexpand(var.ssh_public_key_path)))}"
    enable-oslogin = "FALSE"
  }

  labels = {
    project = "goto-2026"
    role    = "bake-test"
  }

  # Let `terraform apply` stop the box for in-place changes (and don't fight the
  # manual stop we do before image capture).
  allow_stopping_for_update = true
}
