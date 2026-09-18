import { NextResponse } from "next/server";
import {
  generateSqlWithFallback,
  hasAnyLlmKey,
  type LlmGenerateInput,
} from "@/lib/llm";
import type { ChatHistoryMessage } from "@/lib/prompt";

type RequestBody = {
  question?: string;
  schema?: string;
  history?: ChatHistoryMessage[];
  isClarification?: boolean;
};

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim() ?? "";
  const schema = body.schema?.trim() ?? "";
  const isClarification = Boolean(body.isClarification);
  const history = Array.isArray(body.history) ? body.history.slice(-16) : [];

  if (!schema) {
    return NextResponse.json(
      { error: "Schema is required. Paste MySQL DDL or load from a database." },
      { status: 400 },
    );
  }

  if (!question) {
    return NextResponse.json(
      {
        error: isClarification
          ? "Clarification reply is required."
          : "Question is required.",
      },
      { status: 400 },
    );
  }

  if (isClarification && history.length === 0) {
    return NextResponse.json(
      {
        error:
          "No active chat session. Ask a new question before sending a clarification.",
      },
      { status: 400 },
    );
  }

  if (!hasAnyLlmKey()) {
    return NextResponse.json(
      {
        error:
          "No LLM API key configured. Add free GEMINI_API_KEY and/or GROQ_API_KEY to .env.local (optional OPENAI_API_KEY) and restart.",
      },
      { status: 500 },
    );
  }

  const input: LlmGenerateInput = {
    question,
    schema,
    history,
    isClarification,
  };

  try {
    const result = await generateSqlWithFallback(input);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate SQL";
    console.error("generate-sql error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
