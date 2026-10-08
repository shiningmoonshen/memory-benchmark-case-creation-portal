import { vi, describe, it, expect, afterEach } from "vitest";
import * as promptsModule from "../../lib/prompts";
import { runPipeline } from "../../lib/pipeline";
import { MockProvider } from "../../lib/providers/mock";
import { FakeSheetsClient } from "../../lib/sheets/fakeClient";
import { config } from "../../lib/config";
import type { CaseInput } from "../../lib/schema";
import type { LLMProvider } from "../../lib/providers/types";

// Satisfy the LLMProvider interface for the bad judge below
type CompleteFn = LLMProvider["complete"];

const baseCase: CaseInput = {
  characterId: "bear",
  title: "Error row test",
  memory: [{ type: "conversation", date: "2024-01-01", content: "User: Hi\nAgent: Hello" }],
  prompt: "What did the user say?",
  expectedAnswer: "Hi",
  questionType: "single-session recall",
  evidence: "User: Hi",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("every error path writes an ERROR row to All submissions", () => {
  it("exception in prompt builder → ERROR row, stage=runs", async () => {
    vi.spyOn(promptsModule, "buildTestPrompt").mockImplementation(() => {
      throw new Error("prompt builder exploded");
    });

    const sheets = new FakeSheetsClient();
    const result = await runPipeline(
      baseCase,
      new MockProvider("pass"),
      new MockProvider("pass"),
      sheets,
      "req-prompt-boom"
    );

    expect(result.outcome).toBe("ERROR");
    expect(result.errorInfo?.stage).toBe("runs");

    const rows = sheets.getAllRows(config.sheetTabs.all);
    expect(rows).toHaveLength(1);
    expect(rows[0][6]).toBe("error");
    expect(rows[0][19]).toContain("runs");
  });

  it("provider error → ERROR row, code=PROVIDER_TIMEOUT", async () => {
    const sheets = new FakeSheetsClient();
    const result = await runPipeline(
      baseCase,
      new MockProvider("error"),
      new MockProvider("pass"),
      sheets,
      "req-provider-err"
    );

    expect(result.outcome).toBe("ERROR");
    expect(result.errorInfo?.code).toBe("PROVIDER_TIMEOUT");

    const rows = sheets.getAllRows(config.sheetTabs.all);
    expect(rows).toHaveLength(1);
    expect(rows[0][6]).toBe("error");
    expect(rows[0][19]).toBe("runs:PROVIDER_TIMEOUT");
  });

  it("judge parse failure → ERROR row, code=JUDGE_PARSE", async () => {
    // Provider that returns valid test answers but unparseable judge JSON
    const badJudge: { complete: CompleteFn } = {
      async complete({ user }: Parameters<CompleteFn>[0]): Promise<string> {
        if (user.includes("<question>")) {
          return "not valid json at all ¯\\_(ツ)_/¯";
        }
        return "The answer is Hi";
      },
    };

    const sheets = new FakeSheetsClient();
    const result = await runPipeline(
      baseCase,
      new MockProvider("fail"), // model answers correctly → runs stage succeeds
      badJudge,
      sheets,
      "req-judge-parse"
    );

    expect(result.outcome).toBe("ERROR");
    expect(result.errorInfo?.code).toBe("JUDGE_PARSE");

    const rows = sheets.getAllRows(config.sheetTabs.all);
    expect(rows).toHaveLength(1);
    expect(rows[0][6]).toBe("error");
    expect(rows[0][19]).toBe("judge:JUDGE_PARSE");
  });
});
