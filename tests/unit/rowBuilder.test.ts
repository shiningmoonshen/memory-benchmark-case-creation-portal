import { describe, it, expect } from "vitest";
import { buildRow, escapeFormula, clampCell, COLUMN_HEADERS } from "../../lib/sheets/rowBuilder";
import type { CaseInput, JudgeResponse } from "../../lib/schema";

const baseCaseInput: CaseInput = {
  characterId: "bunny",
  title: "Test case",
  memory: [{ type: "conversation", date: "2024-01-01", content: "User: Hi\nAgent: Hello" }],
  prompt: "What did the user say?",
  expectedAnswer: "Hi",
  questionType: "single-session recall",
  evidence: "User: Hi",
};

const baseVerdict: JudgeResponse = {
  verdict: "correct",
  ambiguous: false,
  reason: "Matches",
};

const baseRowInput = {
  submissionId: "sub-123",
  caseId: "case-456",
  version: 1,
  parentSubmissionId: "",
  caseInput: baseCaseInput,
  outcome: "PASS" as const,
  testAnswers: ["Hi", "Hello", "Hi"],
  testVerdicts: [baseVerdict, baseVerdict, baseVerdict],
  wrongCount: 0,
  oracleAnswer: "Hi",
  oracleVerdict: baseVerdict,
  flags: [],
  modelVersions: "test:claude-sonnet-5-5, judge:gpt-6.1-sol",
  errorDetail: "",
  deployment: "local",
};

describe("escapeFormula", () => {
  it("escapes cells starting with =", () => {
    expect(escapeFormula("=IMPORTXML(url,query)")).toBe("'=IMPORTXML(url,query)");
  });

  it("escapes cells starting with +", () => {
    expect(escapeFormula("+1")).toBe("'+1");
  });

  it("escapes cells starting with -", () => {
    expect(escapeFormula("-SUM(A1:A10)")).toBe("'-SUM(A1:A10)");
  });

  it("escapes cells starting with @", () => {
    expect(escapeFormula("@username")).toBe("'@username");
  });

  it("escapes cells starting with a tab character", () => {
    expect(escapeFormula("\ttabbed")).toBe("'\ttabbed");
  });

  it("escapes cells starting with a carriage return", () => {
    expect(escapeFormula("\rvalue")).toBe("'\rvalue");
  });

  it("does not escape normal text cells", () => {
    expect(escapeFormula("hello world")).toBe("hello world");
    expect(escapeFormula("pass")).toBe("pass");
    expect(escapeFormula("human-authored")).toBe("human-authored");
  });

  it("does not escape cells starting with a number", () => {
    expect(escapeFormula("42")).toBe("42");
  });
});

describe("clampCell", () => {
  it("passes through short content unchanged", () => {
    expect(clampCell("hello")).toBe("hello");
  });

  it("does not clamp at exactly 49,000 chars", () => {
    const exact = "a".repeat(49_000);
    expect(clampCell(exact)).toBe(exact);
  });

  it("clamps content over 49,000 chars and appends [truncated]", () => {
    const big = "a".repeat(50_000);
    const result = clampCell(big);
    expect(result).toContain("[truncated]");
    expect(result.length).toBe(49_000 + "[truncated]".length);
  });

  it("clamp starts content at the first 49,000 chars", () => {
    const big = "x".repeat(49_000) + "EXTRA";
    const result = clampCell(big);
    expect(result.startsWith("x".repeat(49_000))).toBe(true);
    expect(result).not.toContain("EXTRA");
  });
});

describe("buildRow", () => {
  it("produces exactly 21 columns", () => {
    const row = buildRow(baseRowInput);
    expect(row).toHaveLength(21);
  });

  it("column count matches COLUMN_HEADERS length", () => {
    expect(buildRow(baseRowInput)).toHaveLength(COLUMN_HEADERS.length);
  });

  it("places deployment identifier at index 20", () => {
    const row = buildRow({ ...baseRowInput, deployment: "myapp-abc123.vercel.app" });
    expect(row[20]).toBe("myapp-abc123.vercel.app");
  });

  it("deployment falls back to local when not on Vercel", () => {
    const row = buildRow({ ...baseRowInput, deployment: "local" });
    expect(row[20]).toBe("local");
  });

  it("places result (lowercase) at index 6", () => {
    const row = buildRow(baseRowInput);
    expect(row[6]).toBe("pass");
  });

  it("lowercases all outcome values", () => {
    expect(buildRow({ ...baseRowInput, outcome: "FAIL" })[6]).toBe("fail");
    expect(buildRow({ ...baseRowInput, outcome: "FLAGGED" })[6]).toBe("flagged");
    expect(buildRow({ ...baseRowInput, outcome: "ERROR" })[6]).toBe("error");
  });

  it("formats wrong count as N/3 at index 14", () => {
    expect(buildRow({ ...baseRowInput, wrongCount: 2 })[14]).toBe("2/3");
    expect(buildRow({ ...baseRowInput, wrongCount: 0 })[14]).toBe("0/3");
    expect(buildRow({ ...baseRowInput, wrongCount: 3 })[14]).toBe("3/3");
  });

  it("sets provenance to human-authored at index 17", () => {
    const row = buildRow(baseRowInput);
    expect(row[17]).toBe("human-authored");
  });

  it("escapes a formula-risk submissionId", () => {
    const row = buildRow({ ...baseRowInput, submissionId: "=DANGER" });
    expect(row[0]).toBe("'=DANGER");
  });

  it("escapes formula-risk in prompt field", () => {
    const caseWithFormulaPrompt = {
      ...baseCaseInput,
      prompt: "=SUM(A1:A10)",
    };
    const row = buildRow({ ...baseRowInput, caseInput: caseWithFormulaPrompt });
    expect(row[8]).toBe("'=SUM(A1:A10)");
  });

  it("handles empty test answers and verdicts for ERROR rows", () => {
    const errorRow = buildRow({
      ...baseRowInput,
      outcome: "ERROR",
      testAnswers: [],
      testVerdicts: [],
      oracleVerdict: null,
      errorDetail: "provider timeout",
    });
    expect(errorRow[6]).toBe("error");
    expect(errorRow[19]).toBe("provider timeout");
  });

  it("ERROR row error detail stays short for sanitized messages", () => {
    const errorRow = buildRow({
      ...baseRowInput,
      outcome: "ERROR",
      testAnswers: [],
      testVerdicts: [],
      oracleVerdict: null,
      errorDetail: "provider timeout",
    });
    expect(errorRow[19].length).toBeLessThan(100);
  });

  it("clamps cells that exceed 49,000 chars", () => {
    const bigAnswer = "a".repeat(50_000);
    const row = buildRow({ ...baseRowInput, testAnswers: [bigAnswer, "b", "c"] });
    const modelAnswersCell = row[12];
    expect(modelAnswersCell).toContain("[truncated]");
  });
});
