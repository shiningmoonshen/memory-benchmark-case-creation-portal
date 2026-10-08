import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.APP_PASSCODE) {
    const passcode = req.headers.get("x-passcode");
    if (passcode !== process.env.APP_PASSCODE) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const checks: Record<string, string> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "present" : "missing",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "present" : "missing",
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "present" : "missing",
    SHEET_ID: process.env.SHEET_ID ? "present" : "missing",
  };

  try {
    const { createSheetsClient } = await import("@/lib/sheets/client");
    const client = createSheetsClient();
    await client.getRows("All submissions");
    checks.sheets = "ok";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    checks.sheets = `error: ${msg}`;
  }

  const allOk = Object.values(checks).every((v) => v === "present" || v === "ok");
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}
