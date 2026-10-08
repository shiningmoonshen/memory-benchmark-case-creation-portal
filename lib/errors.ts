export const ERROR_CODES = [
  "ENV_MISSING",
  "SHEETS_AUTH",
  "SHEETS_TAB_NOT_FOUND",
  "SHEETS_RATE_LIMIT",
  "ANTHROPIC_AUTH",
  "ANTHROPIC_BAD_MODEL",
  "ANTHROPIC_BAD_REQUEST",
  "OPENAI_AUTH",
  "OPENAI_BAD_PARAM",
  "PROVIDER_TIMEOUT",
  "JUDGE_PARSE",
  "VALIDATION",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  stage: string;
  code: ErrorCode;
  message: string;
}

const REDACT_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9\-_]{10,}/g,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g,
  /Bearer\s+[A-Za-z0-9\-_=+/.]{10,}/gi,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g,
  /ya29\.[A-Za-z0-9\-_]+/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
];

export function sanitizeMessage(raw: string): string {
  let s = raw;
  for (const pattern of REDACT_PATTERNS) {
    s = s.replace(pattern, "[REDACTED]");
  }
  return s.slice(0, 200);
}

function httpStatus(err: unknown): number {
  const e = err as Record<string, unknown>;
  if (typeof e?.status === "number") return e.status;
  const resp = e?.response as Record<string, unknown> | undefined;
  if (typeof resp?.status === "number") return resp.status;
  if (typeof e?.code === "number") return e.code;
  return 0;
}

/**
 * Extracts the provider-level error type string from Anthropic/OpenAI SDK errors.
 * Anthropic errors nest it as err.error.error.type ("invalid_request_error" etc.).
 * OpenAI errors expose it at err.type or err.error.type.
 */
function extractApiType(err: unknown): string | undefined {
  const e = err as Record<string, unknown>;
  const body = e?.error as Record<string, unknown> | undefined;
  return (
    ((body?.error as Record<string, unknown>)?.type as string | undefined) ??
    (body?.type as string | undefined) ??
    (e?.type as string | undefined)
  );
}

export function classifyError(err: unknown, stage: string): ErrorDetail {
  const apiType = extractApiType(err);
  const base = err instanceof Error ? err.message : String(err);
  // Prepend the provider's own error type so it's visible in logs,
  // e.g. "invalid_request_error: messages.0.content should be a non-empty string"
  const raw = apiType ? `${apiType}: ${base}` : base;
  const lower = raw.toLowerCase();
  const status = httpStatus(err);
  const isAbort =
    err instanceof Error &&
    (err.name === "AbortError" ||
      lower.includes("abort") ||
      lower.includes("user aborted"));

  let code: ErrorCode;

  if (isAbort || lower.includes("timeout") || lower.includes("timed out")) {
    code = "PROVIDER_TIMEOUT";
  } else if (lower.includes("judge unparseable")) {
    code = "JUDGE_PARSE";
  } else if (stage === "sheets_write") {
    if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
      code = "SHEETS_RATE_LIMIT";
    } else if (
      lower.includes("unable to parse range") ||
      lower.includes("not found") ||
      status === 404
    ) {
      code = "SHEETS_TAB_NOT_FOUND";
    } else {
      code = "SHEETS_AUTH";
    }
  } else if (stage === "runs") {
    if (
      status === 401 ||
      status === 403 ||
      lower.includes("authentication") ||
      lower.includes("api key") ||
      lower.includes("invalid x-api-key")
    ) {
      code = "ANTHROPIC_AUTH";
    } else if (
      status === 404 ||
      lower.includes("model_not_found") ||
      lower.includes("no such model") ||
      (lower.includes("model") && lower.includes("invalid"))
    ) {
      code = "ANTHROPIC_BAD_MODEL";
    } else if (status === 400 || lower.includes("invalid_request")) {
      code = "ANTHROPIC_BAD_REQUEST";
    } else {
      code = "PROVIDER_TIMEOUT";
    }
  } else if (stage === "judge") {
    if (status === 401 || status === 403) {
      code = "OPENAI_AUTH";
    } else if (
      status === 400 ||
      lower.includes("unsupported_parameter") ||
      lower.includes("invalid_request")
    ) {
      code = "OPENAI_BAD_PARAM";
    } else {
      code = "PROVIDER_TIMEOUT";
    }
  } else {
    code = "PROVIDER_TIMEOUT";
  }

  return { stage, code, message: sanitizeMessage(raw) };
}
