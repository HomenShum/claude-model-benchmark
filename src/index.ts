#!/usr/bin/env node

/**
 * claude-model-benchmark — Benchmark AI models side-by-side.
 * Claude vs GPT vs Gemini. Bring your own keys.
 *
 * Multi-provider BYOK benchmarking with cross-provider comparison reports.
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
} from "./providers";
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

// ── CLI ─────────────────────────────────────────────────────────────────────

import * as benchmarkMod from "./benchmark";
import * as providersMod from "./providers";
import type {
  PromptCase as PromptCaseType,
  BenchmarkResult as BenchmarkResultType,
} from "./types";

const VERSION = "2.0.0";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

function printHelp(): void {
  console.log(`claude-model-benchmark v${VERSION}
Benchmark AI models side-by-side. Claude vs GPT vs Gemini. BYOK.

Usage:
  claude-model-benchmark run [options]           Run benchmark against live APIs
  claude-model-benchmark dry-run                 Generate mock cross-provider report (no keys needed)
  claude-model-benchmark compare <m1> <m2> [options]  Side-by-side model comparison
  claude-model-benchmark providers               Show configured providers and available models
  claude-model-benchmark report <file>           Generate report from saved results JSON
  claude-model-benchmark --help                  Show this help

Run Options:
  --models <list>      Comma-separated: haiku,gpt-4o-mini,gemini-2.0-flash
  --providers <list>   Comma-separated: anthropic,openai,gemini
  --prompts <file>     Path to prompts JSON file (default: built-in suite)
  --output <file>      Save results JSON to file

Compare Options:
  --prompt <text>      Custom prompt for side-by-side comparison
  --max-tokens <n>     Max output tokens (default: 1024)

Environment Variables (BYOK):
  ANTHROPIC_API_KEY    For Claude models (Haiku 4.5, Sonnet 4.5)
  OPENAI_API_KEY       For GPT models (GPT-4o Mini, GPT-4o)
  GEMINI_API_KEY       For Gemini models (Gemini 2.0 Flash)

Examples:
  claude-model-benchmark dry-run
  claude-model-benchmark providers
  claude-model-benchmark run --providers anthropic,openai
  claude-model-benchmark run --models haiku,gpt-4o-mini
  claude-model-benchmark compare haiku gpt-4o-mini --prompt "Write a haiku about code"
  claude-model-benchmark report results.json`);
}

// ── Command: providers ──────────────────────────────────────────────────────

function cmdProviders(): void {
  console.log(`claude-model-benchmark v${VERSION} — Provider Status\n`);

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
      console.log(`    ${model.label} (${model.id}) — ${costInfo}`);
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
  console.log(`claude-model-benchmark v${VERSION} — Dry Run (Mock Data)\n`);
  console.log("Generating cross-provider benchmark with mock data...");
  console.log("(No API keys needed — all providers simulated)\n");
  const report = benchmarkMod.generateDryRunReport();
  console.log(report.markdown);
  console.log(`\n${report.summary}`);
}

// ── Command: report ─────────────────────────────────────────────────────────

async function cmdReport(filePath: string): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} — Report from ${filePath}\n`);
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

// ── Command: compare ────────────────────────────────────────────────────────

async function cmdCompare(args: string[]): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} — Side-by-Side Comparison\n`);

  // Parse model names (first two positional args after "compare")
  const modelArgs: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      i++; // skip flag value
      continue;
    }
    modelArgs.push(args[i]);
  }

  if (modelArgs.length < 2) {
    console.error(
      "Need at least 2 models to compare.\nUsage: claude-model-benchmark compare <model1> <model2> [--prompt <text>]"
    );
    process.exit(1);
  }

  // Resolve models
  const resolved = modelArgs.map((q) => ({
    query: q,
    model: providersMod.resolveModel(q),
  }));
  for (const r of resolved) {
    if (!r.model) {
      console.error(`Unknown model: "${r.query}". Use "providers" command to see available models.`);
      process.exit(1);
    }
  }

  // Check API keys
  for (const r of resolved) {
    const key = providersMod.getApiKey(r.model!.provider);
    if (!key) {
      console.error(
        `Missing API key for ${r.model!.providerName}. Set ${providersMod.PROVIDERS[r.model!.provider]?.envKey}`
      );
      process.exit(1);
    }
  }

  // Build prompts
  const customPrompt = getArg(args, "--prompt");
  const maxTokens = parseInt(getArg(args, "--max-tokens") || "1024", 10);
  const prompts: PromptCaseType[] = customPrompt
    ? [{ name: "custom", prompt: customPrompt }]
    : benchmarkMod.DEFAULT_PROMPTS;

  console.log(
    `Comparing: ${resolved.map((r) => `${r.model!.label} (${r.model!.providerName})`).join(" vs ")}`
  );
  console.log(`Prompts: ${prompts.length}`);
  console.log("");

  const result = await benchmarkMod.runBenchmark({
    models: modelArgs,
    prompts,
    maxTokens,
  });

  // Save output if requested
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

// ── Command: run ────────────────────────────────────────────────────────────

async function cmdRun(args: string[]): Promise<void> {
  console.log(`claude-model-benchmark v${VERSION} — Live Benchmark\n`);

  // Parse flags
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

  // Show provider status
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

  // Save results if requested
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
