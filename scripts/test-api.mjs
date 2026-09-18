#!/usr/bin/env node
/**
 * Smoke-test the website API route /api/generate-sql (same path the UI uses).
 *
 * Usage:
 *   npm run test:api
 *   npm run test:api -- http://localhost:3000
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SAMPLE_SCHEMA = `CREATE TABLE customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);`;

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

async function main() {
  console.log("=== Website /api/generate-sql smoke test ===\n");
  console.log(`    Base URL: ${BASE}`);

  const payload = {
    question: "Top 10 customers by total order amount",
    schema: SAMPLE_SCHEMA,
    history: [],
    isClarification: false,
  };

  let res;
  try {
    res = await fetch(`${BASE}/api/generate-sql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(
      `FAIL: Could not reach ${BASE} — is the Next.js server running?`,
    );
    console.error(`     ${err instanceof Error ? err.message : String(err)}`);
    console.error("\nStart it with: npm run dev");
    process.exit(1);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`FAIL: Non-JSON response (HTTP ${res.status})`);
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  console.log(`    HTTP status: ${res.status}`);
  console.log(`    provider: ${data.provider || "(n/a)"}`);
  console.log(`    status:   ${data.status || "(n/a)"}`);

  if (!res.ok) {
    console.error(`\nFAIL: API error`);
    console.error(`     ${data.error || text}`);
    process.exit(1);
  }

  if (!data.status || !["sql_ready", "clarification_needed"].includes(data.status)) {
    console.error("\nFAIL: Unexpected response shape");
    console.error(JSON.stringify(data, null, 2).slice(0, 800));
    process.exit(1);
  }

  if (data.status === "sql_ready") {
    console.log("OK  SQL generated");
    console.log(`    content (SQL):\n${String(data.content || "").slice(0, 400)}`);
    if (data.explanation) {
      console.log(`    explanation: ${data.explanation}`);
    }
  } else {
    console.log("OK  Clarification returned (valid pipeline response)");
    console.log(`    question: ${data.content}`);
  }

  // Confirm env file still present for debugging context
  const envPath = path.join(ROOT, ".env.local");
  console.log(
    fs.existsSync(envPath)
      ? "\nOK  .env.local present"
      : "\nWARN .env.local missing",
  );

  console.log("\n=== RESULT: Website API call succeeded ===");
  process.exit(0);
}

main();
