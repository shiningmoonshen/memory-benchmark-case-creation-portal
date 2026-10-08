import { JudgeResponseSchema, type JudgeResponse } from "./schema";

export type ParseResult =
  | { ok: true; response: JudgeResponse }
  | { ok: false; retry: true };

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export function parseJudgeResponse(text: string): ParseResult {
  try {
    const stripped = stripCodeFences(text);
    const parsed = JSON.parse(stripped);
    const validated = JudgeResponseSchema.parse(parsed);
    return { ok: true, response: validated };
  } catch {
    return { ok: false, retry: true };
  }
}
