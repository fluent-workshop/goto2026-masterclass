# Loop 013 — Snapshot + Clone 14 Student Boxes

## Context

GOTO 2026 masterclass is Monday Jun 22 at 9am. It's Sunday Jun 21 ~3pm. We have
one baked test box (goto-test, 87.99.153.105) that is ready to snapshot. Need 14
student instances (Pokemon names from instances.txt) live and tunnel-connected by
tonight.

## Phase A — Pre-flight checks

1. SSH into root@87.99.153.105 and verify the box is in a clean state:
   - `docker ps` shows sonarqube + db healthy
   - `systemctl is-active nginx` is active
   - No bake in progress (no active bake process)
   - Disk is not full (`df -h /`)
2. Check if a snapshot already exists: `hcloud image list --type snapshot | grep goto`
   If one exists and is recent (today), skip Phase B and use it.

## Phase B — Take Hetzner snapshot

Use hcloud CLI (install if needed: `brew install hcloud`):

```bash
export HCLOUD_TOKEN=$(op read "op://Openclaw/EVIE - Hetzner GOTO 2026 API KEY/password")
hcloud server poweroff goto-test        # graceful shutdown before snapshot
hcloud snapshot create goto-test --description "goto-2026-golden-$(date +%Y%m%d)"
# Wait for snapshot to complete — poll until status is available
hcloud image list --type snapshot
hcloud server poweron goto-test         # bring test box back up
```

Note the snapshot ID. This is the golden image for all 14 clones.

## Phase C — Render cloud-init for all 14 instances

```bash
cd ~/src/spantree/goto-2026-masterclass
export TUNNEL_SECRETS_SOURCE=op
export OP_SERVICE_ACCOUNT_TOKEN=$(security find-generic-password -s "op-service-account-token" -w 2>/dev/null)
export OP_TUNNEL_SALT_ITEM="op://Openclaw/GOTO 2026 - Clone Secrets/TUNNEL_SALT"
export OP_CLOUDFLARED_TOKEN_ITEM="op://Openclaw/GOTO 2026 - Clone Secrets/CLOUDFLARED_TOKEN"
export OPENCLAW_API_KEY_SOURCE=stub   # use stub for now; real keys in a later loop
bash infra/clone.sh
```

Verify: `ls infra/cloud-init/generated/*.yaml | wc -l` should show 14 files.
Check one: `grep -c '{{' infra/cloud-init/generated/pikachu.cloud-init.yaml` should be 0.

## Phase D — Create 14 Hetzner servers from snapshot

For each hostname in instances.txt, create a ccx33 server from the snapshot:

```bash
SNAPSHOT_ID=<from Phase B>
for host in $(cat instances.txt | grep -v '^#' | grep -v '^$'); do
  hcloud server create \
    --name "goto-$host" \
    --type ccx33 \
    --location ash \
    --image $SNAPSHOT_ID \
    --ssh-key cedrics-macbook-pro-m4-max \
    --ssh-key evie-mac-mini-host \
    --user-data-from-file "infra/cloud-init/generated/${host}.cloud-init.yaml" \
    --label "project=goto-2026" \
    --label "hostname=$host"
  echo "Created goto-$host"
  sleep 2  # avoid rate limiting
done
```

Record all server IDs and IPs in report.md.

## Phase E — Verify first-boot on 3 boxes

Wait ~3 minutes for boxes to boot and run cloud-init, then verify:

```bash
for host in pikachu abra ditto; do
  ip=$(hcloud server ip goto-$host)
  echo "=== $host ($ip) ==="
  ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no root@$ip \
    "hostname && systemctl is-active nginx && docker ps --format '{{.Names}}: {{.Status}}' && cat /etc/openclaw/tunnel.env 2>/dev/null | grep -c TUNNEL_SALT" 2>&1
done
```

## Output: report.md

- Snapshot ID and creation time
- Table: hostname | server ID | IP | boot status
- Phase E verification results (3 boxes)
- Any failures and their causes
- Next steps (cloudflare tunnel comes up on first boot — verify by checking cloudflared status on one box after ~5 min)

## Green gate

report.md exists with snapshot ID, all 14 server IPs recorded, and Phase E
verification passing for at least 3 boxes. Stop after 40 turns.
