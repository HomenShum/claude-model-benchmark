/**
 * claude-model-benchmark — Deep Agent Engine (ReAct Pattern).
 *
 * Multi-step agentic benchmarking with planning, tool use, reflection.
 * Inspired by LangChain ReAct, Anthropic agents, Manus AI.
 */

import {
  PROVIDERS,
  getAvailableProviders,
  getAllModels,
  getApiKey,
  callProvider,
  callProviderMultiTurn,
} from "./providers";
import type { MultiTurnMessage } from "./providers";

// ─── Agent Types ─────────────────────────────────────────────────────────────

export interface AgentTool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

export interface AgentStep {
  thought: string;
  action: string;
  actionInput: string;
  observation: string;
}

export interface AgentResult {
  steps: AgentStep[];
  finalAnswer: string;
  totalSteps: number;
  provider: string;
}

// ─── System Prompt Builder ───────────────────────────────────────────────────

function buildAgentSystemPrompt(tools: AgentTool[]): string {
  const toolDescriptions = tools
    .map((t) => `  ${t.name}: ${t.description}`)
    .join("\n");

  return `You are a benchmark analysis agent. You investigate, test, and analyze AI models.

Available tools:
${toolDescriptions}

Format (exactly):

Thought: <your reasoning>
Action: <tool_name>
Action Input: <input for the tool>

When done:

Thought: <final reasoning>
Final Answer: <your comprehensive answer>

Rules:
- One tool per response
- Be thorough: test multiple models, compare, compute statistics
- Final Answer should have clear recommendations
- Do NOT combine Action and Final Answer`;
}

// ─── Response Parser ─────────────────────────────────────────────────────────

function parseAgentResponse(text: string): {
  thought: string;
  action?: string;
  actionInput?: string;
  finalAnswer?: string;
} {
  const lines = text.split("\n");
  let thought = "";
  let action = "";
  let actionInput = "";
  let finalAnswer = "";

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("Thought:")) {
      thought = trimmed.slice(8).trim();
    } else if (trimmed.startsWith("Action:") && !trimmed.startsWith("Action Input:")) {
      action = trimmed.slice(7).trim();
    } else if (trimmed.startsWith("Action Input:")) {
      const rest = trimmed.slice(13).trim();
      const inputLines = [rest];
      for (let j = i + 1; j < lines.length; j++) {
        const nt = lines[j].trim();
        if (nt.startsWith("Thought:") || nt.startsWith("Action:") ||
            nt.startsWith("Final Answer:") || nt.startsWith("Observation:")) break;
        inputLines.push(lines[j]);
      }
      actionInput = inputLines.join("\n").trim();
    } else if (trimmed.startsWith("Final Answer:")) {
      const idx = text.indexOf("Final Answer:");
      finalAnswer = text.slice(idx + 13).trim();
      break;
    }
  }

  return {
    thought,
    action: action || undefined,
    actionInput: actionInput || undefined,
    finalAnswer: finalAnswer || undefined,
  };
}

// ─── Agent Engine ────────────────────────────────────────────────────────────

export async function runAgent(options: {
  goal: string;
  tools: AgentTool[];
  context?: string;
  maxSteps?: number;
}): Promise<AgentResult> {
  const { goal, tools, context, maxSteps = 8 } = options;
  const steps: AgentStep[] = [];

  const availableProviders = getAvailableProviders();
  if (availableProviders.length === 0) {
    throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.");
  }

  const agentProviderKey = availableProviders[0];
  const agentApiKey = getApiKey(agentProviderKey)!;
  const providerCfg = PROVIDERS[agentProviderKey];
  const agentModel = providerCfg.models[0];

  const systemPrompt = buildAgentSystemPrompt(tools);
  const contextBlock = context ? `\n\nContext:\n${context}` : "";
  const messages: MultiTurnMessage[] = [
    { role: "user", content: `Goal: ${goal}${contextBlock}\n\nBegin.` },
  ];

  for (let i = 0; i < maxSteps; i++) {
    const response = await callProviderMultiTurn(
      agentProviderKey, agentModel.id, systemPrompt, messages, agentApiKey, 2048
    );

    messages.push({ role: "assistant", content: response.text });
    const parsed = parseAgentResponse(response.text);

    if (parsed.finalAnswer) {
      return {
        steps,
        finalAnswer: parsed.finalAnswer,
        totalSteps: i + 1,
        provider: `${agentModel.label} (${providerCfg.name})`,
      };
    }

    if (parsed.action) {
      const tool = tools.find((t) => t.name === parsed.action);
      let observation: string;

      try {
        if (tool) {
          observation = await tool.execute(parsed.actionInput || "");
        } else {
          observation = `Unknown tool: ${parsed.action}. Available: ${tools.map((t) => t.name).join(", ")}`;
        }
      } catch (e: unknown) {
        observation = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
      }

      steps.push({
        thought: parsed.thought,
        action: parsed.action,
        actionInput: parsed.actionInput || "",
        observation,
      });

      messages.push({ role: "user", content: `Observation: ${observation}\n\nContinue.` });
    } else {
      messages.push({ role: "user", content: "Use a tool or provide Final Answer." });
    }
  }

  return {
    steps,
    finalAnswer: steps.length > 0
      ? `Agent completed ${steps.length} steps. Tools used: ${[...new Set(steps.map((s) => s.action))].join(", ")}.`
      : "Agent reached maximum steps without executing tools.",
    totalSteps: maxSteps,
    provider: `${agentModel.label} (${providerCfg.name})`,
  };
}

// ─── Tool Factories ──────────────────────────────────────────────────────────

/** Full benchmark toolkit for the agent. */
export function createBenchmarkTools(): AgentTool[] {
  return [
    {
      name: "list_available_models",
      description: "List all models and provider status with pricing. No input required.",
      execute: async () => {
        const available = getAvailableProviders();
        const models = getAllModels();
        return JSON.stringify({
          configuredProviders: available,
          models: models.map((m) => ({
            id: m.id, label: m.label, provider: m.providerName,
            providerKey: m.provider, inputCost: m.inputCost, outputCost: m.outputCost,
            configured: available.includes(m.provider),
          })),
        });
      },
    },
    {
      name: "design_test_suite",
      description: 'Design targeted benchmark prompts. Input: JSON {"focus": "string", "count": number}.',
      execute: async (input) => {
        const parsed = JSON.parse(input);
        const available = getAvailableProviders();
        if (available.length === 0) return "No LLM provider available.";
        const providerKey = available[0];
        const apiKey = getApiKey(providerKey)!;
        const model = PROVIDERS[providerKey].models[0];
        const result = await callProvider(
          providerKey, model.id,
          `Design ${parsed.count || 3} benchmark prompts to test "${parsed.focus}". Return JSON array: [{"name": "test_name", "prompt": "the prompt"}]. Return ONLY JSON.`,
          apiKey, 1024
        );
        return result.text;
      },
    },
    {
      name: "run_single_test",
      description: 'Run a prompt against a model. Input: JSON {"model": "name", "prompt": "text"}.',
      execute: async (input) => {
        const parsed = JSON.parse(input);
        const models = getAllModels();
        const model = models.find((m) =>
          m.id === parsed.model || m.label.toLowerCase().includes(parsed.model.toLowerCase())
        );
        if (!model) return `Model not found: ${parsed.model}. Available: ${models.map((m) => m.label).join(", ")}`;
        const apiKey = getApiKey(model.provider);
        if (!apiKey) return `No API key for ${model.providerName}`;
        const result = await callProvider(model.provider, model.id, parsed.prompt, apiKey, 1024);
        return JSON.stringify({
          model: model.label, provider: model.providerName,
          latencyMs: result.latencyMs, inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          responsePreview: result.text.slice(0, 200),
          estimatedCost: Math.round(((result.inputTokens * model.inputCost + result.outputTokens * model.outputCost) / 1000) * 1e6) / 1e6,
        });
      },
    },
    {
      name: "compare_responses",
      description: "Compare model responses for quality. Input: JSON with responses array.",
      execute: async (input) => {
        const available = getAvailableProviders();
        if (available.length === 0) return "No LLM provider available.";
        const providerKey = available[0];
        const apiKey = getApiKey(providerKey)!;
        const model = PROVIDERS[providerKey].models[0];
        const result = await callProvider(
          providerKey, model.id,
          `Compare these model responses. Rank by quality, depth, accuracy. Explain why:\n\n${input}`,
          apiKey, 1024
        );
        return result.text;
      },
    },
    {
      name: "compute_statistics",
      description: "Compute stats (mean, p50, p95, min, max) on numeric data. Input: JSON array of numbers.",
      execute: async (input) => {
        const numbers: number[] = JSON.parse(input);
        if (!Array.isArray(numbers) || numbers.length === 0) return "Input must be non-empty JSON array of numbers.";
        const sorted = [...numbers].sort((a, b) => a - b);
        const mean = numbers.reduce((s, n) => s + n, 0) / numbers.length;
        return JSON.stringify({
          count: numbers.length, mean: Math.round(mean * 100) / 100,
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          min: sorted[0], max: sorted[sorted.length - 1],
        });
      },
    },
    {
      name: "analyze_results",
      description: "Analyze benchmark results with LLM. Input: JSON benchmark data.",
      execute: async (input) => {
        const available = getAvailableProviders();
        if (available.length === 0) return "No LLM provider available.";
        const providerKey = available[0];
        const apiKey = getApiKey(providerKey)!;
        const model = PROVIDERS[providerKey].models[0];
        const result = await callProvider(
          providerKey, model.id,
          `Analyze benchmark results. Identify winner, best value, fastest. Give clear recommendation:\n\n${input}`,
          apiKey, 1024
        );
        return result.text;
      },
    },
  ];
}

/** Comparison-focused tool subset. */
export function createCompareTools(): AgentTool[] {
  const all = createBenchmarkTools();
  const names = ["list_available_models", "run_single_test", "compare_responses", "compute_statistics", "analyze_results"];
  return names.map((n) => all.find((t) => t.name === n)!);
}
