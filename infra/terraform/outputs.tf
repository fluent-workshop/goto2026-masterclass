output "test_server_ipv4" {
  description = "Public IPv4 of the bake-test server — ssh root@<ip> to run dotfiles/bootstrap.sh."
  value       = hcloud_server.test.ipv4_address
}
