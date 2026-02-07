/**
 * claude-model-benchmark — Core benchmark engine.
 *
 * Runs prompts against multiple providers/models, computes stats, generates reports.
 */

import type {
  PromptCase,
  ModelResult,
  ModelStats,
  BenchmarkResult,
  BenchmarkOptions,
  ReportOutput,
  WinnerRecommendation,
} from "./types";
import {
  PROVIDERS,
  getAvailableProviders,
  getAllModels,
  resolveModel,
  getApiKey,
  callProvider,
} from "./providers";

// ─── Default Prompts ─────────────────────────────────────────────────────────

export const DEFAULT_PROMPTS: PromptCase[] = [
  {
    name: "code-generation",
    prompt:
      "Write a TypeScript function that checks if a string is a valid palindrome, ignoring spaces and punctuation.",
    rubric: ["correctness", "efficiency", "readability"],
  },
  {
    name: "reasoning",
    prompt:
      "A farmer has 17 sheep. All but 9 die. How many are left? Explain your reasoning step by step.",
    rubric: ["correctness", "clarity"],
  },
  {
    name: "summarization",
    prompt:
      "Summarize the key differences between TCP and UDP protocols in exactly 3 bullet points.",
    rubric: ["accuracy", "conciseness", "completeness"],
  },
  {
    name: "creative",
    prompt: "Write a 4-line poem about a neural network learning to see.",
    rubric: ["creativity", "coherence"],
  },
];

// ─── Statistics ──────────────────────────────────────────────────────────────

export function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function computeStats(results: ModelResult[]): ModelStats[] {
  // Group by model label (which includes provider context)
  const byModel = new Map<string, ModelResult[]>();
  for (const r of results) {
    const key = r.model;
    const list = byModel.get(key) || [];
    list.push(r);
    byModel.set(key, list);
  }

  const stats: ModelStats[] = [];
  for (const [model, runs] of byModel) {
    const latencies = runs.filter((r) => !r.error).map((r) => r.latencyMs);
    const errors = runs.filter((r) => r.error).length;
    const totalOutput = runs.reduce((a, r) => a + r.outputTokens, 0);
    const totalCost = runs.reduce((a, r) => a + r.costUsd, 0);

    stats.push({
      model,
      provider: runs[0].provider,
      totalRuns: runs.length,
      avgLatencyMs:
        latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : 0,
      p50LatencyMs: latencies.length > 0 ? percentile(latencies, 50) : 0,
      p95LatencyMs: latencies.length > 0 ? percentile(latencies, 95) : 0,
      p99LatencyMs: latencies.length > 0 ? percentile(latencies, 99) : 0,
      avgInputTokens: Math.round(
        runs.reduce((a, r) => a + r.inputTokens, 0) / runs.length
      ),
      avgOutputTokens: Math.round(totalOutput / runs.length),
      totalCostUsd: totalCost,
      costPer1kTokens:
        totalOutput > 0
          ? Math.round((totalCost / totalOutput) * 1000 * 1000000) / 1000000
          : 0,
      errorRate: errors / runs.length,
    });
  }

  return stats.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
}

// ─── Winner Recommendation ───────────────────────────────────────────────────

function pickWinner(stats: ModelStats[]): WinnerRecommendation | undefined {
  const valid = stats.filter((s) => s.errorRate < 1);
  if (valid.length === 0) return undefined;

  const fastest = valid.reduce((a, b) =>
    a.avgLatencyMs < b.avgLatencyMs ? a : b
  );
  const cheapest = valid.reduce((a, b) =>
    a.totalCostUsd < b.totalCostUsd ? a : b
  );

  // Best value: lowest (normalized latency + normalized cost)
  const maxLatency = Math.max(...valid.map((s) => s.avgLatencyMs), 1);
  const maxCost = Math.max(...valid.map((s) => s.totalCostUsd), 0.000001);
  const bestValue = valid.reduce((a, b) => {
    const scoreA =
      a.avgLatencyMs / maxLatency + a.totalCostUsd / maxCost;
    const scoreB =
      b.avgLatencyMs / maxLatency + b.totalCostUsd / maxCost;
    return scoreA < scoreB ? a : b;
  });

  return {
    fastest: `${fastest.model} (${fastest.provider})`,
    cheapest: `${cheapest.model} (${cheapest.provider})`,
    bestValue: `${bestValue.model} (${bestValue.provider})`,
    summary: `Fastest: ${fastest.model} at ${fastest.avgLatencyMs}ms avg. Cheapest: ${cheapest.model} at $${cheapest.totalCostUsd.toFixed(4)}. Best value: ${bestValue.model}.`,
  };
}

// ─── Benchmark Runner ────────────────────────────────────────────────────────

export async function runBenchmark(
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const prompts = options.prompts || DEFAULT_PROMPTS;
  const maxTokens = options.maxTokens || 1024;
  const results: ModelResult[] = [];

  // Determine which models to benchmark
  let modelsToRun: Array<{
    label: string;
    id: string;
    provider: string;
    providerName: string;
    inputCost: number;
    outputCost: number;
  }> = [];

  if (options.models && options.models.length > 0) {
    // User specified specific models
    for (const q of options.models) {
      const resolved = resolveModel(q);
      if (resolved) {
        modelsToRun.push({
          label: resolved.label,
          id: resolved.id,
          provider: resolved.provider,
          providerName: resolved.providerName,
          inputCost: resolved.inputCost,
          outputCost: resolved.outputCost,
        });
      } else {
        // Record an error for unknown model
        for (const p of prompts) {
          results.push({
            model: q,
            modelId: "unknown",
            provider: "unknown",
            prompt: p.prompt,
            promptName: p.name,
            response: "",
            latencyMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            error: `Unknown model: ${q}`,
          });
        }
      }
    }
  } else {
    // Auto-discover available providers
    const availableProviders = options.providers || getAvailableProviders(options.apiKeys);
    if (availableProviders.length === 0) {
      throw new Error(
        "No API keys found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY, or pass --providers."
      );
    }
    const allModels = getAllModels(availableProviders);
    modelsToRun = allModels.map((m) => ({
      label: m.label,
      id: m.id,
      provider: m.provider,
      providerName: m.providerName,
      inputCost: m.inputCost,
      outputCost: m.outputCost,
    }));
  }

  // Run benchmarks
  for (const promptCase of prompts) {
    for (const model of modelsToRun) {
      const apiKey = getApiKey(model.provider, options.apiKeys);
      if (!apiKey) {
        results.push({
          model: model.label,
          modelId: model.id,
          provider: model.providerName,
          prompt: promptCase.prompt,
          promptName: promptCase.name,
          response: "",
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          error: `Missing API key for ${model.providerName} (${PROVIDERS[model.provider]?.envKey})`,
        });
        continue;
      }

      try {
        const res = await callProvider(
          model.provider,
          model.id,
          promptCase.prompt,
          apiKey,
          promptCase.maxTokens || maxTokens
        );
        const cost =
          (res.inputTokens / 1000) * model.inputCost +
          (res.outputTokens / 1000) * model.outputCost;

        results.push({
          model: model.label,
          modelId: model.id,
          provider: model.providerName,
          prompt: promptCase.prompt,
          promptName: promptCase.name,
          response: res.text,
          latencyMs: res.latencyMs,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          costUsd: Math.round(cost * 1000000) / 1000000,
        });

        console.log(
          `  [${model.providerName}/${model.label}] ${promptCase.name}: ${res.latencyMs}ms, ${res.outputTokens} tokens`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          model: model.label,
          modelId: model.id,
          provider: model.providerName,
          prompt: promptCase.prompt,
          promptName: promptCase.name,
          response: "",
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          error: message,
        });
        console.log(
          `  [${model.providerName}/${model.label}] ${promptCase.name}: ERROR - ${message}`
        );
      }
    }
  }

  const allModelLabels = [
    ...new Set(results.map((r) => r.model)),
  ];
  const allProviders = [
    ...new Set(results.map((r) => r.provider)),
  ];
  const stats = computeStats(results);

  return {
    timestamp: new Date().toISOString(),
    results,
    stats,
    models: allModelLabels,
    providers: allProviders,
    promptCount: prompts.length,
    winner: pickWinner(stats),
  };
}

// ─── Report Generation ──────────────────────────────────────────────────────

export function generateReport(benchmark: BenchmarkResult): ReportOutput {
  const lines: string[] = [];
  lines.push("# AI Model Benchmark Report");
  lines.push(`\nDate: ${benchmark.timestamp}`);
  lines.push(`Providers: ${benchmark.providers.join(", ")}`);
  lines.push(`Models: ${benchmark.models.join(", ")}`);
  lines.push(`Prompts: ${benchmark.promptCount}`);

  // Cross-provider comparison table
  lines.push("\n## Cross-Provider Comparison\n");
  lines.push(
    "| Model | Provider | P50 (ms) | P95 (ms) | Avg Tokens | Cost/1K | Errors |"
  );
  lines.push(
    "|-------|----------|----------|----------|------------|---------|--------|"
  );
  for (const s of benchmark.stats) {
    lines.push(
      `| ${s.model} | ${s.provider} | ${s.p50LatencyMs} | ${s.p95LatencyMs} | ${s.avgOutputTokens} | $${s.costPer1kTokens.toFixed(3)} | ${(s.errorRate * 100).toFixed(0)}% |`
    );
  }

  // Performance summary
  lines.push("\n## Performance Summary\n");
  lines.push(
    "| Model | Provider | Avg Latency | P99 | Avg Input | Avg Output | Total Cost | Error Rate |"
  );
  lines.push(
    "|-------|----------|------------|-----|-----------|------------|------------|------------|"
  );
  for (const s of benchmark.stats) {
    lines.push(
      `| ${s.model} | ${s.provider} | ${s.avgLatencyMs}ms | ${s.p99LatencyMs}ms | ${s.avgInputTokens} | ${s.avgOutputTokens} | $${s.totalCostUsd.toFixed(4)} | ${(s.errorRate * 100).toFixed(0)}% |`
    );
  }

  // Per-prompt breakdown
  lines.push("\n## Per-Prompt Results\n");
  const promptNames = [...new Set(benchmark.results.map((r) => r.promptName))];
  for (const pName of promptNames) {
    lines.push(`### ${pName}\n`);
    const promptResults = benchmark.results.filter(
      (r) => r.promptName === pName
    );
    lines.push("| Model | Provider | Latency | Tokens | Cost | Status |");
    lines.push("|-------|----------|---------|--------|------|--------|");
    for (const r of promptResults) {
      const status = r.error ? `Error: ${r.error.slice(0, 40)}` : "OK";
      lines.push(
        `| ${r.model} | ${r.provider} | ${r.latencyMs}ms | ${r.outputTokens} | $${r.costUsd.toFixed(6)} | ${status} |`
      );
    }
    lines.push("");
  }

  // Winner recommendation
  if (benchmark.winner) {
    lines.push("## Recommendation\n");
    lines.push(`- **Fastest**: ${benchmark.winner.fastest}`);
    lines.push(`- **Cheapest**: ${benchmark.winner.cheapest}`);
    lines.push(`- **Best Value**: ${benchmark.winner.bestValue}`);
    lines.push("");
  }

  const markdown = lines.join("\n");
  const summary = benchmark.winner
    ? benchmark.winner.summary
    : benchmark.stats.length > 0
      ? `${benchmark.results.length} runs across ${benchmark.models.length} models from ${benchmark.providers.length} providers.`
      : "No results.";

  return { markdown, summary };
}

// ─── Dry Run (mock data for all providers) ───────────────────────────────────

// Seeded pseudo-random for deterministic dry-run data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateDryRunReport(): ReportOutput {
  const rand = seededRandom(42);
  const mockResults: ModelResult[] = [];
  const prompts = DEFAULT_PROMPTS;

  // Mock latency profiles per provider (realistic ranges)
  const latencyProfile: Record<
    string,
    Record<string, { base: number; variance: number }>
  > = {
    anthropic: {
      "Haiku 4.5": { base: 220, variance: 80 },
      "Sonnet 4.5": { base: 520, variance: 180 },
      "Opus 4.6": { base: 1500, variance: 1500 },
    },
    openai: {
      "GPT-5 Mini": { base: 150, variance: 60 },
      "GPT-5": { base: 400, variance: 150 },
      "GPT-5.2": { base: 600, variance: 300 },
    },
    gemini: {
      "Gemini 3 Flash": { base: 130, variance: 50 },
      "Gemini 3 Pro": { base: 350, variance: 350 },
    },
  };

  for (const p of prompts) {
    for (const [provKey, cfg] of Object.entries(PROVIDERS)) {
      for (const model of cfg.models) {
        const profile = latencyProfile[provKey]?.[model.label] || {
          base: 300,
          variance: 100,
        };
        const mockLatency = profile.base + rand() * profile.variance;
        const mockOutputTokens = 80 + Math.floor(rand() * 250);
        const mockInputTokens = Math.floor(p.prompt.length / 4);
        const cost =
          (mockInputTokens / 1000) * model.inputCost +
          (mockOutputTokens / 1000) * model.outputCost;

        mockResults.push({
          model: model.label,
          modelId: model.id,
          provider: cfg.name,
          prompt: p.prompt,
          promptName: p.name,
          response: `[Mock ${cfg.name}/${model.label} response for ${p.name}]`,
          latencyMs: Math.round(mockLatency),
          inputTokens: mockInputTokens,
          outputTokens: mockOutputTokens,
          costUsd: Math.round(cost * 1000000) / 1000000,
        });
      }
    }
  }

  const allModelLabels = [...new Set(mockResults.map((r) => r.model))];
  const allProviders = [...new Set(mockResults.map((r) => r.provider))];
  const stats = computeStats(mockResults);

  const benchmark: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    results: mockResults,
    stats,
    models: allModelLabels,
    providers: allProviders,
    promptCount: prompts.length,
    winner: pickWinner(stats),
  };

  return generateReport(benchmark);
}
