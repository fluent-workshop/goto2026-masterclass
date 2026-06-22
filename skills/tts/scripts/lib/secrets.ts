/// Minimal env-only secret resolver.
/// Classroom shim replacing the @evie/lib workspace package — no 1Password,
/// just process.env with an optional file fallback.

export async function getSecret({ env, file }: { op?: string; env: string; file?: string }): Promise<string> {
  const val = process.env[env];
  if (val) return val;
  if (file) {
    const { existsSync, readFileSync } = await import("fs");
    if (existsSync(file)) return readFileSync(file, "utf-8").trim();
  }
  throw new Error(`Missing required env var: ${env}. Set it in your openclaw.json or shell environment.`);
}
