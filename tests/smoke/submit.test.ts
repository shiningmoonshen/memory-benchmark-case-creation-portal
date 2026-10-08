import { describe, it, expect } from "vitest";
import { runPipeline } from "../../lib/pipeline";
import { MockProvider } from "../../lib/providers/mock";
import { FakeSheetsClient } from "../../lib/sheets/fakeClient";
import { config } from "../../lib/config";
import type { CaseInput } from "../../lib/schema";

const normalCase: CaseInput = {
  characterId: "bunny",
  title: "Smoke test case",
  memory: [
    {
      type: "conversation",
      date: "2024-01-01",
      content: "User: My preferred meeting day is Thursday.\nAgent: Got it, Thursday works.",
    },
  ],
  prompt: "What day does the user prefer for meetings?",
  expectedAnswer: "Thursday",
  questionType: "single-session recall",
  evidence: "User: My preferred meeting day is Thursday.",
};

describe("submit pipeline smoke test", () => {
  it("normal case end to end — row appended to All submissions", async () => {
    const testProvider = new MockProvider("fail"); // model gets it right → FAIL outcome
    const judgeProvider = new MockProvider("fail");
    const sheets = new FakeSheetsClient();

    const result = await runPipeline(normalCase, testProvider, judgeProvider, sheets);

    expect(result.outcome).not.toBe("ERROR");
    expect(result.submissionId).toBeTruthy();
    expect(result.caseId).toBeTruthy();
    expect(typeof result.version).toBe("number");

    const allRows = sheets.getAllRows(config.sheetTabs.all);
    expect(allRows).toHaveLength(1);
    expect(allRows[0][6]).toBe(result.outcome.toLowerCase()); // Result column
  });

  it("result includes testAnswers, verdicts, wrongCount, oracleAnswer", async () => {
    const testProvider = new MockProvider("fail");
    const judgeProvider = new MockProvider("fail");
    const sheets = new FakeSheetsClient();

    const result = await runPipeline(normalCase, testProvider, judgeProvider, sheets);

    expect(result.testAnswers).toHaveLength(config.runs);
    expect(result.testVerdicts).toHaveLength(config.runs);
    expect(typeof result.wrongCount).toBe("number");
    expect(typeof result.oracleAnswer).toBe("string");
    expect(result.oracleVerdict).not.toBeNull();
  });
});
