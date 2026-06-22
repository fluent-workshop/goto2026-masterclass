# Gating Skills with metadata.openclaw

Gates let you make a skill conditionally available based on the environment. A skill with an unmet gate is invisible to the agent: it doesn't appear in the skills list, doesn't burn tokens, and can't confuse triggering. Ungated skills are always eligible.

Use gating when a skill requires specific binaries, API keys, or config that won't exist in every environment.

---

## Syntax

`metadata.openclaw` must be **single-line JSON** in the frontmatter. The parser does not support multi-line YAML objects here.

```markdown
---
name: image-lab
description: "Generate or edit images via a provider-backed workflow."
metadata: {"openclaw": {"requires": {"bins": ["uv"], "env": ["GEMINI_API_KEY"]}, "primaryEnv": "GEMINI_API_KEY"}}
---
```

---

## Gate Fields

### `requires.bins`

All listed binaries must exist on PATH. Checked at skill load time (host-side).

```json
{"openclaw": {"requires": {"bins": ["bun", "ffmpeg"]}}}
```

Use this for skills that call CLIs like `bun`, `gh`, `ffmpeg`, `op`, `d2`, etc.

### `requires.anyBins`

At least one binary must exist on PATH. Use when the skill works with multiple alternatives.

```json
{"openclaw": {"requires": {"anyBins": ["python3", "python"]}}}
```

### `requires.env`

All listed environment variables must exist in the process or be provided via `skills.entries.<name>.env` in `openclaw.json`.

```json
{"openclaw": {"requires": {"env": ["GEMINI_API_KEY", "ELEVENLABS_API_KEY"]}}}
```

### `requires.config`

All listed `openclaw.json` config paths must be truthy. Use for feature-flag gating.

```json
{"openclaw": {"requires": {"config": ["browser.enabled", "agents.defaults.sandbox.enabled"]}}}
```

### `os`

Restrict the skill to specific operating systems.

```json
{"openclaw": {"os": "darwin"}}
```

Values: `"darwin"`, `"linux"`, `"win32"`. Omit to allow all platforms.

### `always`

Skip all other gates and always include this skill.

```json
{"openclaw": {"always": true}}
```

Rarely needed. Use for core skills that must be available regardless of environment state.

---

## `primaryEnv`

Associates a specific env var with `skills.entries.<name>.apiKey` in `openclaw.json`. Enables the macOS Skills UI to prompt for the key and populate it automatically.

```json
{"openclaw": {"primaryEnv": "GEMINI_API_KEY"}}
```

When `apiKey` is set in `skills.entries`, OpenClaw injects `primaryEnv=<value>` into the process for that agent run.

---

## `emoji`

Optional. Shown in the macOS Skills UI next to the skill name.

```json
{"openclaw": {"emoji": "🔬"}}
```

---

## Installer Specs (`install`)

Tells the macOS Skills UI how to install missing dependencies. Optional — skills work without it, but the UI won't offer one-click installs.

```json
{
  "openclaw": {
    "requires": {"bins": ["gemini"]},
    "install": [
      {
        "id": "brew",
        "kind": "brew",
        "formula": "gemini-cli",
        "bins": ["gemini"],
        "label": "Install Gemini CLI (brew)"
      }
    ]
  }
}
```

Supported `kind` values: `"brew"`, `"node"`, `"go"`, `"uv"`, `"download"`.

Gateway installer preference order: Homebrew → uv → configured node manager → go → download.

---

## Full Example

```markdown
---
name: gemini
description: "Use Gemini CLI for coding assistance and Google search lookups."
metadata: {"openclaw": {"emoji": "♊️", "os": "darwin", "requires": {"bins": ["gemini"], "env": ["GEMINI_API_KEY"]}, "primaryEnv": "GEMINI_API_KEY", "install": [{"id": "brew", "kind": "brew", "formula": "gemini-cli", "bins": ["gemini"], "label": "Install Gemini CLI (brew)"}]}}
---
```

---

## What Gating Does NOT Cover

- **Sandbox env injection:** `skills.entries.<name>.env` and `apiKey` inject into the **host** process only. Inside a Docker sandbox, those values are invisible. Pass secrets via `agents.defaults.sandbox.docker.env` for sandboxed runs.
- **Agent allowlists:** Gating controls whether a skill is eligible; allowlists (`agents.list[].skills`) control which agents can see eligible skills. Both apply independently.
- **Runtime tool availability:** Gating checks conditions at load time, not per-turn. If a binary is removed after the session starts, the skill stays loaded until the next session.

---

## Common Patterns

**Skill that needs `bun` and an API key:**
```json
{"openclaw": {"requires": {"bins": ["bun"], "env": ["MY_API_KEY"]}, "primaryEnv": "MY_API_KEY"}}
```

**macOS-only skill:**
```json
{"openclaw": {"os": "darwin", "requires": {"bins": ["osascript"]}}}
```

**Skill that works with either `python3` or `python`:**
```json
{"openclaw": {"requires": {"anyBins": ["python3", "python"]}}}
```

**Skill gated on a config flag:**
```json
{"openclaw": {"requires": {"config": ["browser.enabled"]}}}
```
