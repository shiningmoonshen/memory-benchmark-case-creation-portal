import { describe, it, expect } from "vitest";
import { runPipeline } from "../../lib/pipeline";
import { MockProvider } from "../../lib/providers/mock";
import { FakeSheetsClient } from "../../lib/sheets/fakeClient";
import { config } from "../../lib/config";
import type { CaseInput } from "../../lib/schema";

const normalCase: CaseInput = {
  characterId: "raccoon",
  title: "Pass smoke test",
  memory: [
    {
      type: "conversation",
      date: "2024-07-02",
      content: "User: We have $50,000 for Q3 software.\nAgent: Noted, $50,000 for Q3 software.",
    },
    {
      type: "conversation",
      date: "2024-08-14",
      content: "User: We moved $8,000 to the contractor line.\nAgent: Understood.",
    },
  ],
  prompt: "What is the remaining Q3 software budget?",
  expectedAnswer: "$42,000",
  questionType: "multi-session reasoning",
  evidence:
    "User: We have $50,000 for Q3 software.\nUser: We moved $8,000 to the contractor line.",
};

describe("PASS outcome smoke test", () => {
  it("2 of 3 wrong + oracle correct → PASS, rows in both tabs", async () => {
    // MockProvider "pass": test runs 1-3 return MOCK_WRONG, oracle returns correct answer
    const testProvider = new MockProvider("pass");
    const judgeProvider = new MockProvider("pass");
    const sheets = new FakeSheetsClient();

    const result = await runPipeline(normalCase, testProvider, judgeProvider, sheets);

    expect(result.outcome).toBe("PASS");
    expect(result.wrongCount).toBeGreaterThanOrEqual(2);
    expect(result.oracleVerdict?.verdict).toBe("correct");

    // Row appended to All submissions
    const allRows = sheets.getAllRows(config.sheetTabs.all);
    expect(allRows).toHaveLength(1);
    expect(allRows[0][6]).toBe("pass");

    // Row also appended to Passed tab
    const passedRows = sheets.getAllRows(config.sheetTabs.passed);
    expect(passedRows).toHaveLength(1);
    expect(passedRows[0][6]).toBe("pass");
  });

  it("PASS result contains the wrong test answers", async () => {
    const testProvider = new MockProvider("pass");
    const judgeProvider = new MockProvider("pass");
    const sheets = new FakeSheetsClient();

    const result = await runPipeline(normalCase, testProvider, judgeProvider, sheets);

    const wrongAnswers = result.testAnswers.filter((_, i) => result.testVerdicts[i].verdict === "incorrect");
    expect(wrongAnswers.length).toBeGreaterThanOrEqual(2);
  });
});
