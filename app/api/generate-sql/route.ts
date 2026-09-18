import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseGenerateSqlResponse,
} from "@/lib/prompt";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  question?: string;
  schema?: string;
  history?: HistoryMessage[];
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

  if (!schema) {
    return NextResponse.json(
      { error: "Schema is required. Paste MySQL DDL or load from a database." },
      { status: 400 },
    );
  }

  if (!question) {
    return NextResponse.json(
      { error: "Question is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not configured. Add it to .env.local and restart the server.",
      },
      { status: 500 },
    );
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const chatHistory = history.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  try {
    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(buildUserPrompt(question, schema));
    const content = result.response.text();

    if (!content) {
      return NextResponse.json(
        { error: "Empty response from Gemini" },
        { status: 502 },
      );
    }

    const parsed = parseGenerateSqlResponse(content);
    return NextResponse.json(parsed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate SQL";
    console.error("generate-sql error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
