import { describe, it } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../../dist/index.js");
const { generateReport, generateDryRunReport } = mod;

describe("generateReport", () => {
  it("should produce markdown with table headers", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("# Claude Model Benchmark Report"));
    assert.ok(report.markdown.includes("| Model |"));
    assert.ok(report.markdown.includes("Performance Summary"));
  });

  it("should include all three models in dry run", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("haiku"));
    assert.ok(report.markdown.includes("sonnet"));
    assert.ok(report.markdown.includes("opus"));
  });

  it("should include per-prompt sections", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("code-generation"));
    assert.ok(report.markdown.includes("reasoning"));
    assert.ok(report.markdown.includes("summarization"));
    assert.ok(report.markdown.includes("creative"));
  });

  it("should have a summary string", () => {
    const report = generateDryRunReport();
    assert.ok(typeof report.summary === "string");
    assert.ok(report.summary.length > 10);
    assert.ok(report.summary.includes("Fastest"));
  });

  it("should handle empty results gracefully", () => {
    const report = generateReport({
      timestamp: new Date().toISOString(),
      results: [],
      stats: [],
      models: [],
      promptCount: 0,
    });
    assert.ok(report.markdown.includes("Benchmark Report"));
    assert.equal(report.summary, "No results.");
  });

  it("should compute cost in stats", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("$"), "Should show cost with dollar sign");
  });

  it("should report latency percentiles", () => {
    const report = generateDryRunReport();
    assert.ok(report.markdown.includes("P50"));
    assert.ok(report.markdown.includes("P95"));
  });
});

describe("generateReport with custom data", () => {
  it("should handle single model results", () => {
    const data = {
      timestamp: "2026-02-06T00:00:00Z",
      results: [
        {
          model: "sonnet",
          modelId: "claude-sonnet-4-5-20250929",
          prompt: "Hello",
          promptName: "greeting",
          response: "Hi there!",
          latencyMs: 350,
          inputTokens: 5,
          outputTokens: 10,
          costUsd: 0.00016,
        },
      ],
      stats: [
        {
          model: "sonnet",
          totalRuns: 1,
          avgLatencyMs: 350,
          p50LatencyMs: 350,
          p95LatencyMs: 350,
          p99LatencyMs: 350,
          avgInputTokens: 5,
          avgOutputTokens: 10,
          totalCostUsd: 0.00016,
          errorRate: 0,
        },
      ],
      models: ["sonnet"],
      promptCount: 1,
    };
    const report = generateReport(data);
    assert.ok(report.markdown.includes("sonnet"));
    assert.ok(report.markdown.includes("350ms"));
    assert.ok(report.summary.includes("sonnet"));
  });

  it("should show error results", () => {
    const data = {
      timestamp: "2026-02-06T00:00:00Z",
      results: [
        {
          model: "opus",
          modelId: "claude-opus-4-6",
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
          model: "opus",
          totalRuns: 1,
          avgLatencyMs: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          avgInputTokens: 0,
          avgOutputTokens: 0,
          totalCostUsd: 0,
          errorRate: 1,
        },
      ],
      models: ["opus"],
      promptCount: 1,
    };
    const report = generateReport(data);
    assert.ok(report.markdown.includes("Rate limited"));
    assert.ok(report.markdown.includes("100%"));
  });
});
