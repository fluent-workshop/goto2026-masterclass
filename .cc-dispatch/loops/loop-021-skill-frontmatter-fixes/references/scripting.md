# Scripting in OpenClaw Skills

Scripts live in `scripts/` under a skill directory and handle deterministic, repetitive, or token-heavy work that doesn't belong in prose instructions.

**When to write a script instead of encoding logic in the body:**
- The same code would be rewritten by the agent on every invocation (extraction loops, format converters, validators)
- The task is deterministic enough that prose guidance adds noise without value
- You want reliable, testable behavior that isn't subject to model interpretation
- The output volume is large enough that doing it inline would flood the context

Scripts run via `exec` without being loaded into the context window, saving tokens. They're also independently testable: `bun run skills/my-skill/scripts/helper.ts --help`.

---

## Bun/TypeScript (Preferred)

OpenClaw's scripting convention is Bun + TypeScript. Bun runs `.ts` files directly without a compile step.

For the full workspace scripting conventions, see `skills/scripting/SKILL.md`. Key points specific to skill scripts:

### File structure

```
skills/my-skill/
  scripts/
    my-skill.ts          # main CLI entry point
    lib/
      api.ts             # API client / HTTP layer
      types.ts           # shared TypeScript types
      args.ts            # shared arg parsing
```

For simple scripts, a single file is fine. Add `lib/` when the script grows beyond ~200 lines or you have shared code across multiple scripts.

### CLI entry point pattern

```typescript
#!/usr/bin/env bun

import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    output: { type: "string", short: "o", default: "output/" },
    limit: { type: "string", short: "n" },
    verbose: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
});

const command = positionals[0];

switch (command) {
  case "run":
    await run({ output: values.output!, limit: values.limit ? parseInt(values.limit) : undefined });
    break;
  case "list":
    await list();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Usage: bun run scripts/my-skill.ts <run|list> [options]");
    process.exit(1);
}
```

### Referencing a script from the SKILL.md body

```markdown
Run the extractor:
```bash
bun run {baseDir}/scripts/my-skill.ts run --output output/data/
```

Use `{baseDir}` — OpenClaw substitutes the skill's directory path at runtime.
```

### Credential access from scripts

Prefer 1Password CLI for secrets. Never hardcode credentials.

```typescript
// 1Password lookup
const proc = Bun.spawn(["op", "item", "get", "My Service", "--vault", "Openclaw", "--format", "json"]);
const item = JSON.parse(await new Response(proc.stdout).text());
const apiKey = item.fields.find((f: any) => f.id === "password")?.value;

// OTP
const otpProc = Bun.spawn(["op", "item", "get", "My Service", "--vault", "Openclaw", "--otp"]);
const otp = (await new Response(otpProc.stdout).text()).trim();

// Fallback to env var when op CLI isn't available
const key = apiKey ?? process.env.MY_SERVICE_API_KEY;
if (!key) throw new Error("No API key found — check 1Password or MY_SERVICE_API_KEY env var");
```

### HTTP with rate limiting

Use `bottleneck` for any batch HTTP work. Install once per skill:

```bash
bun add bottleneck
```

```typescript
import Bottleneck from "bottleneck";

const limiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 300,  // ms between request starts
});

const results = await Promise.all(
  urls.map(url => limiter.schedule(() => fetchOne(url)))
);
```

### Error handling

```typescript
async function fetchOne(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "30");
    await Bun.sleep(retryAfter * 1000);
    return fetchOne(url);  // retry once
  }
  if (!res.ok) {
    console.error(`Skip ${url}: HTTP ${res.status}`);
    return null;
  }
  return res.text();
}
```

---

## Shell Scripts

Use shell (bash/zsh) for simple glue: file manipulation, calling other CLIs, quick one-liners that don't need TypeScript.

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:?Usage: $0 <input-file>}"
OUTPUT="${2:-output.json}"

# ... work ...
echo "Done → $OUTPUT"
```

Keep shell scripts short. Anything over ~50 lines is usually clearer in TypeScript.

---

## Python (Fallback)

Python is available on most macOS/Linux systems without installation. Use it when:
- The task needs a library that has no Bun equivalent (e.g. `Pillow` for image manipulation, `pdfplumber` for PDF parsing)
- You're writing a one-off script that doesn't need to be maintained

For PEP 723 inline dependencies (Python 3.12+):

```python
#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = ["requests", "beautifulsoup4"]
# ///

import requests
from bs4 import BeautifulSoup

# ... work ...
```

Prefer Bun/TypeScript for scripts that live in a skill long-term. Python scripts are harder to type-check and tend to accumulate import issues over time.

---

## Invoking Scripts from Skill Instructions

Always reference scripts via `{baseDir}` so the path resolves correctly regardless of working directory:

```markdown
Run validation:
```bash
bun run {baseDir}/scripts/validate.ts --input output/data.json
```
```

For shell scripts, ensure they're executable or invoke via `bash`:

```markdown
```bash
bash {baseDir}/scripts/setup.sh
```
```

---

## What Not to Put in Scripts

- **Auth flows that require browser automation** — those go in `lib/auth.ts` using Playwright (see `skills/web-scraping/references/browser-auth.md`)
- **Business logic that changes frequently** — keep in the SKILL.md body so it's easy to update via `skill_workshop` without touching the script
- **API wrappers you'll use in only one place** — inline in the main script; `lib/` is for genuinely shared code
