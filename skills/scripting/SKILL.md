---
name: scripting
description: "Conventions for Bun+TypeScript (and Python) CLI scripts in skills. Use when writing, refactoring, or reviewing skill scripts or CLI helper code."
---

# Skill Scripting Conventions

Default to **Bun + TypeScript**. Use **Python (uv + Typer)** when a Python library is the clear best tool for the job. Never bash for new skills.

## Language Selection

| Choose | When |
|--------|------|
| **Bun + TypeScript** (default) | API clients, JSON wrangling, most new skills |
| **Python + uv** | Strong Python library needed (ML, PDF, data science, etc.) |

## Shared Design Principles

Both languages follow the same CLI philosophy:

- **CLIs, not libraries** — every script is a standalone CLI with proper `--option` parsing
- **Machine-readable output** — JSON to stdout, errors to stderr
- **Env var config** — credentials and base URLs configurable via environment, with sensible defaults
- **Validation up front** — fail fast with clear error messages
- **Self-documenting** — run with no args or `--help` for full usage

---

# Bun + TypeScript (Default)

## CLI Structure

```
#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Brief description.
 *
 * Secrets (resolved at runtime, never hardcoded):
 *   1. 1Password: op://<vault>/<item>/password
 *   2. Environment: SERVICE_API_KEY
 *
 * Usage:
 *   tool command --option value
 */

// ── Config ──
// ── HTTP helpers ──
// ── Arg parsing ──
// ── Output helpers ──
// ── Commands ──
// ── Main ──

export {};
```

Key elements:
- **Shebang** `#!/usr/bin/env bun`
- **Triple-slash** `/// <reference types="bun-types" />` for editor types
- **Credentials from env vars** (optionally resolved via `op read`) — never hardcoded
- **Doc comment** with secrets source and usage
- **`export {}`** at end (required for top-level await)

## Standard Patterns

### Credential Loading

Read secrets from environment variables and fail fast if a required one is missing:

```ts
function requireSecret(name: string): string {
  const val = process.env[name] ?? Bun.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const apiKey = requireSecret("SERVICE_API_KEY");
```

If you keep secrets in a manager such as 1Password, resolve the reference into the
environment before the script runs — e.g. `op run --env-file=.env -- bun run tool.ts`,
or shell out to `op read "op://<vault>/<item>/password"`. Never hardcode credentials
or pass them on the command line.

### Arg Parsing & Typed Helpers

```ts
type Args = Record<string, string | boolean>;

function requireArg(args: Args, name: string): string {
  const val = args[name];
  if (val === undefined || val === true) fatal(`Missing required option: --${name}`);
  return val as string;
}

function optionalArg(args: Args, name: string, fallback?: string): string | undefined { ... }
function requireNumber(args: Args, name: string): number { ... }
function requireDate(args: Args, name: string): string { ... }  // validates YYYY-MM-DD
```

### Output Helpers

```ts
function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function fatal(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}
```

### Command Dispatch

```ts
const commands: Record<string, (args: Args) => Promise<void>> = {
  "my-command": myCommand,
};
const handler = commands[command];
if (!handler) { console.error(`Unknown command: ${command}`); usage(); }
await handler(args);
```

## Bun Setup Checklist

- [ ] Shebang: `#!/usr/bin/env bun`
- [ ] After shebang: `/// <reference types="bun-types" />`
- [ ] `package.json` with `"bun-types"` in `devDependencies`, run `bun install`
- [ ] Top-level await: add `export {}` at end
- [ ] `chmod +x` the script

## Resources

- `references/bun-template.md` — Complete Bun CLI template to copy and adapt

---

# Python + uv (When Needed)

Use when a Python library is genuinely the best tool. Launch with `uv run`, use Typer for CLI and Rich for output.

## Project Structure

```
skills/<skill-name>/
├── SKILL.md
├── pyproject.toml
└── scripts/
    └── <tool>.py
```

### pyproject.toml

```toml
[project]
name = "openclaw-skill-<name>"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "typer>=0.9",
    "rich>=13.0",
    "httpx>=0.25",      # if making API calls
]

[project.scripts]
<tool> = "scripts.<tool>:app"
```

### CLI Pattern

```python
#!/usr/bin/env python3
"""Brief description. Run with: uv run scripts/<tool>.py --help"""

import json
import os
import sys
from pathlib import Path

import typer
from rich.console import Console

app = typer.Typer(help="Tool description")
console = Console(stderr=True)  # rich output to stderr, JSON to stdout


def get_api_key() -> str:
    """Load API key: env var → file → fatal."""
    if key := os.environ.get("SERVICE_API_KEY"):
        return key.strip()
    key_file = Path(os.environ.get(
        "SERVICE_API_KEY_FILE",
        Path.home() / ".openclaw/credentials/service-api-key"
    ))
    try:
        return key_file.read_text().strip()
    except FileNotFoundError:
        console.print("[red]error:[/] Cannot read API key. Set SERVICE_API_KEY.", highlight=False)
        raise typer.Exit(1)


def out(data) -> None:
    """JSON output to stdout."""
    print(json.dumps(data, indent=2, default=str))


@app.command()
def list_items(
    limit: int = typer.Option(50, help="Max items to return"),
    status: str = typer.Option(None, help="Filter by status"),
):
    """List items from the API."""
    key = get_api_key()
    # ... API call ...
    out(result)


@app.command()
def get_item(
    id: str = typer.Option(..., help="Item ID"),  # required
):
    """Get a single item."""
    key = get_api_key()
    # ...
    out(result)


if __name__ == "__main__":
    app()
```

### Running

```bash
# From skill directory
uv run scripts/<tool>.py list-items --limit 10
uv run scripts/<tool>.py get-item --id abc123

# Or if installed as a project script
uv run <tool> list-items --limit 10
```

## Python Conventions

- **Typer** for arg parsing — gives you `--help`, validation, type coercion for free
- **Rich console to stderr** — progress, errors, warnings go to stderr via Rich
- **JSON to stdout** — same `out()` pattern as Bun, keeps output machine-readable
- **httpx over requests** — async-capable, modern API
- **uv for everything** — `uv run`, `uv sync`, `uv add`. No pip, no venv activation.

---

# Code Organization & Modularity

Applies to both languages.

### When to Split

- **Under ~200 lines** — single file is fine
- **200–400 lines** — consider extracting shared helpers into a `lib/` module
- **400+ lines** — must split. Entry point should be mostly dispatch.

### Bun File Structure (larger CLIs)

```
scripts/
├── <tool>.ts             # Entry point: usage(), dispatch
└── lib/
    ├── api.ts            # HTTP client, auth
    ├── args.ts           # Shared arg parsing
    └── <domain>.ts       # Command implementations
```

### Python File Structure (larger CLIs)

```
scripts/
├── <tool>.py             # Entry point: Typer app, command definitions
└── lib/
    ├── api.py            # HTTP client, auth
    └── <domain>.py       # Business logic
```

### Principles

- **Single responsibility** — each module does one thing
- **Shallow call depth** — max two levels deep
- **Low cyclomatic complexity** — >3-4 branches in a function? Extract named helpers
- **No god functions** — over ~50 lines means it's doing too much
- **Imports over globals** — pass deps explicitly, avoid mutable module-level state

## Naming & File Layout

```
skills/<skill-name>/
├── SKILL.md
├── package.json          # (Bun) or pyproject.toml (Python)
├── scripts/
│   └── <tool>.ts|.py     # Named after the tool
└── references/           # Optional API docs, mappings
```

- Script name = tool name (not `index.ts`, not `main.py`)
- One primary CLI per skill; add subcommands, not separate scripts

## Referencing Scripts with `{baseDir}`

Always invoke a skill's own scripts through `{baseDir}` in the SKILL.md body —
never a hardcoded `skills/<name>/scripts/...` path. OpenClaw substitutes the
skill's absolute directory at runtime, so the command resolves regardless of the
agent's working directory.

```bash
# Good — portable, resolves to this skill's dir
bun run {baseDir}/scripts/my-tool.ts run --output output/data/

# Bad — breaks when cwd ≠ workspace root, and is brittle if the skill moves
bun run skills/my-tool/scripts/my-tool.ts run --output output/data/
```

`{baseDir}` resolves to the skill that owns the SKILL.md, so use it only for that
skill's own scripts. To call another skill's CLI, go through that skill (where its
own `{baseDir}` applies) rather than reaching across with a literal path.

## Code Quality

> **Prerequisites:** the SonarQube scan below needs a `sonarqube` skill/integration
> that is **not** included in this workspace. Skip this section unless you have one
> configured.

After completing work on a skill, run a SonarQube scan to catch code smells, bugs, and security issues. From the `sonarqube` skill (where `{baseDir}` resolves to its directory):

```bash
bun run {baseDir}/scripts/sonarqube.ts scan <path-to-your-workspace>
```

Review any new issues introduced by your changes:

```bash
bun run {baseDir}/scripts/sonarqube.ts issues --project <your-project-key> --severity CRITICAL
```

Consider a quality profile that disables rules irrelevant to Bun (e.g., `node:` prefix imports). Run `sonarqube setup` if the profile doesn't exist yet.

## See Also

For skill structure, SKILL.md authoring, frontmatter, progressive disclosure, and packaging, see the **skill-creator** skill.
