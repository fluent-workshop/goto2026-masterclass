# Bun CLI Template

Copy this skeleton when starting a new skill script. Replace `example` / `EXAMPLE` with your service name.

```ts
#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Example CLI — interact with the Example API.
 *
 * Secrets:
 *   Read from the environment (optionally resolved via `op read`):
 *   1. 1Password: op://<vault>/<item>/password
 *   2. Environment: EXAMPLE_API_KEY
 *
 * Environment:
 *   EXAMPLE_BASE_URL — API base URL (default: https://api.example.com/v1)
 *
 * Usage:
 *   example list   [--limit N] [--status active|archived]
 *   example get    --id <item_id>
 *   example create --name "..." --type widget [--description "..."]
 *   example delete --id <item_id>
 */

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://api.example.com/v1";

async function getApiKey(): Promise<string> {
  const key = process.env.EXAMPLE_API_KEY ?? Bun.env.EXAMPLE_API_KEY;
  if (!key) fatal("Missing required env var: EXAMPLE_API_KEY");
  return key;
}

function baseUrl(): string {
  return (process.env.EXAMPLE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const key = await getApiKey();
  const url = `${baseUrl()}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    fatal(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Arg parsing ─────────────────────────────────────────────────────────────

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const command = argv[0];
  if (!command) usage();

  const args: Args = {};
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return { command, args };
}

function requireArg(args: Args, name: string): string {
  const val = args[name];
  if (val === undefined || val === true) fatal(`Missing required option: --${name}`);
  return val as string;
}

function optionalArg(args: Args, name: string, fallback?: string): string | undefined {
  const val = args[name];
  if (val === undefined) return fallback;
  if (val === true) fatal(`--${name} requires a value`);
  return val as string;
}

function requireNumber(args: Args, name: string): number {
  const val = requireArg(args, name);
  const n = Number(val);
  if (isNaN(n)) fatal(`--${name} must be a number, got: ${val}`);
  return n;
}

function optionalNumber(args: Args, name: string): number | undefined {
  const val = optionalArg(args, name);
  if (val === undefined) return undefined;
  const n = Number(val);
  if (isNaN(n)) fatal(`--${name} must be a number, got: ${val}`);
  return n;
}

// ── Output helpers ──────────────────────────────────────────────────────────

function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function fatal(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function usage(): never {
  console.error(`Usage: example <command> [options]

Commands:
  list      List items
            --limit N (default: 50)
            --status active|archived (optional)

  get       Get a single item
            --id <item_id> (required)

  create    Create an item
            --name "..." (required)
            --type widget|gadget (required)
            --description "..." (optional)

  delete    Delete an item
            --id <item_id> (required)

Secrets (read from the environment, optionally resolved via op read):
  1. 1Password: op://<vault>/<item>/password
  2. Environment: EXAMPLE_API_KEY

Environment:
  EXAMPLE_BASE_URL       API base (default: https://api.example.com/v1)`);
  process.exit(1);
}

// ── Commands ────────────────────────────────────────────────────────────────

async function list(args: Args) {
  const limit = optionalNumber(args, "limit") ?? 50;
  const status = optionalArg(args, "status");
  let qs = `?per_page=${limit}`;
  if (status) qs += `&status=${status}`;
  const data = await api("GET", `/items${qs}`);
  out(data);
}

async function get(args: Args) {
  const id = requireArg(args, "id");
  const data = await api("GET", `/items/${id}`);
  out(data);
}

async function create(args: Args) {
  const name = requireArg(args, "name");
  const type = requireArg(args, "type");
  const body: Record<string, unknown> = { name, type };

  const description = optionalArg(args, "description");
  if (description) body.description = description;

  const data = await api("POST", "/items", body);
  out(data);
}

async function del(args: Args) {
  const id = requireArg(args, "id");
  await api("DELETE", `/items/${id}`);
  console.log(`Deleted item: ${id}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const { command, args } = parseArgs(process.argv.slice(2));

const commands: Record<string, (args: Args) => Promise<void>> = {
  list,
  get,
  create,
  delete: del,
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}`);
  usage();
}

await handler(args);

export {};
```
