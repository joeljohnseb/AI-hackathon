# SQL Query Assistant

Chat-style **Database AI** that converts natural-language questions into **MySQL** SQL using Google Gemini.

Queries are **generated only** — they are never executed against your database. Optional MySQL connection support is limited to schema introspection (`SHOW TABLES` / `SHOW CREATE TABLE`).

## Features

- Paste MySQL `CREATE TABLE` DDL or load a bundled sample schema
- Optional live schema load from MySQL (metadata only)
- Chat UI with copyable SQL, explanations, and warnings
- Regenerate the last query

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from the example file:

```bash
cp .env.example .env.local
```

3. Set your Gemini API key ([get one here](https://aistudio.google.com/apikey)):

```env
GEMINI_API_KEY=your-gemini-api-key
# Optional:
# GEMINI_MODEL=gemini-3.6-flash
```

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

1. Confirm the sample schema in the left panel, paste your own DDL, or click **Load from MySQL**.
2. Ask a question, e.g. “Top 10 customers by total order amount”.
3. Copy the generated MySQL and run it in your own client/tooling.

## API

### `POST /api/generate-sql`

```json
{
  "question": "Which products sold the most last month?",
  "schema": "CREATE TABLE ...",
  "history": []
}
```

Response:

```json
{
  "sql": "SELECT ...",
  "explanation": "...",
  "warnings": []
}
```

### `POST /api/introspect`

Accepts either a `connectionUri` or `{ host, port, user, password, database }` and returns concatenated `CREATE TABLE` DDL. Credentials are not stored.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Google Gemini SDK (`gemini-3.6-flash` by default)
- `mysql2` for optional schema introspection only
