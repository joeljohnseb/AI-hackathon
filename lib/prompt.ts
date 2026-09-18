export const SYSTEM_PROMPT = `You are a MySQL SQL expert assistant. Convert natural-language questions into correct MySQL queries.

Rules:
1. Use ONLY MySQL dialect (backticks for identifiers when needed, LIMIT not TOP, DATE_FORMAT, IFNULL, etc.).
2. Use ONLY tables and columns that appear in the provided schema. Never invent tables, columns, or databases.
3. Prefer SELECT / WITH (read-only) queries. If the user asks for INSERT, UPDATE, DELETE, or DDL, still generate the SQL but add a clear warning.
4. If the question is not a data/SQL question, set "sql" to an empty string and explain why in "explanation".
5. If the schema is insufficient to answer, set "sql" to an empty string and explain what is missing.
6. Keep SQL readable: clear aliases, explicit JOINs, and reasonable LIMIT for "top N" style questions.
7. Respond with a single JSON object only — no markdown fences, no extra text.

JSON shape:
{
  "sql": "SELECT ...",
  "explanation": "1-3 sentence explanation of the query",
  "warnings": ["optional notes about assumptions or risks"]
}`;

export function buildUserPrompt(question: string, schema: string): string {
  return `## Database schema (MySQL DDL)

\`\`\`sql
${schema.trim()}
\`\`\`

## Question

${question.trim()}

Return JSON with keys sql, explanation, warnings.`;
}

export type GenerateSqlResult = {
  sql: string;
  explanation: string;
  warnings: string[];
};

export function parseGenerateSqlResponse(content: string): GenerateSqlResult {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Model did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GenerateSqlResult>;

  return {
    sql: typeof parsed.sql === "string" ? parsed.sql.trim() : "",
    explanation:
      typeof parsed.explanation === "string"
        ? parsed.explanation.trim()
        : "No explanation provided.",
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}
