# Claude Model Benchmark

Benchmark LLM models across Anthropic, OpenAI, and Google -- side by side.

Multi-provider BYOK (Bring Your Own Key) benchmarking with cross-provider comparison reports, winner recommendations, and latency percentiles.

Supports: **Claude Haiku/Sonnet**, **GPT-4o/4o-mini**, **Gemini 2.0 Flash**

## Quick Start

```bash
# No API keys needed -- see what a full benchmark looks like
npx claude-model-benchmark dry-run

# With API keys -- run against live APIs
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="AIza..."
npx claude-model-benchmark run
```

## BYOK (Bring Your Own Key)

Set the environment variables for the providers you want to benchmark:

| Variable | Provider | Models |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | Anthropic | Haiku 4.5, Sonnet 4.5 |
| `OPENAI_API_KEY` | OpenAI | GPT-4o Mini, GPT-4o |
| `GEMINI_API_KEY` | Google | Gemini 2.0 Flash (free tier) |

Only the providers with configured keys will be included in a live benchmark run. Use `dry-run` to preview all providers without any keys.

## Commands

| Command | Description |
|---------|-------------|
| `run [options]` | Run benchmark against live APIs (auto-detects configured providers) |
| `dry-run` | Generate mock cross-provider report -- no API keys needed |
| `compare <m1> <m2> [options]` | Side-by-side comparison of specific models |
| `providers` | Show which providers are configured and available models |
| `report <file>` | Generate report from previously saved results JSON |
| `--help` | Show usage information |

### Run Options

```bash
# Benchmark all configured providers
claude-model-benchmark run

# Filter to specific providers
claude-model-benchmark run --providers anthropic,openai

# Filter to specific models
claude-model-benchmark run --models haiku,gpt-4o-mini,gemini-2.0-flash

# Use custom prompts
claude-model-benchmark run --prompts my-suite.json

# Save results for later analysis
claude-model-benchmark run --output results.json
```

### Compare Models

```bash
# Side-by-side with default prompt suite
claude-model-benchmark compare haiku gpt-4o-mini

# Side-by-side with a custom prompt
claude-model-benchmark compare haiku gemini-2.0-flash --prompt "Write a haiku about code"
```

### Check Provider Status

```bash
claude-model-benchmark providers
```

Output:
```
[+] Anthropic (anthropic): READY
    Haiku 4.5 (claude-haiku-4-5-20251001) -- $0.001/1K in, $0.005/1K out
    Sonnet 4.5 (claude-sonnet-4-5-20250929) -- $0.003/1K in, $0.015/1K out

[-] OpenAI (openai): NOT CONFIGURED (set OPENAI_API_KEY)
    GPT-4o Mini (gpt-4o-mini) -- $0.00015/1K in, $0.0006/1K out
    GPT-4o (gpt-4o) -- $0.0025/1K in, $0.01/1K out

[-] Google (gemini): NOT CONFIGURED (set GEMINI_API_KEY)
    Gemini 2.0 Flash (gemini-2.0-flash) -- FREE

1/3 providers configured, 5 models available.
```

## Example Output (dry-run)

```
# AI Model Benchmark Report

Date: 2026-02-06T00:00:00.000Z
Providers: Anthropic, OpenAI, Google
Models: Haiku 4.5, Sonnet 4.5, GPT-4o Mini, GPT-4o, Gemini 2.0 Flash
Prompts: 4

## Cross-Provider Comparison

| Model             | Provider  | P50 (ms) | P95 (ms) | Avg Tokens | Cost/1K | Errors |
|-------------------|-----------|----------|----------|------------|---------|--------|
| Gemini 2.0 Flash  | Google    | 165      | 192      | 180        | $0.000  | 0%     |
| GPT-4o Mini       | OpenAI    | 199      | 230      | 175        | $0.105  | 0%     |
| Haiku 4.5         | Anthropic | 240      | 278      | 182        | $5.000  | 0%     |
| GPT-4o            | OpenAI    | 492      | 565      | 190        | $10.000 | 0%     |
| Sonnet 4.5        | Anthropic | 568      | 645      | 195        | $15.000 | 0%     |

## Recommendation

- Fastest: Gemini 2.0 Flash (gemini)
- Cheapest: Gemini 2.0 Flash (gemini)
- Best Value: Gemini 2.0 Flash (gemini)
```

## Prompt Suite Format

```json
[
  {
    "name": "code-generation",
    "prompt": "Write a Python function to find prime numbers up to N",
    "rubric": ["correctness", "efficiency", "readability"],
    "maxTokens": 1024
  }
]
```

The built-in suite includes 4 prompts: code-generation, reasoning, summarization, and creative.

## Programmatic API

```typescript
import {
  runBenchmark,
  generateReport,
  generateDryRunReport,
  DEFAULT_PROMPTS,
  PROVIDERS,
  getAvailableProviders,
  resolveModel,
} from "claude-model-benchmark";

// Live benchmark (requires API keys in env)
const results = await runBenchmark({
  models: ["haiku", "gpt-4o-mini", "gemini-2.0-flash"],
  prompts: [{ name: "test", prompt: "Explain TCP vs UDP", rubric: ["accuracy"] }],
});
const report = generateReport(results);
console.log(report.markdown);
console.log(report.summary);

// Dry run (no API keys needed)
const mockReport = generateDryRunReport();
console.log(mockReport.markdown);

// Check available providers
const available = getAvailableProviders();
console.log(available); // ["anthropic", "openai"] etc.

// Resolve a model by shorthand
const model = resolveModel("haiku");
console.log(model); // { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "anthropic", ... }
```

## Model Catalog

| Model | Provider | ID | Input $/1K | Output $/1K |
|-------|----------|----|-----------|-------------|
| Haiku 4.5 | Anthropic | `claude-haiku-4-5-20251001` | $0.001 | $0.005 |
| Sonnet 4.5 | Anthropic | `claude-sonnet-4-5-20250929` | $0.003 | $0.015 |
| GPT-4o Mini | OpenAI | `gpt-4o-mini` | $0.00015 | $0.0006 |
| GPT-4o | OpenAI | `gpt-4o` | $0.0025 | $0.01 |
| Gemini 2.0 Flash | Google | `gemini-2.0-flash` | $0.00 | $0.00 |

## Tests

```bash
npm test
```

## Using with AI Agents

### Claude Code / Cursor / Windsurf

Add this to your agent instructions or AGENTS.md:

```markdown
When selecting or evaluating LLM models for a task, use `claude-model-benchmark`:

1. Run `npx claude-model-benchmark providers` to check which APIs are available
2. Run `npx claude-model-benchmark run --output results.json` to benchmark all configured providers
3. Analyze the report: check P95 latency, cost per 1K tokens, and error rates
4. For cost-sensitive tasks, prefer the model with lowest cost that meets quality thresholds
5. Use `dry-run` mode to preview report format without API costs
6. Use `compare` for quick A/B testing between two specific models
```

### NodeBench MCP Integration

If you're using [nodebench-mcp](https://www.npmjs.com/package/nodebench-mcp), benchmark results integrate with the eval methodology:

1. **Eval phase**: Use `claude-model-benchmark` CLI for full multi-provider suites
2. **Verification**: `start_verification_cycle` to track model selection decisions
3. **Quality gate**: `run_quality_gate` to enforce latency < 2000ms and error rate < 5%
4. **Knowledge**: `record_learning` to bank model performance data across runs

## License

MIT
