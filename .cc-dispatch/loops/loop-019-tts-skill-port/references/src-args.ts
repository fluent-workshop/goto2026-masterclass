/// Shared arg parsing helpers for Bun CLIs.

export type Args = Record<string, string | boolean>;

export interface ParsedArgs {
  command: string;
  args: Args;
  positional: string[];
}

export function parseArgs(argv: string[], usageFn: () => never): ParsedArgs {
  const command = argv[0];
  if (!command) usageFn();

  const args: Args = {};
  const positional: string[] = [];

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
    } else {
      positional.push(arg);
    }
  }
  return { command, args, positional };
}

export function requireArg(args: Args, name: string): string {
  const val = args[name];
  if (val === undefined || val === true) fatal(`Missing required option: --${name}`);
  return val as string;
}

export function optionalArg(args: Args, name: string, fallback?: string): string | undefined {
  const val = args[name];
  if (val === undefined) return fallback;
  if (val === true) fatal(`--${name} requires a value`);
  return val as string;
}

export function optionalNumber(args: Args, name: string, fallback?: number): number | undefined {
  const val = optionalArg(args, name);
  if (val === undefined) return fallback;
  const n = Number(val);
  if (isNaN(n)) fatal(`--${name} must be a number, got: ${val}`);
  return n;
}

export function optionalBool(args: Args, name: string, fallback?: boolean): boolean {
  const val = args[name];
  if (val === undefined) return fallback ?? false;
  if (val === true) return true;
  if (val === "true" || val === "1") return true;
  if (val === "false" || val === "0") return false;
  fatal(`--${name} must be true or false, got: ${val}`);
}

export function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function fatal(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}
