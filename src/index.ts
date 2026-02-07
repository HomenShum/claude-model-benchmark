#!/usr/bin/env node

/**
 * claude-model-benchmark — Deep agent for AI model benchmarking.
 *
 * ReAct agent: discover models -> design tests -> execute -> analyze -> recommend.
 * Inspired by LangChain ReAct, Anthropic agents, Manus AI.
 * Multi-provider BYOK with cross-provider comparison.
 */

// ── Public API (programmatic usage) ─────────────────────────────────────────

export {
  runBenchmark,
  generateReport,
  generateDryRunReport,
  DEFAULT_PROMPTS,
  computeStats,
  percentile,
} from "./benchmark";
export {
  PROVIDERS,
  getAvailableProviders,
  getAllModels,
  resolveModel,
  getApiKey,
  callProvider,
  callProviderMultiTurn,
} from "./providers";
export {
  runAgent,
  createBenchmarkTools,
  createCompareTools,
} from "./agent";
export type {
  BenchmarkOptions,
  BenchmarkResult,
  ProviderConfig,
  ModelDef,
  ModelResult,
  ModelStats,
  PromptCase,
  ReportOutput,
  WinnerRecommendation,
  ApiCallResult,
} from "./types";
export type { AgentTool, AgentStep, AgentResult } from "./agent";

// ── CLI ─────────────────────────────────────────────────────────────────────

import * as benchmarkMod from "./benchmark";
import * as providersMod from "./providers";
import { runAgent, createBenchmarkTools, createCompareTools } from "./agent";
import type { AgentResult } from "./agent";
import type {
  PromptCase as PromptCaseType,
  BenchmarkResult as BenchmarkResultType,
} from "./types";

const VERSION = "3.0.0";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

function formatAgentResult(result: AgentResult): string {
  const lines: string[] = [];

  if (result.steps.length > 0) {
    lines.push(`\n  Agent Trace (${result.totalSteps} steps):`);
    lines.push(`  ${"=".repeat(50)}`);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      lines.push(`  Step ${i + 1}: [${step.action}]`);
      lines.push(`    Thought: ${step.thought}`);
      const preview = step.observation.length > 300
        ? step.observation.slice(0, 300) + "..."
        : step.observation;
      lines.push(`    Result: ${preview}`);
      lines.push("");
    }
  }

  lines.push(`  Final Answer:`);
  lines.push(`  ${"=".repeat(50)}`);
  lines.push(result.finalAnswer);
  lines.push(`\n  ---`);
  lines.push(`  Agent: ${result.totalSteps} steps | Provider: ${result.provider}`);

  return lines.join("\n");
}

function printHelp(): void {
  console.log(`claude-model-benchmark v${VERSION}
Deep agent for AI model benchmarking. Claude vs GPT vs Gemini. BYOK.

ReAct agent: discover models -> design tests -> execute -> analyze -> recommend.
Inspired by LangChain ReAct, Anthropic agents, Manus AI.

Usage:
  claude-model-benchmark agent [options]         Deep agent benchmark (multi-step)
  claude-model-benchmark run [options]           Direct benchmark against live APIs
  claude-model-benchmark compare <m1> <m2>       Agent-powered side-by-side comparison
  claude-model-benchmark dry-run                 Mock cross-provider report (no keys)
  claude-model-benchmark providers               Show configured providers and models
  claude-model-benchmark report <file>           Generate report from saved JSON
  claude-model-benchmark --help                  Show this help

Agent Options:
  --goal <text>       Custom benchmarking goal
  --max-steps <n>     Max agent steps (default: 8)

Run Options:
  --models <list>     Comma-separated model names
  --providers <list>  Comma-separated provider names
  --prompts <file>    Prompts JSON file
  --output <file>     Save results to file

Compare Options:
  --prompt <text>     Custom prompt for comparison
  --max-tokens <n>    Max output tokens (default: 1024)

Environment (BYOK):
  ANTHROPIC_API_KEY   Claude Haiku 4.5, Sonnet 4.5, Opus 4.6
  OPENAI_API_KEY      GPT-5 Mini, GPT-5, GPT-5.2
  GEMINI_API_KEY      Gemini 3 Flash, Gemini 3 Pro

Examples:
  claude-model-benchmark agent
  claude-model-benchmark agent --goal "Compare reasoning ability"
  claude-model-benchmark compare haiku gpt-5-mini
  claude-model-benchmark run --providers anthropic,openai
  claude-model-benchmark dry-run
  claude-model-benchmark providers`);
}

// ── Command: providers ──────────────────────────────────────────────────────

function cmdProviders(): void {
  console.log(`claude-model-benchmark v${VERSION} -- Provider Status\n`);

  const available = providersMod.getAvailableProviders();
  let configuredCount = 0;
  let totalModels = 0;

  for (const [key, cfg] of Object.entries(providersMod.PROVIDERS)) {
    const hasKey = available.includes(key);
    if (hasKey) configuredCount++;
    const status = hasKey ? "READY" : `NOT CONFIGURED (set ${cfg.envKey})`;
    const icon = hasKey ? "[+]" : "[-]";
    console.log(`${icon} ${cfg.name} (${key}): ${status}`);
    for (const model of cfg.models) {
      totalModels++;
      const costInfo =
        model.inputCost === 0 && model.outputCost === 0
          ? "FREE"
          : `$${model.inputCost}/1K in, $${model.outputCost}/1K out`;
      console.log(`    ${model.label} (${model.id}) -- ${costInfo}`);
    }
    console.log("");
  }

  console.log(
    `${configuredCount}/${Object.keys(providersMod.PROVIDERS).length} providers configured, ${totalModels} models available.`
  );

  if (configuredCount === 0) {
    console.log(
      "\nNo API keys found. Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY"
    );
    console.log(
      'Or try "claude-model-benchmark dry-run" for a demo without API keys.'
    );
  }
}

// ── Command: dry-run ────────────────────────────────────────────────────────

function cmdDryRun(): void {
  console.log(`claude-model-benchmark v${VERSION} -- Dry Run (Mock Data)\n`);
  console.log("Generating cross-provider benchmark with mock data...\n");
  const report = benchmarkMod.generateDryRunReport();
  console.log(report.markdown);
  console.log(`\n${report.summary}`);
}

// ── Command: agent (deep agent benchmark) ───────────────────────────────────

async function cmdAgent(args: string[]): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} -- Deep Agent Benchmark\n`);

  const available = providersMod.getAvailableProviders();
  if (available.length === 0) {
    console.error(
      "No API keys configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY."
    );
    process.exit(1);
  }

  const customGoal = getArg(args, "--goal");
  const maxSteps = parseInt(getArg(args, "--max-steps") || "8", 10);

  const goal =
    customGoal ||
    "Benchmark all available models. List them first, design 3 test prompts for reasoning and creativity, run each test on each model, compute statistics, compare results, and give a clear recommendation for best overall, best value, and fastest.";

  console.log("Running deep agent benchmark...\n");

  const result = await runAgent({
    goal,
    tools: createBenchmarkTools(),
    maxSteps,
  });

  console.log(formatAgentResult(result));
}

// ── Command: compare (agent-powered) ────────────────────────────────────────

async function cmdCompare(args: string[]): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} -- Agent Comparison\n`);

  const modelArgs: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      i++;
      continue;
    }
    modelArgs.push(args[i]);
  }

  if (modelArgs.length < 2) {
    console.error(
      "Need at least 2 models to compare.\nUsage: claude-model-benchmark compare <model1> <model2>"
    );
    process.exit(1);
  }

  const customPrompt = getArg(args, "--prompt");
  const promptCtx = customPrompt
    ? ` Use this test prompt: "${customPrompt}"`
    : "";

  const result = await runAgent({
    goal: `Compare these models side by side: ${modelArgs.join(", ")}. Run tests on each, compute statistics, compare response quality, and recommend a winner.${promptCtx}`,
    tools: createCompareTools(),
  });

  console.log(formatAgentResult(result));
}

// ── Command: report ─────────────────────────────────────────────────────────

async function cmdReport(filePath: string): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} -- Report from ${filePath}\n`);
  const fs = await import("fs");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const data = JSON.parse(
    fs.readFileSync(filePath, "utf-8")
  ) as BenchmarkResultType;
  const report = benchmarkMod.generateReport(data);
  console.log(report.markdown);
  console.log(`\n${report.summary}`);
}

// ── Command: run (direct benchmark) ─────────────────────────────────────────

async function cmdRun(args: string[]): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} -- Live Benchmark\n`);

  const providersArg = getArg(args, "--providers");
  const providers = providersArg ? providersArg.split(",") : undefined;

  const modelsArg = getArg(args, "--models");
  const models = modelsArg ? modelsArg.split(",") : undefined;

  const promptsArg = getArg(args, "--prompts");
  let prompts: PromptCaseType[] | undefined;
  if (promptsArg) {
    const fs = await import("fs");
    prompts = JSON.parse(fs.readFileSync(promptsArg, "utf-8"));
  }

  const available = providersMod.getAvailableProviders();
  console.log("Provider Status:");
  for (const [key, cfg] of Object.entries(providersMod.PROVIDERS)) {
    const hasKey = available.includes(key);
    const status = hasKey ? "READY" : `MISSING (set ${cfg.envKey})`;
    const icon = hasKey ? "[+]" : "[-]";
    console.log(`  ${icon} ${cfg.name}: ${status}`);
    for (const model of cfg.models) {
      console.log(`      ${model.label} (${model.id})`);
    }
  }
  console.log("");

  console.log("Running cross-provider benchmark...\n");
  const result = await benchmarkMod.runBenchmark({ providers, models, prompts });

  const outputPath = getArg(args, "--output");
  if (outputPath) {
    const fs = await import("fs");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved to ${outputPath}`);
  }

  const report = benchmarkMod.generateReport(result);
  console.log(`\n${report.markdown}`);
  console.log(`\n${report.summary}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case "agent":
      await cmdAgent(args);
      return;

    case "dry-run":
    case "demo":
      cmdDryRun();
      return;

    case "providers":
      cmdProviders();
      return;

    case "report": {
      const filePath = args[1];
      if (!filePath) {
        console.error(
          "Missing results file. Usage: claude-model-benchmark report <results.json>"
        );
        process.exit(1);
      }
      await cmdReport(filePath);
      return;
    }

    case "compare":
      await cmdCompare(args);
      return;

    case "run":
      await cmdRun(args);
      return;

    default:
      console.error(`Unknown command: ${command}. Use --help for usage.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
