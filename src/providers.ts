/**
 * claude-model-benchmark — Multi-provider configuration and API callers.
 *
 * Supports Anthropic, OpenAI, and Google Gemini with dynamic SDK detection.
 * Each provider uses BYOK (Bring Your Own Key) via environment variables.
 */

import type { ProviderConfig, ModelDef, ApiCallResult } from "./types";

// ─── Provider Catalog ────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    name: "Anthropic",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", inputCost: 0.001, outputCost: 0.005 },
      { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5", inputCost: 0.003, outputCost: 0.015 },
    ],
    envKey: "ANTHROPIC_API_KEY",
  },
  openai: {
    name: "OpenAI",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini", inputCost: 0.00015, outputCost: 0.0006 },
      { id: "gpt-4o", label: "GPT-4o", inputCost: 0.0025, outputCost: 0.01 },
    ],
    envKey: "OPENAI_API_KEY",
  },
  gemini: {
    name: "Google",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", inputCost: 0.0, outputCost: 0.0 },
    ],
    envKey: "GEMINI_API_KEY",
  },
};

// ─── Provider Discovery ──────────────────────────────────────────────────────

/**
 * Returns provider keys for which an API key is available.
 * Checks both explicit apiKeys map and environment variables.
 */
export function getAvailableProviders(apiKeys?: Record<string, string>): string[] {
  return Object.entries(PROVIDERS)
    .filter(([key, cfg]) => {
      const explicit = apiKeys?.[key];
      if (explicit) return true;
      return !!process.env[cfg.envKey];
    })
    .map(([key]) => key);
}

/**
 * Returns all models across all providers (or a filtered set of providers).
 */
export function getAllModels(providerFilter?: string[]): Array<ModelDef & { provider: string; providerName: string }> {
  const result: Array<ModelDef & { provider: string; providerName: string }> = [];
  for (const [key, cfg] of Object.entries(PROVIDERS)) {
    if (providerFilter && !providerFilter.includes(key)) continue;
    for (const model of cfg.models) {
      result.push({ ...model, provider: key, providerName: cfg.name });
    }
  }
  return result;
}

/**
 * Resolve a model label (e.g. "haiku", "gpt-4o-mini", "gemini-2.0-flash")
 * to its full definition including provider.
 */
export function resolveModel(query: string): (ModelDef & { provider: string; providerName: string }) | undefined {
  const q = query.toLowerCase();
  for (const [key, cfg] of Object.entries(PROVIDERS)) {
    for (const model of cfg.models) {
      // Match by id, label (lowercase), or common shorthand
      if (
        model.id.toLowerCase() === q ||
        model.label.toLowerCase() === q ||
        model.label.toLowerCase().replace(/\s+/g, "-") === q ||
        model.id.toLowerCase().startsWith(q) ||
        model.label.toLowerCase().startsWith(q)
      ) {
        return { ...model, provider: key, providerName: cfg.name };
      }
    }
  }
  return undefined;
}

/**
 * Get API key for a provider from explicit map or environment.
 */
export function getApiKey(providerKey: string, apiKeys?: Record<string, string>): string | undefined {
  const explicit = apiKeys?.[providerKey];
  if (explicit) return explicit;
  const cfg = PROVIDERS[providerKey];
  if (!cfg) return undefined;
  return process.env[cfg.envKey];
}

// ─── API Callers ─────────────────────────────────────────────────────────────

/**
 * Call Anthropic Claude API using raw fetch (no SDK dependency).
 */
export async function callAnthropic(
  modelId: string,
  prompt: string,
  apiKey: string,
  maxTokens: number
): Promise<ApiCallResult> {
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
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return {
    text: data.content?.[0]?.text || "",
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
    latencyMs,
  };
}

/**
 * Call OpenAI API using raw fetch (no SDK dependency).
 */
export async function callOpenAI(
  modelId: string,
  prompt: string,
  apiKey: string,
  maxTokens: number
): Promise<ApiCallResult> {
  const start = Date.now();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
    throw new Error(`OpenAI API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    latencyMs,
  };
}

/**
 * Call Google Gemini API using raw fetch (no SDK dependency).
 */
export async function callGemini(
  modelId: string,
  prompt: string,
  apiKey: string,
  _maxTokens: number
): Promise<ApiCallResult> {
  const start = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: _maxTokens },
    }),
  });

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

  return { text, inputTokens, outputTokens, latencyMs };
}

/**
 * Dispatch an API call to the correct provider.
 */
export async function callProvider(
  providerKey: string,
  modelId: string,
  prompt: string,
  apiKey: string,
  maxTokens: number
): Promise<ApiCallResult> {
  switch (providerKey) {
    case "anthropic":
      return callAnthropic(modelId, prompt, apiKey, maxTokens);
    case "openai":
      return callOpenAI(modelId, prompt, apiKey, maxTokens);
    case "gemini":
      return callGemini(modelId, prompt, apiKey, maxTokens);
    default:
      throw new Error(`Unknown provider: ${providerKey}`);
  }
}
