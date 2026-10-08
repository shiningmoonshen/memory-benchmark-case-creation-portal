import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CaseInputSchema } from "@/lib/schema";
import { validateCase } from "@/lib/validate";
import { runPipeline } from "@/lib/pipeline";
import { AnthropicProvider } from "@/lib/providers/anthropic";
import { OpenAIProvider } from "@/lib/providers/openai";
import { MockProvider } from "@/lib/providers/mock";
import { createSheetsClient } from "@/lib/sheets/client";
import { FakeSheetsClient } from "@/lib/sheets/fakeClient";

export const maxDuration = 60;

function getProviders() {
  if (process.env.LLM_MODE === "mock") {
    const scenario = process.env.MOCK_SCENARIO ?? "pass";
    return {
      testProvider: new MockProvider(scenario),
      judgeProvider: new MockProvider(scenario),
    };
  }
  return {
    testProvider: new AnthropicProvider(),
    judgeProvider: new OpenAIProvider(),
  };
}

/** Debug error detail is only included for local + preview, never production */
function isDebugMode(): boolean {
  return (
    process.env.DEBUG_ERRORS === "true" &&
    process.env.VERCEL_ENV !== "production"
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  if (process.env.APP_PASSCODE) {
    const passcode = req.headers.get("x-passcode");
    if (passcode !== process.env.APP_PASSCODE) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CaseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const caseInput = parsed.data;
  const validation = validateCase(caseInput);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validation failed", errors: validation.errors },
      { status: 400 }
    );
  }

  const { testProvider, judgeProvider } = getProviders();
  const sheetsClient =
    process.env.LLM_MODE === "mock" ? new FakeSheetsClient() : createSheetsClient();

  const result = await runPipeline(caseInput, testProvider, judgeProvider, sheetsClient, requestId);

  // Strip message from errorInfo unless in debug mode (never expose in production)
  const { errorInfo } = result;
  const clientErrorInfo = errorInfo
    ? isDebugMode()
      ? errorInfo
      : { stage: errorInfo.stage, code: errorInfo.code }
    : undefined;

  return NextResponse.json({ ...result, errorInfo: clientErrorInfo });
}
