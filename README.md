# claude-model-benchmark

Benchmark Claude models side-by-side. Measures latency, token usage, and output quality across configurable prompt suites.

Inspired by [Claude Opus 4.6](https://www.anthropic.com) — Anthropic's latest model release.

## Features

- **Multi-model comparison**: Run the same prompts against Haiku, Sonnet, and Opus
- **Latency tracking**: P50/P95/P99 response times per model
- **Token analysis**: Input/output token counts and cost estimates
- **Quality scoring**: Configurable rubrics for output evaluation
- **Report generation**: Markdown tables and JSON output

## Install

```bash
npm install -g claude-model-benchmark
```

## Usage

```bash
# Run benchmark with default prompts
export ANTHROPIC_API_KEY="your-key"
claude-model-benchmark run

# Custom prompt suite
claude-model-benchmark run --prompts prompts.json

# Specific models only
claude-model-benchmark run --models haiku,sonnet

# Generate comparison report
claude-model-benchmark report results.json
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
import { runBenchmark, generateReport } from "claude-model-benchmark";

const results = await runBenchmark({
  models: ["haiku", "sonnet", "opus"],
  prompts: [{ name: "test", prompt: "Hello", rubric: ["quality"] }],
});

const report = generateReport(results);
console.log(report.markdown);
```

## License

MIT
