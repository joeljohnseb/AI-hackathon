import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  buildInitialUserPrompt,
  buildClarificationPrompt,
  parseGenerateSqlResponse,
  type ChatHistoryMessage,
  type GenerateSqlResult,
} from "@/lib/prompt";

export type LlmGenerateInput = {
  question: string;
  schema: string;
  history: ChatHistoryMessage[];
  isClarification: boolean;
};

export type LlmProvider = "gemini" | "groq" | "openai";

export type LlmGenerateOutput = GenerateSqlResult & {
  userTurn: string;
  modelTurn: string;
  provider: LlmProvider;
};

/** Comma/newline-separated API keys from env. */
export function parseApiKeys(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function buildUserMessage(input: LlmGenerateInput): string {
  return input.isClarification
    ? buildClarificationPrompt(input.question)
    : buildInitialUserPrompt(input.question, input.schema);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(message: string): boolean {
  return /503|429|502|504|high demand|unavailable|overloaded|rate limit|timeout|ECONNRESET|fetch failed/i.test(
    message,
  );
}

/** Preferred model first, then free alternates if that one is overloaded. */
function geminiModelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const extras = (process.env.GEMINI_FALLBACK_MODELS || "")
    .split(/[\n,]+/)
    .map((m) => m.trim())
    .filter(Boolean);

  const defaults = [
    "gemini-3.6-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
  ];

  return [...new Set([preferred, ...extras, ...defaults])];
}

async function generateWithGeminiOnce(
  input: LlmGenerateInput,
  userMessage: string,
  apiKey: string,
  modelName: string,
): Promise<LlmGenerateOutput> {
  console.log(`[llm] Using Gemini model: ${modelName}`);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const chatHistory = input.history.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: chatHistory });
  const result = await chat.sendMessage(userMessage);
  const raw = result.response.text();

  if (!raw) {
    throw new Error("Empty response from Gemini");
  }

  const parsed = parseGenerateSqlResponse(raw);
  return {
    ...parsed,
    userTurn: userMessage,
    modelTurn: JSON.stringify(parsed),
    provider: "gemini",
  };
}

async function generateWithGemini(
  input: LlmGenerateInput,
  userMessage: string,
  apiKey: string,
): Promise<LlmGenerateOutput> {
  const models = geminiModelCandidates();
  const errors: string[] = [];

  for (const modelName of models) {
    // Retry transient failures a couple times per model.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await generateWithGeminiOnce(
          input,
          userMessage,
          apiKey,
          modelName,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const label = `${modelName} attempt ${attempt}/3`;
        console.error(`[llm] ${label} failed:`, message);
        errors.push(`${label}: ${message}`);

        if (isTransientGeminiError(message) && attempt < 3) {
          await sleep(600 * attempt);
          continue;
        }
        // Move to next model on hard failure or after retries.
        break;
      }
    }
  }

  throw new Error(
    `Gemini failed for all models.\n${errors.map((e) => `- ${e}`).join("\n")}`,
  );
}

async function generateWithOpenAICompatible(
  input: LlmGenerateInput,
  userMessage: string,
  options: {
    apiKey: string;
    baseURL?: string;
    model: string;
    provider: LlmProvider;
  },
): Promise<LlmGenerateOutput> {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...input.history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: options.model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error(`Empty response from ${options.provider}`);
  }

  const parsed = parseGenerateSqlResponse(raw);
  return {
    ...parsed,
    userTurn: userMessage,
    modelTurn: JSON.stringify(parsed),
    provider: options.provider,
  };
}

type Attempt = {
  label: string;
  run: () => Promise<LlmGenerateOutput>;
};

function buildAttempts(
  input: LlmGenerateInput,
  userMessage: string,
): Attempt[] {
  const attempts: Attempt[] = [];

  const geminiKeys = parseApiKeys(process.env.GEMINI_API_KEY);
  for (const [i, key] of geminiKeys.entries()) {
    attempts.push({
      label: `gemini#${i + 1}`,
      run: () => generateWithGemini(input, userMessage, key),
    });
  }

  // Groq free tier — OpenAI-compatible: https://console.groq.com/keys
  const groqKeys = parseApiKeys(process.env.GROQ_API_KEY);
  const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  for (const [i, key] of groqKeys.entries()) {
    attempts.push({
      label: `groq#${i + 1}`,
      run: () =>
        generateWithOpenAICompatible(input, userMessage, {
          apiKey: key,
          baseURL: "https://api.groq.com/openai/v1",
          model: groqModel,
          provider: "groq",
        }),
    });
  }

  // Optional paid/fallback OpenAI
  const openaiKeys = parseApiKeys(process.env.OPENAI_API_KEY);
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  for (const [i, key] of openaiKeys.entries()) {
    attempts.push({
      label: `openai#${i + 1}`,
      run: () =>
        generateWithOpenAICompatible(input, userMessage, {
          apiKey: key,
          model: openaiModel,
          provider: "openai",
        }),
    });
  }

  return attempts;
}

/**
 * Tries free providers first (Gemini → Groq), then OpenAI if configured.
 * Supports multiple keys per provider (comma-separated); on failure tries the next key/provider.
 */
export async function generateSqlWithFallback(
  input: LlmGenerateInput,
): Promise<LlmGenerateOutput> {
  const userMessage = buildUserMessage(input);
  const attempts = buildAttempts(input, userMessage);

  if (attempts.length === 0) {
    throw new Error(
      "No LLM configured. Set GEMINI_API_KEY and/or GROQ_API_KEY (free) in .env.local. Optional: OPENAI_API_KEY.",
    );
  }

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      if (errors.length > 0) {
        console.warn(
          `Succeeded with ${attempt.label} after earlier failures:`,
          errors,
        );
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${attempt.label} failed:`, message);
      errors.push(`${attempt.label}: ${message}`);
    }
  }

  throw new Error(
    `All LLM providers failed.\n${errors.map((e) => `- ${e}`).join("\n")}`,
  );
}

export function hasAnyLlmKey(): boolean {
  return (
    parseApiKeys(process.env.GEMINI_API_KEY).length > 0 ||
    parseApiKeys(process.env.GROQ_API_KEY).length > 0 ||
    parseApiKeys(process.env.OPENAI_API_KEY).length > 0
  );
}
