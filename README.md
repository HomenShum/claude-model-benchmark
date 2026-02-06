# claude-model-benchmark

Benchmark Claude models side-by-side. Measures latency, token usage, and output quality across configurable prompt suites.

Inspired by [Claude Opus 4.6](https://www.anthropic.com) — Anthropic's latest model release.

## Features

- **Multi-model comparison**: Run the same prompts against Haiku 4.5, Sonnet 4.5, and Opus 4.6
- **Latency tracking**: P50/P95/P99 response times per model
- **Token analysis**: Input/output token counts and cost estimates
- **Dry-run mode**: Generate mock reports without API calls (no key needed)
- **Report generation**: Markdown tables with per-prompt breakdowns

## Install

```bash
npm install -g claude-model-benchmark
```

## Usage

```bash
# Run benchmark with default prompts (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY="your-key"
claude-model-benchmark run

# Specific models only
claude-model-benchmark run --models haiku,sonnet

# Custom prompt suite
claude-model-benchmark run --prompts prompts.json

# Save results for later analysis
claude-model-benchmark run --output results.json

# Generate report from saved results
claude-model-benchmark report results.json

# Dry run — no API key needed, mock data
claude-model-benchmark dry-run
```

## Prompt Suite Format

```json
[
  {
    "name": "code-generation",
    "prompt": "Write a Python function to find prime numbers up to N",
    "rubric": ["correctness", "efficiency", "readability"]
  }
]
```

## API

```typescript
import { runBenchmark, generateReport, generateDryRunReport } from "claude-model-benchmark";

// Live benchmark
const results = await runBenchmark({
  models: ["haiku", "sonnet", "opus"],
  prompts: [{ name: "test", prompt: "Hello", rubric: ["quality"] }],
});
const report = generateReport(results);
console.log(report.markdown);

// Dry run (no API key needed)
const mockReport = generateDryRunReport();
console.log(mockReport.summary);
```

## Using with AI Agents

### Claude Code / Cursor / Windsurf

Add this to your agent instructions or AGENTS.md:

```markdown
When selecting or evaluating Claude models for a task, use `claude-model-benchmark`:

1. Define prompts representative of your workload in a JSON file
2. Run `npx claude-model-benchmark run --models haiku,sonnet,opus --prompts suite.json --output results.json`
3. Analyze the report: check P95 latency, cost per call, and error rates
4. For cost-sensitive tasks, prefer the cheapest model that meets quality thresholds
5. Use `dry-run` mode to preview report format without API costs
```

### NodeBench MCP Integration

If you're using [nodebench-mcp](https://www.npmjs.com/package/nodebench-mcp), benchmark results integrate with the eval methodology:

1. **Eval phase**: Use `benchmark_models` (built-in MCP tool) for quick single-prompt comparisons, or `claude-model-benchmark` CLI for full suites
2. **Verification**: `start_verification_cycle` to track model selection decisions, `log_test_result` for each model's quality scores
3. **Quality gate**: `run_quality_gate` to enforce latency < 2000ms and error rate < 5% for production model selection
4. **Knowledge**: `record_learning` to bank model performance data — agents learn which models work best for which task types over time

```bash
# Example: agent benchmarks models before choosing one for a pipeline
npx claude-model-benchmark run --models haiku,sonnet --output /tmp/bench.json
# Agent reads results, picks optimal model, records decision as a learning
```

### MCP Server Setup (for tool-calling agents)

```json
{
  "mcpServers": {
    "nodebench": {
      "command": "npx",
      "args": ["-y", "nodebench-mcp"]
    }
  }
}
```

The MCP toolset includes `benchmark_models` for quick in-context comparisons. Use this CLI tool for comprehensive suites with saved results.

## Model Catalog

| Model | ID | Input $/1K | Output $/1K |
|-------|----|-----------|-------------|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | $0.001 | $0.005 |
| Sonnet 4.5 | `claude-sonnet-4-5-20250929` | $0.003 | $0.015 |
| Opus 4.6 | `claude-opus-4-6` | $0.015 | $0.075 |

## Tests

```bash
npm test
```

9 tests covering report generation, mock data, stats computation, error handling, and empty results.

## License

MIT
