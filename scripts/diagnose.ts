/**
 * Diagnostic script — runs each pipeline stage with live config and prints pass/fail.
 *
 * Usage:
 *   npm run diagnose
 */

import { config } from "../lib/config";
import { AnthropicProvider } from "../lib/providers/anthropic";
import { OpenAIProvider } from "../lib/providers/openai";
import { createSheetsClient } from "../lib/sheets/client";
import { classifyError } from "../lib/errors";

const PASS = "✓";
const FAIL = "✗";

async function check(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`${PASS}  ${label}`);
    return true;
  } catch (err) {
    const detail = classifyError(err, "");
    console.log(`${FAIL}  ${label}  [${detail.code}] ${detail.message}`);
    return false;
  }
}

function checkEnv(key: string): boolean {
  if (process.env[key]) {
    console.log(`${PASS}  ${key}`);
    return true;
  }
  console.log(`${FAIL}  ${key}  [ENV_MISSING] not set`);
  return false;
}

async function main() {
  console.log("\n── Environment variables ──────────────────────────────────\n");
  const envOk = [
    checkEnv("ANTHROPIC_API_KEY"),
    checkEnv("OPENAI_API_KEY"),
    checkEnv("GOOGLE_SERVICE_ACCOUNT_JSON"),
    checkEnv("SHEET_ID"),
  ];

  console.log("\n── Google Sheets ───────────────────────────────────────────\n");
  const sheetsResults: boolean[] = [];
  if (envOk[2] && envOk[3]) {
    let client: ReturnType<typeof createSheetsClient>;
    const authOk = await check("Sheets auth (create client)", async () => {
      client = createSheetsClient();
    });
    sheetsResults.push(authOk);

    if (authOk) {
      sheetsResults.push(
        await check(`Tab exists: "${config.sheetTabs.all}"`, async () => {
          await client.getRows(config.sheetTabs.all);
        })
      );
      sheetsResults.push(
        await check(`Tab exists: "${config.sheetTabs.passed}"`, async () => {
          await client.getRows(config.sheetTabs.passed);
        })
      );
    }
  } else {
    console.log(`  (skipped — GOOGLE_SERVICE_ACCOUNT_JSON or SHEET_ID missing)`);
  }

  console.log("\n── Anthropic (test model) ──────────────────────────────────\n");
  const anthropicResults: boolean[] = [];
  if (envOk[0]) {
    anthropicResults.push(
      await check(`${config.testModel.modelId} — auth + basic call`, async () => {
        const provider = new AnthropicProvider();
        await provider.complete({
          system: "You are a test assistant.",
          user: 'Reply with only the word "ok".',
          maxTokens: 5,
          timeoutMs: 15_000,
        });
      })
    );
  } else {
    console.log(`  (skipped — ANTHROPIC_API_KEY missing)`);
  }

  console.log("\n── OpenAI (judge model) ────────────────────────────────────\n");
  const openaiResults: boolean[] = [];
  if (envOk[1]) {
    openaiResults.push(
      await check(`${config.judgeModel.modelId} — auth + basic call`, async () => {
        const provider = new OpenAIProvider();
        await provider.complete({
          system: "You are a test assistant.",
          user: 'Reply with only the word "ok".',
          maxTokens: 16, // gpt-6.1-sol requires ≥ 16
          timeoutMs: 15_000,
        });
      })
    );
  } else {
    console.log(`  (skipped — OPENAI_API_KEY missing)`);
  }

  const all = [...envOk, ...sheetsResults, ...anthropicResults, ...openaiResults];
  const passed = all.filter(Boolean).length;
  console.log(`\n── Summary: ${passed}/${all.length} checks passed ──────────────────────────────\n`);
  process.exit(passed === all.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
