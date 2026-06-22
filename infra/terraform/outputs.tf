output "test_server_ipv4" {
  description = "External IP of the GCP bake-test box — ssh <ssh_user>@<ip> then `sudo bash dotfiles/bootstrap.sh --force`."
  value       = google_compute_instance.test.network_interface[0].access_config[0].nat_ip
}

output "ssh_user" {
  description = "Login user for the bake-test box (matches metadata ssh-keys)."
  value       = var.ssh_user
}

output "instance_name" {
  description = "Instance name (source for the golden image)."
  value       = google_compute_instance.test.name
}

output "zone" {
  description = "Zone of the instance and its disk."
  value       = google_compute_instance.test.zone
}
