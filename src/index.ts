#!/usr/bin/env node

/**
 * claude-model-benchmark — Benchmark Claude models side-by-side.
 *
 * Measures latency, token usage, and output quality across prompts.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptCase {
  name: string;
  prompt: string;
  rubric?: string[];
  maxTokens?: number;
}

export interface ModelResult {
  model: string;
  modelId: string;
  prompt: string;
  promptName: string;
  response: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error?: string;
}

export interface ModelStats {
  model: string;
  totalRuns: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  totalCostUsd: number;
  errorRate: number;
}

export interface BenchmarkResult {
  timestamp: string;
  results: ModelResult[];
  stats: ModelStats[];
  models: string[];
  promptCount: number;
}

export interface BenchmarkOptions {
  models?: string[];
  prompts?: PromptCase[];
  apiKey?: string;
  maxTokens?: number;
}

export interface ReportOutput {
  markdown: string;
  summary: string;
}

// ─── Model Catalog ──────────────────────────────────────────────────────────

const MODEL_CATALOG: Record<string, { id: string; inputPer1k: number; outputPer1k: number }> = {
  haiku: { id: "claude-haiku-4-5-20251001", inputPer1k: 0.001, outputPer1k: 0.005 },
  sonnet: { id: "claude-sonnet-4-5-20250929", inputPer1k: 0.003, outputPer1k: 0.015 },
  opus: { id: "claude-opus-4-6", inputPer1k: 0.015, outputPer1k: 0.075 },
};

const DEFAULT_PROMPTS: PromptCase[] = [
  {
    name: "code-generation",
    prompt: "Write a TypeScript function that checks if a string is a valid palindrome, ignoring spaces and punctuation.",
    rubric: ["correctness", "efficiency", "readability"],
  },
  {
    name: "reasoning",
    prompt: "A farmer has 17 sheep. All but 9 die. How many are left? Explain your reasoning step by step.",
    rubric: ["correctness", "clarity"],
  },
  {
    name: "summarization",
    prompt: "Summarize the key differences between TCP and UDP protocols in exactly 3 bullet points.",
    rubric: ["accuracy", "conciseness", "completeness"],
  },
  {
    name: "creative",
    prompt: "Write a 4-line poem about a neural network learning to see.",
    rubric: ["creativity", "coherence"],
  },
];

// ─── API Client ─────────────────────────────────────────────────────────────

async function callClaude(
  modelId: string,
  prompt: string,
  apiKey: string,
  maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number; latencyMs: number }> {
  const start = Date.now();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  return { text, inputTokens, outputTokens, latencyMs };
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeStats(results: ModelResult[]): ModelStats[] {
  const byModel = new Map<string, ModelResult[]>();
  for (const r of results) {
    const list = byModel.get(r.model) || [];
    list.push(r);
    byModel.set(r.model, list);
  }

  const stats: ModelStats[] = [];
  for (const [model, runs] of byModel) {
    const latencies = runs.filter((r) => !r.error).map((r) => r.latencyMs);
    const errors = runs.filter((r) => r.error).length;

    stats.push({
      model,
      totalRuns: runs.length,
      avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50LatencyMs: latencies.length > 0 ? percentile(latencies, 50) : 0,
      p95LatencyMs: latencies.length > 0 ? percentile(latencies, 95) : 0,
      p99LatencyMs: latencies.length > 0 ? percentile(latencies, 99) : 0,
      avgInputTokens: Math.round(runs.reduce((a, r) => a + r.inputTokens, 0) / runs.length),
      avgOutputTokens: Math.round(runs.reduce((a, r) => a + r.outputTokens, 0) / runs.length),
      totalCostUsd: runs.reduce((a, r) => a + r.costUsd, 0),
      errorRate: errors / runs.length,
    });
  }

  return stats.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
}

// ─── Benchmark Runner ───────────────────────────────────────────────────────

export async function runBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const models = options.models || ["haiku", "sonnet"];
  const prompts = options.prompts || DEFAULT_PROMPTS;
  const maxTokens = options.maxTokens || 1024;
  const results: ModelResult[] = [];

  for (const promptCase of prompts) {
    for (const modelName of models) {
      const catalog = MODEL_CATALOG[modelName];
      if (!catalog) {
        results.push({
          model: modelName,
          modelId: "unknown",
          prompt: promptCase.prompt,
          promptName: promptCase.name,
          response: "",
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          error: `Unknown model: ${modelName}`,
        });
        continue;
      }

      try {
        const res = await callClaude(catalog.id, promptCase.prompt, apiKey, promptCase.maxTokens || maxTokens);
        const cost = (res.inputTokens / 1000) * catalog.inputPer1k + (res.outputTokens / 1000) * catalog.outputPer1k;

        results.push({
          model: modelName,
          modelId: catalog.id,
          prompt: promptCase.prompt,
          promptName: promptCase.name,
          response: res.text,
          latencyMs: res.latencyMs,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          costUsd: Math.round(cost * 1000000) / 1000000,
        });

        console.log(`  [${modelName}] ${promptCase.name}: ${res.latencyMs}ms, ${res.outputTokens} tokens`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          model: modelName,
          modelId: catalog.id,
          prompt: promptCase.prompt,
          promptName: promptCase.name,
          response: "",
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          error: message,
        });
        console.log(`  [${modelName}] ${promptCase.name}: ERROR - ${message}`);
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    stats: computeStats(results),
    models,
    promptCount: prompts.length,
  };
}

// ─── Report Generation ──────────────────────────────────────────────────────

export function generateReport(benchmark: BenchmarkResult): ReportOutput {
  const lines: string[] = [];
  lines.push("# Claude Model Benchmark Report");
  lines.push(`\nDate: ${benchmark.timestamp}`);
  lines.push(`Models: ${benchmark.models.join(", ")}`);
  lines.push(`Prompts: ${benchmark.promptCount}`);

  // Stats table
  lines.push("\n## Performance Summary\n");
  lines.push("| Model | Avg Latency | P50 | P95 | Avg Output Tokens | Total Cost | Errors |");
  lines.push("|-------|------------|-----|-----|-------------------|------------|--------|");
  for (const s of benchmark.stats) {
    lines.push(
      `| ${s.model} | ${s.avgLatencyMs}ms | ${s.p50LatencyMs}ms | ${s.p95LatencyMs}ms | ${s.avgOutputTokens} | $${s.totalCostUsd.toFixed(4)} | ${(s.errorRate * 100).toFixed(0)}% |`
    );
  }

  // Per-prompt breakdown
  lines.push("\n## Per-Prompt Results\n");
  const promptNames = [...new Set(benchmark.results.map((r) => r.promptName))];
  for (const pName of promptNames) {
    lines.push(`### ${pName}\n`);
    const promptResults = benchmark.results.filter((r) => r.promptName === pName);
    lines.push("| Model | Latency | Tokens | Cost | Status |");
    lines.push("|-------|---------|--------|------|--------|");
    for (const r of promptResults) {
      const status = r.error ? `Error: ${r.error.slice(0, 40)}` : "OK";
      lines.push(`| ${r.model} | ${r.latencyMs}ms | ${r.outputTokens} | $${r.costUsd.toFixed(6)} | ${status} |`);
    }
    lines.push("");
  }

  const markdown = lines.join("\n");
  const fastest = benchmark.stats[0];
  const summary = fastest
    ? `Fastest: ${fastest.model} (${fastest.avgLatencyMs}ms avg). ${benchmark.results.length} runs across ${benchmark.models.length} models.`
    : "No results.";

  return { markdown, summary };
}

// ─── Offline Mode (no API key needed) ───────────────────────────────────────

export function generateDryRunReport(): ReportOutput {
  const mockResults: ModelResult[] = [];
  const models = ["haiku", "sonnet", "opus"];
  const prompts = DEFAULT_PROMPTS;

  for (const p of prompts) {
    for (const m of models) {
      const catalog = MODEL_CATALOG[m];
      const mockLatency = m === "haiku" ? 200 + Math.random() * 100 : m === "sonnet" ? 500 + Math.random() * 200 : 1000 + Math.random() * 500;
      const mockOutputTokens = 50 + Math.floor(Math.random() * 200);
      const mockInputTokens = Math.floor(p.prompt.length / 4);
      const cost = (mockInputTokens / 1000) * catalog.inputPer1k + (mockOutputTokens / 1000) * catalog.outputPer1k;

      mockResults.push({
        model: m,
        modelId: catalog.id,
        prompt: p.prompt,
        promptName: p.name,
        response: `[Mock ${m} response for ${p.name}]`,
        latencyMs: Math.round(mockLatency),
        inputTokens: mockInputTokens,
        outputTokens: mockOutputTokens,
        costUsd: Math.round(cost * 1000000) / 1000000,
      });
    }
  }

  const benchmark: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    results: mockResults,
    stats: computeStats(mockResults),
    models,
    promptCount: prompts.length,
  };

  return generateReport(benchmark);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`claude-model-benchmark v1.0.0

Usage:
  claude-model-benchmark run [options]
  claude-model-benchmark dry-run
  claude-model-benchmark report <results.json>
  claude-model-benchmark --help

Commands:
  run        Run benchmark against Claude API (requires ANTHROPIC_API_KEY)
  dry-run    Generate mock report without API calls
  report     Generate report from saved results JSON

Options:
  --models <list>    Comma-separated: haiku,sonnet,opus (default: haiku,sonnet)
  --prompts <file>   Path to prompts JSON file (default: built-in suite)
  --output <file>    Save results JSON to file
  --help             Show this help`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printHelp();
    return;
  }

  const command = args[0];

  if (command === "dry-run") {
    const report = generateDryRunReport();
    console.log(report.markdown);
    console.log(`\n${report.summary}`);
    return;
  }

  if (command === "report") {
    const filePath = args[1];
    if (!filePath) {
      console.error("Missing results file. Usage: claude-model-benchmark report <results.json>");
      process.exit(1);
    }
    const fs = await import("fs");
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as BenchmarkResult;
    const report = generateReport(data);
    console.log(report.markdown);
    return;
  }

  if (command === "run") {
    const modelsIdx = args.indexOf("--models");
    const models = modelsIdx !== -1 && args[modelsIdx + 1] ? args[modelsIdx + 1].split(",") : undefined;

    const promptsIdx = args.indexOf("--prompts");
    let prompts: PromptCase[] | undefined;
    if (promptsIdx !== -1 && args[promptsIdx + 1]) {
      const fs = await import("fs");
      prompts = JSON.parse(fs.readFileSync(args[promptsIdx + 1], "utf-8"));
    }

    console.log("Running Claude model benchmark...\n");
    const result = await runBenchmark({ models, prompts });

    const outputIdx = args.indexOf("--output");
    if (outputIdx !== -1 && args[outputIdx + 1]) {
      const fs = await import("fs");
      fs.writeFileSync(args[outputIdx + 1], JSON.stringify(result, null, 2));
      console.log(`\nResults saved to ${args[outputIdx + 1]}`);
    }

    const report = generateReport(result);
    console.log(`\n${report.markdown}`);
    console.log(`\n${report.summary}`);
    return;
  }

  console.error(`Unknown command: ${command}. Use --help for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
