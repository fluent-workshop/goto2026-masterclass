# Attach the EXISTING project SSH key by name. Data-source lookup only —
# Terraform does not own or create SSH keys.
data "hcloud_ssh_key" "default" {
  name = var.ssh_key_name
}

# Single bake-test server. The golden snapshot taken from this box is what the
# later loop clones 14 times, so keep it generic (no per-instance config here).
resource "hcloud_server" "test" {
  name        = "goto-test"
  location    = var.location
  server_type = var.server_type
  image       = var.image
  ssh_keys    = [data.hcloud_ssh_key.default.name]

  labels = {
    project = "goto-2026"
    role    = "bake-test"
  }
}
