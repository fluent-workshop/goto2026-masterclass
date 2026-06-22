# References — loop-022-toolchain-secrets-pipeline

| File | What it is | Why CC needs it |
|---|---|---|
| `session-context.md` | Design decisions from the orchestrator session | Explains the fleet-wide vs per-box key split, VS Code tunnel auth approach, instances.toml rationale, and tool selection decisions — the "why" behind every F-item |
| `secrets-schema.md` | The full secrets architecture (sanitized — no actual keys) | Defines what keys exist, where each comes from (env vs instance-secrets.toml), and where each lands on the box |
| `tool-list.md` | The exhaustive list of tools to add in F5 | Exact package names, install methods, and version pins so CC doesn't guess |

Read in this order: session-context.md → secrets-schema.md → tool-list.md → then the source files listed in prompt.md.
