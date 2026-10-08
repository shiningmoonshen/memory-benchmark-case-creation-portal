import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { classifyError } from "@/lib/errors";

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

  // Sheets: auth + both tabs checked separately
  try {
    const { createSheetsClient } = await import("@/lib/sheets/client");
    const client = createSheetsClient();

    for (const tabKey of ["all", "passed"] as const) {
      const tabName = config.sheetTabs[tabKey];
      try {
        await client.getRows(tabName);
        checks[`sheets:${tabName}`] = "ok";
      } catch (err) {
        checks[`sheets:${tabName}`] = classifyError(err, "sheets_write").code;
      }
    }
  } catch (err) {
    const code = classifyError(err, "sheets_write").code;
    checks["sheets:auth"] = code;
    checks[`sheets:${config.sheetTabs.all}`] = "skipped";
    checks[`sheets:${config.sheetTabs.passed}`] = "skipped";
  }

  const allOk = Object.values(checks).every((v) => v === "present" || v === "ok");
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}
