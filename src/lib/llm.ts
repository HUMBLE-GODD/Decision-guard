import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ─── Configuration ──────────────────────────────────────

type LLMProvider = "anthropic" | "openai" | "openrouter" | "groq";

interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}

function getConfig(): LLMConfig {
  const provider = (process.env.DECISIONGUARD_LLM_PROVIDER || "anthropic") as LLMProvider;
  const model = process.env.DECISIONGUARD_LLM_MODEL || getDefaultModel(provider);
  const apiKey = resolveApiKey(provider);
  return { provider, model, apiKey };
}

function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic": return "claude-sonnet-4-6-20250514";
    case "openai": return "gpt-4o";
    case "openrouter": return "anthropic/claude-sonnet-4-6-20250514";
    case "groq": return "qwen/qwen3.8-27b";
  }
}

function resolveApiKey(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic": {
      const key = process.env.DECISIONGUARD_LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY (or DECISIONGUARD_LLM_API_KEY) not set for provider=anthropic");
      return key;
    }
    case "openai": {
      const key = process.env.DECISIONGUARD_LLM_API_KEY || process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY (or DECISIONGUARD_LLM_API_KEY) not set for provider=openai");
      return key;
    }
    case "openrouter": {
      const key = process.env.DECISIONGUARD_LLM_API_KEY || process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY (or DECISIONGUARD_LLM_API_KEY) not set for provider=openrouter");
      return key;
    }
    case "groq": {
      const key = process.env.DECISIONGUARD_LLM_API_KEY || process.env.GROQ_API_KEY;
      if (!key) throw new Error("GROQ_API_KEY (or DECISIONGUARD_LLM_API_KEY) not set for provider=groq");
      return key;
    }
  }
}

// ─── Shared interface ───────────────────────────────────

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}

// ─── Provider clients (lazy) ────────────────────────────

let _anthropicClient: Anthropic | null = null;
const _openaiClients = new Map<string, OpenAI>();

function getAnthropicClient(apiKey: string): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

function getOpenAIClient(apiKey: string, baseURL?: string): OpenAI {
  const cacheKey = `${baseURL || "default"}:${apiKey}`;
  let client = _openaiClients.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    _openaiClients.set(cacheKey, client);
  }
  return client;
}

// ─── Main completion function ───────────────────────────

export async function llmComplete(
  messages: LLMMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
    system?: string;
  } = {}
): Promise<LLMResponse> {
  const config = getConfig();
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.7;

  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config, messages, maxTokens, temperature, options.system);
    case "openai":
      return callOpenAI(config, messages, maxTokens, temperature, options.system);
    case "openrouter":
      return callOpenRouter(config, messages, maxTokens, temperature, options.system);
    case "groq":
      return callOpenAI(config, messages, maxTokens, temperature, options.system, "https://api.groq.com/openai/v1");
  }
}

// ─── Anthropic ──────────────────────────────────────────

async function callAnthropic(
  config: LLMConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number,
  system?: string
): Promise<LLMResponse> {
  const client = getAnthropicClient(config.apiKey);

  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const systemText = system || messages.find((m) => m.role === "system")?.content;

  const response = await client.messages.create({
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    ...(systemText ? { system: systemText } : {}),
    messages: anthropicMessages,
  });

  const textBlock = response.content.find((b) => b.type === "text");

  return {
    content: textBlock?.text || "",
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

// ─── OpenAI ─────────────────────────────────────────────

async function callOpenAI(
  config: LLMConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number,
  system?: string,
  baseURL?: string
): Promise<LLMResponse> {
  const client = getOpenAIClient(config.apiKey, baseURL);

  const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (system) {
    openaiMessages.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    openaiMessages.push({ role: msg.role, content: msg.content });
  }

  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    messages: openaiMessages,
  });

  const message = response.choices[0]?.message as { content?: string; reasoning?: string } | undefined;
  return {
    content: message?.content || message?.reasoning || "",
    model: response.model,
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens || 0,
        }
      : undefined,
  };
}

// ─── OpenRouter (OpenAI-compatible) ─────────────────────

async function callOpenRouter(
  config: LLMConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number,
  system?: string
): Promise<LLMResponse> {
  const client = getOpenAIClient(config.apiKey, "https://openrouter.ai/api/v1");

  const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (system) {
    openaiMessages.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    openaiMessages.push({ role: msg.role, content: msg.content });
  }

  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    messages: openaiMessages,
  });

  return {
    content: response.choices[0]?.message?.content || "",
    model: response.model,
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens || 0,
        }
      : undefined,
  };
}
