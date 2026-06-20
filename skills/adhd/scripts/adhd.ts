#!/usr/bin/env bun
/**
 * ADHD — Parallel Divergent Ideation via grounded Claude Code frames.
 *
 * Phase 1 (diverge): fan out N isolated `claude -p` headless frames, each under a
 * distinct cognitive lens, each grounded (read access to repo + shared artifacts
 * via --add-dir, MCPs via --mcp-config). Each writes a JSON idea array to its
 * frame dir. A barrier waits for all frames, then aggregates into results/diverge.json.
 *
 * Phase 2 (focus) is done by the calling agent in-session: score, cluster,
 * flag traps, deepen top-3, render. This script does NOT critique — that keeps the
 * generator/critic split mechanical (separate processes, opposite intents).
 *
 * Subcommands:
 *   init    --problem <text|@file> [--slug s] [--frames a,b,c] [--repo path] [--n 5]
 *   diverge --run <run-dir>            # launch frames + barrier + aggregate
 *   status  --run <run-dir>            # per-frame completion state
 *   frames                             # print the frame catalog
 *
 * Design notes:
 * - Frames run headless (`claude -p`), NOT tmux. One-shot, truly parallel, no paste timing.
 * - cwd of each frame is its own disposable dir under .scratch/adhd/<run>/frames/<name>.
 *   Grounding is granted, not cwd-based: --add-dir for repo+artifacts, --mcp-config for MCPs.
 * - Isolation invariant: frames never see each other's output. No cross-branch context.
 */

import { $ } from "bun";
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const WORKSPACE = resolve(import.meta.dir, "../../..");
const MCP_CONFIG = join(WORKSPACE, ".mcp.json");
const ADHD_ROOT = join(WORKSPACE, ".scratch", "adhd");

// ── Frame catalog ─────────────────────────────────────────────────────────────
// Adapted from the ADHD paper's frame table (MIT, UditAkhourii/adhd). Each frame
// is a vantage-point operator chosen for structural distortion, not expertise.
type Tag = "code" | "design" | "general" | "wild";
interface Frame { name: string; vantage: string; tags: Tag[]; }

const FRAMES: Frame[] = [
  { name: "speedrunner", tags: ["code", "wild"],
    vantage: "You are a speedrunner. Find glitches, skips, out-of-bounds tricks, frame-perfect shortcuts. What is the abusive-but-legal path to the goal? Look in the actual code for the load-bearing loop you can break." },
  { name: "regulator", tags: ["design", "general"],
    vantage: "You audit systems for compliance and failure modes. What must be provable, traceable, or refusable here? What would you red-line in review?" },
  { name: "ten-year-old", tags: ["general", "wild"],
    vantage: "You are a curious 10 year old who has never seen software. Describe naive but unencumbered approaches. Ignore convention entirely." },
  { name: "competitor", tags: ["code", "design"],
    vantage: "You are a hostile competitor or attacker. Generate approaches that exploit, fail, or sabotage the obvious solution. Then invert each into a defensive idea." },
  { name: "biology", tags: ["code", "wild"],
    vantage: "Transplant a mechanism from biology (immune systems, neural plasticity, cell signaling, evolution, gut flora). Force-fit it onto this problem." },
  { name: "logistics", tags: ["code", "design"],
    vantage: "Steal mechanisms from logistics: queues, batching, just-in-time, hub-and-spoke, returns, last-mile. Apply them literally to this problem." },
  { name: "game-design", tags: ["design", "general"],
    vantage: "Approach this as a game designer. What are the loops, rewards, friction, save-states, speedrun tricks? Treat the user as a player." },
  { name: "markets", tags: ["design", "wild"],
    vantage: "Treat the problem as a market. Buyers, sellers, market-makers. What does an auction, a futures contract, a clearing house look like here?" },
  { name: "inversion", tags: ["code", "design", "general"],
    vantage: "Ask the OPPOSITE question. If the goal is X, brainstorm how to guarantee NOT X. Then negate each answer back into a real idea." },
  { name: "zero-budget", tags: ["code", "general"],
    vantage: "No money, no team, one hour. What is the crudest version that still does the load-bearing thing?" },
  { name: "infinite-budget", tags: ["design", "wild"],
    vantage: "Infinite compute, infinite engineers, a decade. What is the maximalist version, unconstrained by today's limits?" },
  { name: "remove-assumption", tags: ["code", "design", "wild"],
    vantage: "Name the thing everyone treats as fixed (framework, database, request-response model, network). Imagine it is gone. What becomes possible?" },
  { name: "ant-colony", tags: ["code", "wild"],
    vantage: "No central planner. Many dumb agents, local rules, pheromone trails. How does the problem solve itself emergently?" },
  { name: "on-call-3am", tags: ["code", "design"],
    vantage: "You are the on-call engineer woken at 3am when this breaks. What design would let you NOT get paged?" },
  { name: "hardware-engineer", tags: ["code", "wild"],
    vantage: "You think in latency, memory layout, and physical constraints. Re-ask this as a hardware/firmware problem. What do bus topology, cache, timing budget tell you?" },
];

const DIVERGENT_SYSTEM = [
  "You are in DIVERGENT mode. You are a generator, not a critic.",
  "Generate 6 short distinct ideas under your assigned frame. Each idea is one phrase or one sentence.",
  "Do not evaluate. Do not rank. Do not hedge. The first three obvious answers everyone would give are BANNED.",
  "Push past them into the awkward middle. You may read the granted repo/artifact dirs and use any MCP tools that are configured (e.g. web search or docs lookup) to ground ideas in reality — cite a file path or source in the rationale when you do.",
  "Output ONLY a JSON object: {\"frame\":\"<name>\",\"ideas\":[{\"text\":\"...\",\"rationale\":\"...\",\"grounding\":\"<optional file/source>\"}]}",
  "No prose before or after the JSON.",
].join(" ");

// ── helpers ───────────────────────────────────────────────────────────────────
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "run";
}
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}
function pickFrames(n: number, requested?: string): Frame[] {
  if (requested) {
    const names = requested.split(",").map((s) => s.trim());
    const chosen = names.map((nm) => FRAMES.find((f) => f.name === nm)).filter(Boolean) as Frame[];
    if (chosen.length) return chosen;
  }
  // Default mix: bias code/design, always include ≥1 wild for range.
  const wild = FRAMES.filter((f) => f.tags.includes("wild"));
  const nonWild = FRAMES.filter((f) => !f.tags.includes("wild"));
  const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  const out = [shuffle(wild)[0], ...shuffle(nonWild).slice(0, n - 1)];
  return out.filter(Boolean).slice(0, n);
}
function extractJson(raw: string): unknown | null {
  // claude -p --output-format json wraps result; also tolerate bare JSON or fenced.
  try { const env = JSON.parse(raw); if (env && typeof env === "object" && "result" in env) {
    const inner = (env as { result: string }).result;
    return extractJson(inner);
  } } catch { /* not an envelope */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const objMatch = body.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try { return JSON.parse(objMatch[0]); } catch { return null; }
}

// ── init ──────────────────────────────────────────────────────────────────────
async function cmdInit(args: Record<string, string>) {
  let problem = args.problem ?? "";
  if (problem.startsWith("@")) problem = await readFile(problem.slice(1), "utf8");
  if (!problem.trim()) throw new Error("--problem <text|@file> required");

  const n = Number.parseInt(args.n ?? "5", 10);
  const slug = slugify(args.slug ?? problem.split("\n")[0]);
  const runId = `${stamp()}-${slug}`;
  const runDir = join(ADHD_ROOT, runId);
  const frames = pickFrames(n, args.frames);
  const repo = args.repo ? resolve(args.repo.replace("~", process.env.HOME ?? "")) : "";

  await mkdir(join(runDir, "artifacts", "research"), { recursive: true });
  await mkdir(join(runDir, "results"), { recursive: true });
  for (const f of frames) await mkdir(join(runDir, "frames", f.name), { recursive: true });

  await writeFile(join(runDir, "PROBLEM.md"), `# Problem\n\n${problem.trim()}\n`);
  const meta = {
    runId, runDir, problem: problem.trim(), repo,
    frames: frames.map((f) => f.name), createdAt: new Date().toISOString(),
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(meta, null, 2));

  // Per-frame grounding file.
  for (const f of frames) {
    const grounding = [
      `# Frame: ${f.name}`, "", `## Vantage`, f.vantage, "",
      `## Problem`, problem.trim(), "",
      `## Grounding`,
      repo ? `- Repo (read-only): ${repo}` : "- No repo attached (abstract grounding).",
      `- Shared artifacts: ${join(runDir, "artifacts")}`,
      `- MCP tools: whatever is configured in your .mcp.json (if any).`,
      "", `## Output`, `Write your JSON to: ${join(runDir, "frames", f.name, "output.json")}`,
    ].join("\n");
    await writeFile(join(runDir, "frames", f.name, "GROUNDING.md"), grounding);
  }

  console.log(JSON.stringify({ ok: true, runId, runDir, frames: meta.frames, repo: repo || null }, null, 2));
}

// ── diverge ─────────────────────────────────────────────────────────────────--
async function launchFrame(runDir: string, frame: Frame, problem: string, repo: string, opts: { allowDangerous: boolean }): Promise<void> {
  const frameDir = join(runDir, "frames", frame.name);
  const outPath = join(frameDir, "output.json");
  const rawPath = join(frameDir, "raw.json");
  const artifactsDir = join(runDir, "artifacts");

  const prompt = [
    `FRAME: ${frame.name}`, `VANTAGE: ${frame.vantage}`, "",
    `PROBLEM:`, problem, "",
    repo ? `You have read access to the repo at ${repo} and shared artifacts at ${artifactsDir}. Ground your ideas in what you actually find there.` :
           `You have read access to shared artifacts at ${artifactsDir}.`,
    `Generate exactly 6 ideas under your frame, banning the first three obvious answers. Output the JSON object as instructed.`,
  ].join("\n");

  const args = [
    "claude", "-p", prompt,
    "--output-format", "json",
    "--append-system-prompt", DIVERGENT_SYSTEM,
    "--add-dir", artifactsDir,
  ];
  // Opt-in only: skipping permission prompts is dangerous on an unknown machine.
  if (opts.allowDangerous) args.push("--dangerously-skip-permissions");
  // Only pass --mcp-config when a config actually exists; otherwise claude errors out.
  if (existsSync(MCP_CONFIG)) args.push("--mcp-config", MCP_CONFIG);
  if (repo) args.push("--add-dir", repo);

  try {
    const proc = Bun.spawn(args, { cwd: frameDir, stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    await writeFile(rawPath, out);
    const parsed = extractJson(out);
    if (parsed) {
      await writeFile(outPath, JSON.stringify(parsed, null, 2));
    } else {
      await writeFile(outPath, JSON.stringify({ frame: frame.name, ideas: [], error: "parse-failed" }, null, 2));
    }
  } catch (e) {
    await writeFile(outPath, JSON.stringify({ frame: frame.name, ideas: [], error: String(e) }, null, 2));
  }
}

async function cmdDiverge(args: Record<string, string>) {
  const runDir = resolve(args.run ?? "");
  if (!runDir || !existsSync(join(runDir, "run.json"))) throw new Error("--run <run-dir> with run.json required");
  const meta = JSON.parse(await readFile(join(runDir, "run.json"), "utf8")) as {
    problem: string; repo: string; frames: string[];
  };
  const frames = meta.frames.map((nm) => FRAMES.find((f) => f.name === nm)).filter(Boolean) as Frame[];

  const allowDangerous = args["allow-dangerous"] === "true" || process.env.ADHD_ALLOW_DANGEROUS_PERMISSIONS === "1";
  if (!existsSync(MCP_CONFIG)) {
    console.error(`[adhd] no .mcp.json at ${MCP_CONFIG} — frames run without MCP tools.`);
  }

  console.log(`[adhd] launching ${frames.length} grounded frames in parallel: ${frames.map((f) => f.name).join(", ")}`);
  const t0 = Date.now();
  // True parallel: launch all, await the barrier.
  await Promise.all(frames.map((f) => launchFrame(runDir, f, meta.problem, meta.repo, { allowDangerous })));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Aggregate into results/diverge.json
  const pool: unknown[] = [];
  for (const f of frames) {
    const p = join(runDir, "frames", f.name, "output.json");
    if (existsSync(p)) {
      try { pool.push(JSON.parse(await readFile(p, "utf8"))); } catch { /* skip */ }
    }
  }
  const aggPath = join(runDir, "results", "diverge.json");
  await writeFile(aggPath, JSON.stringify({ runDir, elapsedSec: Number(elapsed), frames: pool }, null, 2));

  const ideaCount = pool.reduce((acc: number, fr) => acc + (((fr as { ideas?: unknown[] }).ideas?.length) ?? 0), 0);
  console.log(JSON.stringify({ ok: true, elapsedSec: Number(elapsed), frames: pool.length, ideas: ideaCount, diverge: aggPath }, null, 2));
}

// ── status ──────────────────────────────────────────────────────────────────--
async function cmdStatus(args: Record<string, string>) {
  const runDir = resolve(args.run ?? "");
  if (!existsSync(join(runDir, "run.json"))) throw new Error("--run <run-dir> required");
  const meta = JSON.parse(await readFile(join(runDir, "run.json"), "utf8")) as { frames: string[] };
  const rows = [];
  for (const nm of meta.frames) {
    const p = join(runDir, "frames", nm, "output.json");
    let state = "pending", ideas = 0;
    if (existsSync(p)) {
      try { const j = JSON.parse(await readFile(p, "utf8")); ideas = j.ideas?.length ?? 0; state = j.error ? `error:${j.error}` : "done"; } catch { state = "unreadable"; }
    }
    rows.push({ frame: nm, state, ideas });
  }
  console.log(JSON.stringify({ runDir, frames: rows }, null, 2));
}

// ── main ────────────────────────────────────────────────────────────────────--
const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
try {
  switch (cmd) {
    case "init": await cmdInit(args); break;
    case "diverge": await cmdDiverge(args); break;
    case "status": await cmdStatus(args); break;
    case "frames": console.log(JSON.stringify(FRAMES.map((f) => ({ name: f.name, tags: f.tags })), null, 2)); break;
    default:
      console.log("usage: adhd.ts <init|diverge|status|frames> [flags]");
      console.log("  init    --problem <text|@file> [--slug s] [--frames a,b,c] [--repo path] [--n 5]");
      console.log("  diverge --run <run-dir>");
      console.log("  status  --run <run-dir>");
      console.log("  frames");
  }
} catch (e) {
  console.error(`[adhd] error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
