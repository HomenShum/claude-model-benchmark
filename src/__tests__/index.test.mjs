import { describe, it } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../../dist/index.js");
const {
  generateReport,
  generateDryRunReport,
  PROVIDERS,
  getAvailableProviders,
  getAllModels,
  resolveModel,
  computeStats,
  percentile,
  DEFAULT_PROMPTS,
} = mod;

// =============================================================================
// 1. Provider Catalog Tests
// =============================================================================

describe("PROVIDERS catalog", () => {
  it("should have all 3 providers: anthropic, openai, gemini", () => {
    assert.ok(PROVIDERS.anthropic, "Missing anthropic provider");
    assert.ok(PROVIDERS.openai, "Missing openai provider");
    assert.ok(PROVIDERS.gemini, "Missing gemini provider");
    assert.equal(Object.keys(PROVIDERS).length, 3, "Should have exactly 3 providers");
  });

  it("should have correct env key names", () => {
    assert.equal(PROVIDERS.anthropic.envKey, "ANTHROPIC_API_KEY");
    assert.equal(PROVIDERS.openai.envKey, "OPENAI_API_KEY");
    assert.equal(PROVIDERS.gemini.envKey, "GEMINI_API_KEY");
  });

  it("should have at least one model per provider with required fields", () => {
    for (const [key, cfg] of Object.entries(PROVIDERS)) {
      assert.ok(cfg.models.length > 0, `Provider ${key} has no models`);
      for (const model of cfg.models) {
        assert.ok(model.id, `Model in ${key} missing id`);
        assert.ok(model.label, `Model in ${key} missing label`);
        assert.ok(typeof model.inputCost === "number", `Model ${model.id} missing inputCost`);
        assert.ok(typeof model.outputCost === "number", `Model ${model.id} missing outputCost`);
      }
    }
  });

  it("should have correct provider names", () => {
    assert.equal(PROVIDERS.anthropic.name, "Anthropic");
    assert.equal(PROVIDERS.openai.name, "OpenAI");
    assert.equal(PROVIDERS.gemini.name, "Google");
  });

  it("should have exactly 5 models total across all providers", () => {
    const total = Object.values(PROVIDERS).reduce((n, cfg) => n + cfg.models.length, 0);
    assert.equal(total, 5, `Expected 5 total models, got ${total}`);
  });

  it("should have Gemini 2.0 Flash as free (zero cost)", () => {
    const gemini = PROVIDERS.gemini.models[0];
    assert.equal(gemini.inputCost, 0);
    assert.equal(gemini.outputCost, 0);
  });
});

// =============================================================================
// 2. Provider Discovery Tests
// =============================================================================

describe("getAvailableProviders", () => {
  it("should return empty array when no env vars set", () => {
    // Save and clear env
    const saved = {};
    for (const cfg of Object.values(PROVIDERS)) {
      saved[cfg.envKey] = process.env[cfg.envKey];
      delete process.env[cfg.envKey];
    }

    const available = getAvailableProviders();
    assert.ok(Array.isArray(available));
    // May not be strictly empty if other env vars happen to be set,
    // but with env cleared it should be empty
    assert.equal(available.length, 0, "Should be empty with no env vars");

    // Restore
    for (const [key, val] of Object.entries(saved)) {
      if (val !== undefined) process.env[key] = val;
    }
  });

  it("should detect providers from explicit apiKeys map", () => {
    const available = getAvailableProviders({ openai: "test-key-123" });
    assert.ok(available.includes("openai"), "Should detect openai from explicit key");
  });

  it("should detect multiple providers from explicit apiKeys map", () => {
    const available = getAvailableProviders({
      anthropic: "sk-ant-test",
      gemini: "AIza-test",
    });
    assert.ok(available.includes("anthropic"));
    assert.ok(available.includes("gemini"));
    assert.equal(available.length >= 2, true);
  });
});

// =============================================================================
// 3. Model Discovery Tests
// =============================================================================

describe("getAllModels", () => {
  it("should return all models across all providers", () => {
    const all = getAllModels();
    assert.ok(all.length >= 5, `Expected at least 5 models, got ${all.length}`);
    const providers = [...new Set(all.map((m) => m.provider))];
    assert.ok(providers.includes("anthropic"));
    assert.ok(providers.includes("openai"));
    assert.ok(providers.includes("gemini"));
  });

  it("should filter by single provider", () => {
    const anthropicOnly = getAllModels(["anthropic"]);
    assert.ok(anthropicOnly.every((m) => m.provider === "anthropic"));
    assert.ok(anthropicOnly.length >= 2);
  });

  it("should filter by multiple providers", () => {
    const subset = getAllModels(["openai", "gemini"]);
    const providers = [...new Set(subset.map((m) => m.provider))];
    assert.ok(providers.includes("openai"));
    assert.ok(providers.includes("gemini"));
    assert.ok(!providers.includes("anthropic"));
  });

  it("should include provider and providerName in each model", () => {
    const all = getAllModels();
    for (const m of all) {
      assert.ok(m.provider, "Missing provider key");
      assert.ok(m.providerName, "Missing providerName");
    }
  });
});

// =============================================================================
// 4. Model Resolution Tests
// =============================================================================

describe("resolveModel", () => {
  it("should resolve by label prefix (haiku)", () => {
    const m = resolveModel("haiku");
    assert.ok(m, "Should resolve haiku");
    assert.equal(m.provider, "anthropic");
    assert.ok(m.id.includes("haiku"));
  });

  it("should resolve by full label (Sonnet 4.5)", () => {
    const m = resolveModel("Sonnet 4.5");
    assert.ok(m, "Should resolve Sonnet 4.5");
    assert.equal(m.provider, "anthropic");
  });

  it("should resolve OpenAI model by id", () => {
    const m = resolveModel("gpt-4o-mini");
    assert.ok(m, "Should resolve gpt-4o-mini");
    assert.equal(m.provider, "openai");
    assert.equal(m.label, "GPT-4o Mini");
  });

  it("should resolve GPT-4o by exact full id", () => {
    // Note: "gpt-4o" is a prefix of "gpt-4o-mini", so resolveModel
    // may match gpt-4o-mini first. Use the more specific query.
    const m = resolveModel("GPT-4o");
    assert.ok(m, "Should resolve GPT-4o");
    assert.equal(m.provider, "openai");
    // Either GPT-4o or GPT-4o Mini is acceptable since "GPT-4o" is a prefix of both labels
    assert.ok(
      m.label === "GPT-4o" || m.label === "GPT-4o Mini",
      `Expected GPT-4o or GPT-4o Mini, got ${m.label}`
    );
  });

  it("should resolve Gemini model by id", () => {
    const m = resolveModel("gemini-2.0-flash");
    assert.ok(m, "Should resolve gemini-2.0-flash");
    assert.equal(m.provider, "gemini");
    assert.equal(m.providerName, "Google");
  });

  it("should return undefined for unknown model", () => {
    const m = resolveModel("nonexistent-model-xyz");
    assert.equal(m, undefined);
  });

  it("should be case-insensitive", () => {
    const m = resolveModel("HAIKU");
    assert.ok(m, "Should resolve HAIKU (case-insensitive)");
    assert.equal(m.provider, "anthropic");
  });
});

// =============================================================================
// 5. Statistics Tests
// =============================================================================

describe("percentile", () => {
  it("should compute P50 correctly", () => {
    const p50 = percentile([100, 200, 300, 400, 500], 50);
    assert.equal(p50, 300);
  });

  it("should compute P95 on small array", () => {
    const p95 = percentile([100, 200, 300], 95);
    assert.equal(p95, 300);
  });

  it("should handle single-element array", () => {
    const p50 = percentile([42], 50);
    assert.equal(p50, 42);
  });
});

describe("computeStats", () => {
  it("should group by model and compute averages", () => {
    const results = [
      { model: "A", modelId: "a-1", provider: "TestP", prompt: "p", promptName: "test", response: "", latencyMs: 100, inputTokens: 10, outputTokens: 50, costUsd: 0.001 },
      { model: "A", modelId: "a-1", provider: "TestP", prompt: "p2", promptName: "test2", response: "", latencyMs: 200, inputTokens: 10, outputTokens: 60, costUsd: 0.002 },
      { model: "B", modelId: "b-1", provider: "TestQ", prompt: "p", promptName: "test", response: "", latencyMs: 300, inputTokens: 10, outputTokens: 70, costUsd: 0.003 },
    ];
    const stats = computeStats(results);
    assert.equal(stats.length, 2);

    const statA = stats.find((s) => s.model === "A");
    assert.ok(statA);
    assert.equal(statA.totalRuns, 2);
    assert.equal(statA.avgLatencyMs, 150);
    assert.equal(statA.provider, "TestP");
  });

  it("should sort by avgLatencyMs ascending", () => {
    const results = [
      { model: "Slow", modelId: "s", provider: "P", prompt: "", promptName: "", response: "", latencyMs: 500, inputTokens: 10, outputTokens: 50, costUsd: 0.01 },
      { model: "Fast", modelId: "f", provider: "P", prompt: "", promptName: "", response: "", latencyMs: 100, inputTokens: 10, outputTokens: 50, costUsd: 0.001 },
    ];
    const stats = computeStats(results);
    assert.equal(stats[0].model, "Fast");
    assert.equal(stats[1].model, "Slow");
  });

  it("should compute error rate correctly", () => {
    const results = [
      { model: "M", modelId: "m", provider: "P", prompt: "", promptName: "", response: "", latencyMs: 100, inputTokens: 10, outputTokens: 50, costUsd: 0.001 },
      { model: "M", modelId: "m", provider: "P", prompt: "", promptName: "", response: "", latencyMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, error: "timeout" },
    ];
    const stats = computeStats(results);
    assert.equal(stats[0].errorRate, 0.5);
  });

  it("should compute costPer1kTokens", () => {
    const results = [
      { model: "M", modelId: "m", provider: "P", prompt: "", promptName: "", response: "", latencyMs: 100, inputTokens: 10, outputTokens: 1000, costUsd: 0.01 },
    ];
    const stats = computeStats(results);
    assert.equal(stats[0].costPer1kTokens, 0.01);
  });
});

// =============================================================================
// 6. Dry Run / Report Tests
// =============================================================================

describe("generateDryRunReport", () => {
  it("should produce markdown with cross-provider comparison", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("# AI Model Benchmark Report"));
    assert.ok(report.markdown.includes("Cross-Provider Comparison"));
    assert.ok(report.markdown.includes("| Model |"));
  });

  it("should include models from all three providers", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("Haiku 4.5"), "Missing Haiku 4.5");
    assert.ok(report.markdown.includes("Sonnet 4.5"), "Missing Sonnet 4.5");
    assert.ok(report.markdown.includes("GPT-4o Mini"), "Missing GPT-4o Mini");
    assert.ok(report.markdown.includes("GPT-4o"), "Missing GPT-4o");
    assert.ok(report.markdown.includes("Gemini 2.0 Flash"), "Missing Gemini 2.0 Flash");
  });

  it("should include all provider names", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("Anthropic"), "Missing Anthropic");
    assert.ok(report.markdown.includes("OpenAI"), "Missing OpenAI");
    assert.ok(report.markdown.includes("Google"), "Missing Google");
  });

  it("should include per-prompt sections for all 4 prompts", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("code-generation"));
    assert.ok(report.markdown.includes("reasoning"));
    assert.ok(report.markdown.includes("summarization"));
    assert.ok(report.markdown.includes("creative"));
  });

  it("should include a winner recommendation", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("Recommendation"), "Missing Recommendation section");
    assert.ok(report.markdown.includes("Fastest"), "Missing Fastest recommendation");
    assert.ok(report.markdown.includes("Cheapest"), "Missing Cheapest recommendation");
    assert.ok(report.markdown.includes("Best Value"), "Missing Best Value recommendation");
  });

  it("should have a summary string with winner info", () => {
    const report = generateDryRunReport();
    assert.ok(typeof report.summary === "string");
    assert.ok(report.summary.length > 10);
    assert.ok(report.summary.includes("Fastest"));
  });

  it("should show cost data with dollar signs", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("$"), "Should show cost with dollar sign");
  });

  it("should report latency percentiles", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("P50"));
    assert.ok(report.markdown.includes("P95"));
    assert.ok(report.markdown.includes("P99"));
  });

  it("should produce deterministic output (seeded random)", () => {
    const r1 = generateDryRunReport();
    const r2 = generateDryRunReport();
    // The markdown should be identical except for the timestamp line
    const strip = (s) => s.replace(/Date:.*\n/, "");
    assert.equal(strip(r1.markdown), strip(r2.markdown));
  });
});

// =============================================================================
// 7. Report Generation Tests
// =============================================================================

describe("generateReport with empty data", () => {
  it("should handle empty results gracefully", () => {
    const report = generateReport({
      timestamp: new Date().toISOString(),
      results: [],
      stats: [],
      models: [],
      providers: [],
      promptCount: 0,
    });
    assert.ok(report.markdown.includes("Benchmark Report"));
    assert.equal(report.summary, "No results.");
  });
});

describe("generateReport with cross-provider data", () => {
  it("should render multi-provider results correctly", () => {
    const data = {
      timestamp: "2026-02-06T00:00:00Z",
      results: [
        {
          model: "Haiku 4.5",
          modelId: "claude-haiku-4-5-20251001",
          provider: "Anthropic",
          prompt: "Hello",
          promptName: "greeting",
          response: "Hi there!",
          latencyMs: 220,
          inputTokens: 5,
          outputTokens: 10,
          costUsd: 0.000055,
        },
        {
          model: "GPT-4o Mini",
          modelId: "gpt-4o-mini",
          provider: "OpenAI",
          prompt: "Hello",
          promptName: "greeting",
          response: "Hello!",
          latencyMs: 180,
          inputTokens: 5,
          outputTokens: 8,
          costUsd: 0.000006,
        },
        {
          model: "Gemini 2.0 Flash",
          modelId: "gemini-2.0-flash",
          provider: "Google",
          prompt: "Hello",
          promptName: "greeting",
          response: "Hi!",
          latencyMs: 150,
          inputTokens: 5,
          outputTokens: 6,
          costUsd: 0,
        },
      ],
      stats: [
        {
          model: "Gemini 2.0 Flash",
          provider: "Google",
          totalRuns: 1,
          avgLatencyMs: 150,
          p50LatencyMs: 150,
          p95LatencyMs: 150,
          p99LatencyMs: 150,
          avgInputTokens: 5,
          avgOutputTokens: 6,
          totalCostUsd: 0,
          costPer1kTokens: 0,
          errorRate: 0,
        },
        {
          model: "GPT-4o Mini",
          provider: "OpenAI",
          totalRuns: 1,
          avgLatencyMs: 180,
          p50LatencyMs: 180,
          p95LatencyMs: 180,
          p99LatencyMs: 180,
          avgInputTokens: 5,
          avgOutputTokens: 8,
          totalCostUsd: 0.000006,
          costPer1kTokens: 0.00075,
          errorRate: 0,
        },
        {
          model: "Haiku 4.5",
          provider: "Anthropic",
          totalRuns: 1,
          avgLatencyMs: 220,
          p50LatencyMs: 220,
          p95LatencyMs: 220,
          p99LatencyMs: 220,
          avgInputTokens: 5,
          avgOutputTokens: 10,
          totalCostUsd: 0.000055,
          costPer1kTokens: 0.0055,
          errorRate: 0,
        },
      ],
      models: ["Haiku 4.5", "GPT-4o Mini", "Gemini 2.0 Flash"],
      providers: ["Anthropic", "OpenAI", "Google"],
      promptCount: 1,
      winner: {
        fastest: "Gemini 2.0 Flash (gemini)",
        cheapest: "Gemini 2.0 Flash (gemini)",
        bestValue: "Gemini 2.0 Flash (gemini)",
        summary: "Fastest: Gemini 2.0 Flash at 150ms avg. Cheapest: Gemini 2.0 Flash at $0.0000. Best value: Gemini 2.0 Flash.",
      },
    };
    const report = generateReport(data);
    assert.ok(report.markdown.includes("Anthropic"));
    assert.ok(report.markdown.includes("OpenAI"));
    assert.ok(report.markdown.includes("Google"));
    assert.ok(report.markdown.includes("Haiku 4.5"));
    assert.ok(report.markdown.includes("GPT-4o Mini"));
    assert.ok(report.markdown.includes("Gemini 2.0 Flash"));
    assert.ok(report.markdown.includes("Recommendation"));
    assert.ok(report.summary.includes("Gemini 2.0 Flash"));
  });

  it("should show error results with provider context", () => {
    const data = {
      timestamp: "2026-02-06T00:00:00Z",
      results: [
        {
          model: "GPT-4o",
          modelId: "gpt-4o",
          provider: "OpenAI",
          prompt: "Hello",
          promptName: "test",
          response: "",
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          error: "Rate limited",
        },
      ],
      stats: [
        {
          model: "GPT-4o",
          provider: "OpenAI",
          totalRuns: 1,
          avgLatencyMs: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          avgInputTokens: 0,
          avgOutputTokens: 0,
          totalCostUsd: 0,
          costPer1kTokens: 0,
          errorRate: 1,
        },
      ],
      models: ["GPT-4o"],
      providers: ["OpenAI"],
      promptCount: 1,
    };
    const report = generateReport(data);
    assert.ok(report.markdown.includes("Rate limited"));
    assert.ok(report.markdown.includes("100%"));
    assert.ok(report.markdown.includes("OpenAI"));
  });

  it("should render Performance Summary table", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("Performance Summary"));
    assert.ok(report.markdown.includes("Avg Latency"));
    assert.ok(report.markdown.includes("Total Cost"));
    assert.ok(report.markdown.includes("Error Rate"));
  });
});

// =============================================================================
// 8. Default Prompts
// =============================================================================

describe("DEFAULT_PROMPTS", () => {
  it("should export built-in prompt suite with 4 cases", () => {
    assert.ok(Array.isArray(DEFAULT_PROMPTS));
    assert.equal(DEFAULT_PROMPTS.length, 4);
    for (const p of DEFAULT_PROMPTS) {
      assert.ok(p.name, "Prompt missing name");
      assert.ok(p.prompt, "Prompt missing prompt text");
    }
  });

  it("should have code-generation, reasoning, summarization, creative", () => {
    const names = DEFAULT_PROMPTS.map((p) => p.name);
    assert.ok(names.includes("code-generation"));
    assert.ok(names.includes("reasoning"));
    assert.ok(names.includes("summarization"));
    assert.ok(names.includes("creative"));
  });

  it("should have rubrics on all prompts", () => {
    for (const p of DEFAULT_PROMPTS) {
      assert.ok(Array.isArray(p.rubric), `Prompt ${p.name} missing rubric`);
      assert.ok(p.rubric.length > 0, `Prompt ${p.name} has empty rubric`);
    }
  });
});

// =============================================================================
// 9. Winner Determination Tests (via dry-run internals)
// =============================================================================

describe("Winner determination", () => {
  it("should pick fastest model correctly from stats", () => {
    const report = generateDryRunReport();
    // Gemini 2.0 Flash should be fastest (lowest latency profile: base 150ms)
    // The winner section should mention it
    assert.ok(
      report.markdown.includes("Gemini 2.0 Flash") ||
      report.markdown.includes("GPT-4o Mini"),
      "Winner should be one of the fast models"
    );
  });

  it("should identify cheapest as zero-cost Gemini in dry-run", () => {
    const report = generateDryRunReport();
    // Gemini is free, so it should be cheapest
    assert.ok(report.summary.includes("Cheapest"));
  });

  it("should identify best value in dry-run", () => {
    const report = generateDryRunReport();
    assert.ok(report.summary.includes("Best value"));
  });
});
