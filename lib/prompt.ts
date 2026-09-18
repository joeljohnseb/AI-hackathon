import { SchemaType, type ResponseSchema } from "@google/generative-ai";

export const SYSTEM_PROMPT = `You are an AI SQL Query Assistant for MySQL.

The user always provides:
1) A natural-language question
2) A database schema (tables, columns, relationships, data types)

You MUST follow this pipeline before producing SQL:

Question + Schema → Analyze → Clarify (if needed) → Refine → Final SQL

## Pipeline steps (every turn)

1. Understand the user's intent (what result they want).
2. Analyze the provided schema: identify relevant tables, columns, relationships, and data types that could answer the request.
3. Detect ambiguity or missing information (unclear metrics, filters, time ranges, which of several similar columns, missing join keys in the request, etc.).
4. If anything material is ambiguous or missing relative to the schema, do NOT generate SQL. Ask one concise clarification question.
5. When the user answers, refine the requirements using their reply and prior context.
6. Only when the intent is clear AND every needed table/column/relationship exists in the schema, generate the final MySQL query.
7. Briefly explain the query.

## Hard rules

- NEVER invent tables, columns, relationships, databases, or data that are not in the schema.
- NEVER guess when ambiguous — ask instead.
- If the request is already clear against the schema, skip clarification and return sql_ready immediately.
- Use ONLY MySQL dialect.
- Prefer readable SELECT / WITH queries; use explicit JOINs and reasonable LIMIT for "top N".
- When status is "sql_ready":
  - "content" = raw SQL only (no markdown fences, no commentary).
  - "explanation" = 1–3 sentence explanation of what the query does.
  - "analysis" = short note of intent + schema objects used.
  - "missing_fields" = [].
- When status is "clarification_needed":
  - "content" = one concise clarifying question.
  - "explanation" = "" (empty).
  - "analysis" = short note of intent + which schema objects you considered and what is unclear.
  - "missing_fields" = list of unclear items (labels).
- Respond with a single JSON object only.

JSON shape:
{
  "status": "clarification_needed" | "sql_ready",
  "analysis": "intent + relevant schema objects (and gaps if clarifying)",
  "content": "clarifying question OR final SQL",
  "explanation": "brief query explanation when sql_ready; else empty",
  "missing_fields": ["unclear_item"]
}`;

export const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    status: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["clarification_needed", "sql_ready"],
      description:
        "clarification_needed when details are missing; sql_ready when query can be produced",
    },
    analysis: {
      type: SchemaType.STRING,
      description:
        "Brief understanding of intent and relevant schema tables/columns/relationships",
    },
    content: {
      type: SchemaType.STRING,
      description:
        "One clarifying question when clarification_needed; raw MySQL SQL when sql_ready",
    },
    explanation: {
      type: SchemaType.STRING,
      description:
        "Brief explanation of the SQL when sql_ready; empty string when clarifying",
    },
    missing_fields: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Unclear or missing items; empty array when sql_ready",
    },
  },
  required: [
    "status",
    "analysis",
    "content",
    "explanation",
    "missing_fields",
  ],
};

export type PipelineStatus = "clarification_needed" | "sql_ready";

export type GenerateSqlResult = {
  status: PipelineStatus;
  analysis: string;
  content: string;
  explanation: string;
  missing_fields: string[];
};

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/** First turn: question + schema → analyze → clarify or SQL. */
export function buildInitialUserPrompt(question: string, schema: string): string {
  return `## Database schema (MySQL DDL)

\`\`\`sql
${schema.trim()}
\`\`\`

## Question

${question.trim()}

Follow the pipeline: Analyze intent against this schema. If anything is ambiguous or missing, ask one concise clarification question (do not invent schema objects). If already clear, return the final MySQL SQL with a brief explanation. Return JSON with status, analysis, content, explanation, missing_fields.`;
}

/** Follow-up: user answered a clarifying question → refine → SQL or more clarify. */
export function buildClarificationPrompt(answer: string): string {
  return `## Clarification from the user

${answer.trim()}

Refine the requirements using this answer and the prior schema/question. If still ambiguous, ask another concise clarification question. If clear, return the final MySQL SQL with a brief explanation. Never invent tables, columns, or relationships. Return JSON with status, analysis, content, explanation, missing_fields.`;
}

export function stripSqlMarkdown(sql: string): string {
  let cleaned = sql.trim();
  cleaned = cleaned.replace(/^```(?:sql|mysql)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");
  return cleaned.trim();
}

export function parseGenerateSqlResponse(raw: string): GenerateSqlResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Model did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GenerateSqlResult> & {
    status?: string;
  };

  const status: PipelineStatus =
    parsed.status === "sql_ready" ? "sql_ready" : "clarification_needed";

  let content =
    typeof parsed.content === "string" ? parsed.content.trim() : "";

  if (status === "sql_ready") {
    content = stripSqlMarkdown(content);
  }

  const analysis =
    typeof parsed.analysis === "string" ? parsed.analysis.trim() : "";
  const explanation =
    typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
  const missing_fields = Array.isArray(parsed.missing_fields)
    ? parsed.missing_fields.filter((f): f is string => typeof f === "string")
    : [];

  if (status === "sql_ready" && !content) {
    throw new Error("Model returned sql_ready without SQL content");
  }

  if (status === "clarification_needed" && !content) {
    content =
      "Could you clarify which tables or columns you mean for this question?";
  }

  return {
    status,
    analysis,
    content,
    explanation:
      status === "sql_ready"
        ? explanation || "This query answers your request using the provided schema."
        : "",
    missing_fields: status === "sql_ready" ? [] : missing_fields,
  };
}
