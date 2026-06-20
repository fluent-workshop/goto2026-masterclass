# Attach EXISTING project SSH keys by name. Data-source lookup only —
# Terraform does not own or create SSH keys. Multiple keys so both Cedric's
# laptop AND the automation host (evie-mac-mini-host) can reach the box; the
# automation key is what lets cc-dispatch drive the bake/verify on box #1.
data "hcloud_ssh_key" "keys" {
  for_each = toset(var.ssh_key_names)
  name     = each.value
}

# Single bake-test server. The golden snapshot taken from this box is what the
# later loop clones 14 times, so keep it generic (no per-instance config here).
resource "hcloud_server" "test" {
  name        = "goto-test"
  location    = var.location
  server_type = var.server_type
  image       = var.image
  ssh_keys    = [for k in data.hcloud_ssh_key.keys : k.name]

  labels = {
    project = "goto-2026"
    role    = "bake-test"
  }
}
