import type { LLMProvider } from "./types";

export class MockProvider implements LLMProvider {
  private callCount = 0;
  private readonly scenario: string;

  constructor(scenario?: string) {
    this.scenario = scenario ?? process.env.MOCK_SCENARIO ?? "pass";
  }

  async complete({
    user,
  }: {
    system: string;
    user: string;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<string> {
    // Judge calls are detected by the XML delimiters in the user message
    if (user.includes("<question>")) {
      return this.judgeResponse(user);
    }

    this.callCount++;

    if (this.scenario === "error") {
      throw new Error("mock provider error");
    }

    return this.testResponse();
  }

  private testResponse(): string {
    switch (this.scenario) {
      case "pass":
        // Calls 1-3 are test runs (wrong), call 4 is oracle (right)
        return this.callCount <= 3 ? "MOCK_WRONG_ANSWER" : "This is the correct answer.";
      case "flagged":
        // All runs wrong including oracle
        return "MOCK_WRONG_ANSWER";
      case "fail":
      default:
        return "This is the correct answer.";
    }
  }

  private judgeResponse(user: string): string {
    const match = user.match(/<model_answer>([\s\S]*?)<\/model_answer>/);
    const modelAnswer = match?.[1] ?? "";
    const isWrong = modelAnswer.includes("MOCK_WRONG");
    return JSON.stringify({
      verdict: isWrong ? "incorrect" : "correct",
      ambiguous: false,
      reason: isWrong ? "mock incorrect" : "mock correct",
    });
  }
}
