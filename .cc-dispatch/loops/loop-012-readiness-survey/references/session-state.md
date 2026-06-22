# Session State Context (as of Sun Jun 21 11:45am CDT)

## What Evie has already established

### Test box (87.99.153.105 = goto-test, ccx33)
- **Running:** noVNC desktop (TigerVNC :1 + websockify :6080), nginx :8080, SonarQube (healthy), Postgres (healthy)
- **NOT running:** cloudflared (inactive), OpenClaw (not found/configured), companion app (not deployed)
- **No credentials set:** /etc/nginx/.htpasswd absent, /etc/openclaw/desktop.env absent
- **Disk:** 225G total, 7.9G used — plenty of space
- **SSH key:** root access via ~/.ssh/id_ed25519 confirmed working

### Student instances
- instances.txt lists 14 Pokemon-named boxes (abra, ditto, dragonite, ...)
- Only goto-test (1 box) is provisioned; 14 student instances do NOT exist yet
- clone.sh is the script to provision them from test box

### Linear GOT team projects of interest
- "Companion App Dry-Run" (id: 00eff17d-a95a-413f-a6c8-2ada81b0b957)
- "GOTO Chicago 2026 Sessions" (id: b12634ee-a020-4a4e-b793-05af89849d0f)
- linear CLI doesn't support `issues` command — use milestones + available commands

### CC dispatch loops completed (loop-001 through loop-011, no loop-010)
- All loops in .cc-dispatch/loops/ have report.md files
- Key: loop-011 (cloudflare tunnels) report says "complete" but cloudflared is INACTIVE on test box

### Companion app (goto-accelerate-companion)
- Bun + TypeScript backend, React frontend, Postgres, Anthropic
- Has 32 speakers + 31 sessions data pre-seeded
- NOT deployed anywhere (only local dev environment)

### Slides (goto-2026-masterclass-site)
- slides/slides.md is mostly empty template content
- Unknown how many real slides vs placeholders exist
