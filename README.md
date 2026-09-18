# SQL Query Assistant

Chat-style **Database AI** that converts natural-language questions into **MySQL** SQL using Google Gemini.

Queries are **generated only** — they are never executed against your database. Optional MySQL connection support is limited to schema introspection (`SHOW TABLES` / `SHOW CREATE TABLE`).

## Features

- Question + schema → analyze intent against tables/columns/relationships
- Asks concise clarifying questions when anything is ambiguous (never invents schema)
- Multi-turn refine loop until the request is clear
- Final MySQL with a brief explanation; clear requests skip clarification
- Optional live schema load from MySQL (metadata only)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from the example file:

```bash
cp .env.example .env.local
```

3. Set free API keys in `.env.local` ([Gemini](https://aistudio.google.com/apikey) and/or [Groq](https://console.groq.com/keys)):

```env
# Tried in order; comma-separate multiple keys per provider
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.6-flash

GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile

# Optional paid last resort:
# OPENAI_API_KEY=sk-...
```

Failover order: **Gemini keys → Groq keys → OpenAI** (if set). When one key or provider fails (503, rate limit, etc.), the next runs automatically.

### Test Gemini configuration

```bash
npm run test:gemini
```

This checks that `.env.local` has a key, lists available models, and runs a tiny `generateContent` call. Use it to distinguish a bad key / wrong model from a temporary Google 503.

### Test the website API (same route the UI uses)

With `npm run dev` running:

```bash
npm run test:api
# or:
npm run test:api -- http://localhost:3000
```

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

1. Confirm the sample schema in the left panel, paste your own DDL, or click **Load from MySQL**.
2. Ask a question, e.g. “Top 10 customers by total order amount”.
3. The assistant analyzes your intent against the schema. If anything is unclear, it asks a clarifying question — reply in the same chat to refine.
4. When clear, it returns the final MySQL plus a short explanation. Copy and run it in your own tooling.

## API

### `POST /api/generate-sql`

```json
{
  "question": "Show revenue by region",
  "schema": "CREATE TABLE ...",
  "history": [],
  "isClarification": false
}
```

For follow-up clarification replies, send `isClarification: true` and the prior `history` turns from the active session.

Response:

```json
{
  "status": "clarification_needed",
  "analysis": "User wants revenue by region; schema has customers.country/city but no region column.",
  "content": "Which column should map to region — country or city?",
  "explanation": "",
  "missing_fields": ["region"],
  "userTurn": "...",
  "modelTurn": "..."
}
```

Or when ready:

```json
{
  "status": "sql_ready",
  "analysis": "Aggregate order totals per customer using orders.total_amount.",
  "content": "SELECT ...",
  "explanation": "Joins customers to orders and ranks by sum of total_amount.",
  "missing_fields": [],
  "userTurn": "...",
  "modelTurn": "..."
}
```

### `POST /api/introspect`

Accepts either a `connectionUri` or `{ host, port, user, password, database }` and returns concatenated `CREATE TABLE` DDL. Credentials are not stored.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Free LLMs: Google Gemini + Groq failover (optional OpenAI last)
- `mysql2` for optional schema introspection only
