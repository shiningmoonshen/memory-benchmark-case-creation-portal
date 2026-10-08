import { describe, it, expect } from "vitest";
import { sanitizeMessage, classifyError } from "../../lib/errors";

describe("sanitizeMessage", () => {
  it("strips Anthropic API key pattern", () => {
    const msg = "Request failed with key sk-ant-api03-abcDEF123xyz456uvwXYZ";
    const result = sanitizeMessage(msg);
    expect(result).not.toContain("sk-ant-api03-abcDEF123xyz456uvwXYZ");
    expect(result).toContain("[REDACTED]");
  });

  it("strips OpenAI API key pattern", () => {
    const msg = "Invalid key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz";
    const result = sanitizeMessage(msg);
    expect(result).not.toContain("sk-proj-");
    expect(result).toContain("[REDACTED]");
  });

  it("strips PEM private key block", () => {
    const msg =
      "Auth error: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234\n-----END RSA PRIVATE KEY-----";
    const result = sanitizeMessage(msg);
    expect(result).not.toContain("MIIEowIBAAKCAQEA1234");
    expect(result).toContain("[REDACTED]");
  });

  it("strips PKCS8 private key block", () => {
    const msg = "-----BEGIN PRIVATE KEY-----\nABCDEFGHIJ\n-----END PRIVATE KEY-----";
    const result = sanitizeMessage(msg);
    expect(result).not.toContain("ABCDEFGHIJ");
    expect(result).toContain("[REDACTED]");
  });

  it("strips Bearer token", () => {
    const msg = "Authorization: Bearer eyABCDEFGHIJKLMNOP1234567890";
    const result = sanitizeMessage(msg);
    expect(result).not.toContain("eyABCDEFGHIJKLMNOP1234567890");
    expect(result).toContain("[REDACTED]");
  });

  it("strips JWT token", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV";
    const result = sanitizeMessage(`Token expired: ${jwt}`);
    expect(result).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV");
    expect(result).toContain("[REDACTED]");
  });

  it("strips Google OAuth token", () => {
    const msg = "Refreshing ya29.A0AfH6SMBxyz123abc456def789ghi";
    const result = sanitizeMessage(msg);
    expect(result).not.toContain("ya29.A0AfH6SMBxyz123abc456def789ghi");
    expect(result).toContain("[REDACTED]");
  });

  it("truncates to 200 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeMessage(long).length).toBeLessThanOrEqual(200);
  });

  it("leaves short, safe messages unchanged", () => {
    expect(sanitizeMessage("provider timeout")).toBe("provider timeout");
    expect(sanitizeMessage("sheets write error")).toBe("sheets write error");
  });

  it("handles empty string", () => {
    expect(sanitizeMessage("")).toBe("");
  });
});

describe("classifyError — stage routing", () => {
  it("classifies abort as PROVIDER_TIMEOUT", () => {
    const err = Object.assign(new Error("The user aborted a request."), { name: "AbortError" });
    expect(classifyError(err, "runs").code).toBe("PROVIDER_TIMEOUT");
  });

  it("classifies judge unparseable as JUDGE_PARSE", () => {
    const err = new Error("judge unparseable after retry");
    expect(classifyError(err, "judge").code).toBe("JUDGE_PARSE");
  });

  it("classifies sheets 429 as SHEETS_RATE_LIMIT", () => {
    const err = Object.assign(new Error("rate limit exceeded"), { status: 429 });
    expect(classifyError(err, "sheets_write").code).toBe("SHEETS_RATE_LIMIT");
  });

  it("classifies sheets 'unable to parse range' as SHEETS_TAB_NOT_FOUND", () => {
    const err = new Error("Unable to parse range: Nonexistent");
    expect(classifyError(err, "sheets_write").code).toBe("SHEETS_TAB_NOT_FOUND");
  });

  it("classifies Anthropic 401 as ANTHROPIC_AUTH", () => {
    const err = Object.assign(new Error("authentication_error"), { status: 401 });
    expect(classifyError(err, "runs").code).toBe("ANTHROPIC_AUTH");
  });

  it("classifies OpenAI 400 as OPENAI_BAD_PARAM", () => {
    const err = Object.assign(new Error("invalid_request_error: unsupported_parameter"), {
      status: 400,
    });
    expect(classifyError(err, "judge").code).toBe("OPENAI_BAD_PARAM");
  });

  it("includes a sanitized, ≤200-char message", () => {
    const err = new Error("sk-ant-api03-secretXYZ123 failed");
    const detail = classifyError(err, "runs");
    expect(detail.message).not.toContain("sk-ant-api03-secretXYZ123");
    expect(detail.message.length).toBeLessThanOrEqual(200);
  });

  it("classifies Anthropic 400 as ANTHROPIC_BAD_REQUEST", () => {
    const err = Object.assign(new Error("messages.0.content: should be a non-empty string"), {
      status: 400,
    });
    expect(classifyError(err, "runs").code).toBe("ANTHROPIC_BAD_REQUEST");
  });

  it("prepends the nested API error type to the log message", () => {
    const err = Object.assign(new Error("messages.0.content: should be a non-empty string"), {
      status: 400,
      error: { error: { type: "invalid_request_error" } },
    });
    const detail = classifyError(err, "runs");
    expect(detail.message).toContain("invalid_request_error");
  });
});
