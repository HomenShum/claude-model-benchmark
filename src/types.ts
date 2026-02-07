/**
 * claude-model-benchmark — Type definitions for multi-provider benchmarking.
 */

// ─── Provider Types ──────────────────────────────────────────────────────────

export interface ModelDef {
  id: string;
  label: string;
  inputCost: number;   // $/1K input tokens
  outputCost: number;  // $/1K output tokens
}

export interface ProviderConfig {
  name: string;
  models: ModelDef[];
  envKey: string;
}

// ─── Prompt Types ────────────────────────────────────────────────────────────

export interface PromptCase {
  name: string;
  prompt: string;
  rubric?: string[];
  maxTokens?: number;
}

// ─── Result Types ────────────────────────────────────────────────────────────

export interface ModelResult {
  model: string;
  modelId: string;
  provider: string;
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
  provider: string;
  totalRuns: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  totalCostUsd: number;
  costPer1kTokens: number;
  errorRate: number;
}

export interface BenchmarkResult {
  timestamp: string;
  results: ModelResult[];
  stats: ModelStats[];
  models: string[];
  providers: string[];
  promptCount: number;
  winner?: WinnerRecommendation;
}

export interface WinnerRecommendation {
  fastest: string;
  cheapest: string;
  bestValue: string;
  summary: string;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface BenchmarkOptions {
  providers?: string[];
  models?: string[];
  prompts?: PromptCase[];
  maxTokens?: number;
  apiKeys?: Record<string, string>;
}

export interface ReportOutput {
  markdown: string;
  summary: string;
}

// ─── API Response (internal) ─────────────────────────────────────────────────

export interface ApiCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}
