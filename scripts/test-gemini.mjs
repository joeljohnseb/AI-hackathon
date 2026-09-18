#!/usr/bin/env node
/**
 * Smoke-test Gemini API configuration for this project.
 *
 * Usage:
 *   npm run test:gemini
 *
 * Checks:
 * 1. .env.local exists and GEMINI_API_KEY is set
 * 2. Lists a few available models for this key
 * 3. Sends a tiny generateContent request with GEMINI_MODEL
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const env = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function firstKey(raw) {
  if (!raw) return "";
  return (
    raw
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter(Boolean)[0] || ""
  );
}

function maskKey(key) {
  if (!key) return "(missing)";
  if (key.length <= 10) return "***";
  return `${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)`;
}

async function listModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `ListModels failed (${res.status}): ${body.error?.message || JSON.stringify(body)}`,
    );
  }
  const models = (body.models || [])
    .map((m) => (m.name || "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort();
  return models;
}

async function generateSmokeTest(apiKey, modelName) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(
    'Reply with exactly this JSON: {"ok":true}',
  );
  return result.response.text();
}

async function main() {
  console.log("=== Gemini API smoke test ===\n");

  if (!fs.existsSync(ENV_PATH)) {
    console.error(`FAIL: ${ENV_PATH} not found`);
    console.error("Create it from .env.example and set GEMINI_API_KEY.");
    process.exit(1);
  }
  console.log("OK  Found .env.local");

  const fileEnv = loadEnvFile(ENV_PATH);
  const apiKey = firstKey(process.env.GEMINI_API_KEY || fileEnv.GEMINI_API_KEY);
  const modelName = (
    process.env.GEMINI_MODEL ||
    fileEnv.GEMINI_MODEL ||
    "gemini-3.6-flash"
  ).trim();

  console.log(`    GEMINI_API_KEY = ${maskKey(apiKey)}`);
  console.log(`    GEMINI_MODEL   = ${modelName}`);

  if (!apiKey) {
    console.error("\nFAIL: GEMINI_API_KEY is empty");
    process.exit(1);
  }
  console.log("OK  GEMINI_API_KEY is set");

  let models = [];
  try {
    console.log("\n→ Listing models for this key…");
    models = await listModels(apiKey);
    console.log(`OK  ListModels succeeded (${models.length} models)`);
    const flashish = models.filter((m) => /flash|pro/i.test(m)).slice(0, 12);
    if (flashish.length) {
      console.log("    Sample models:");
      for (const m of flashish) console.log(`      - ${m}`);
    }
    if (!models.includes(modelName)) {
      console.warn(
        `\nWARN: configured model "${modelName}" was not in the ListModels response.`,
      );
      const suggestion =
        models.find((m) => m.includes("3.6-flash")) ||
        models.find((m) => m.includes("flash")) ||
        models[0];
      if (suggestion) {
        console.warn(`     Try GEMINI_MODEL=${suggestion}`);
      }
    } else {
      console.log(`OK  Model "${modelName}" is listed for this key`);
    }
  } catch (err) {
    console.error(`\nFAIL: Could not list models — ${err.message}`);
    console.error("     (Key may be invalid, or network/API blocked.)");
    process.exit(1);
  }

  try {
    console.log(`\n→ Calling generateContent on ${modelName}…`);
    const text = await generateSmokeTest(apiKey, modelName);
    console.log("OK  generateContent succeeded");
    console.log(
      `    Response: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`,
    );
    console.log("\n=== RESULT: Gemini is configured and working ===");
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFAIL: generateContent error`);
    console.error(`     ${message}`);

    if (/503|high demand|unavailable/i.test(message)) {
      console.error(
        "\n     Diagnosis: Google is overloaded for this model (temporary 503).",
      );
      console.error(
        "     Your API key is likely fine — retry later, or set GROQ_API_KEY as fallback.",
      );
    } else if (/404|no longer available|not found/i.test(message)) {
      console.error(
        "\n     Diagnosis: Model name is wrong or unavailable for new keys.",
      );
      const suggestion =
        models.find((m) => m.includes("3.6-flash")) ||
        models.find((m) => m.includes("flash"));
      if (suggestion) {
        console.error(`     Set GEMINI_MODEL=${suggestion} in .env.local`);
      }
    } else if (/400|401|403|API key|PERMISSION/i.test(message)) {
      console.error(
        "\n     Diagnosis: API key rejected. Create a new key at https://aistudio.google.com/apikey",
      );
    }

    console.error("\n=== RESULT: Gemini is NOT working right now ===");
    process.exit(1);
  }
}

main();
