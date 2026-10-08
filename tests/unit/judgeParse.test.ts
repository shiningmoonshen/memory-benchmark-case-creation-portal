import { describe, it, expect } from "vitest";
import { parseJudgeResponse } from "../../lib/judgeParse";

describe("parseJudgeResponse", () => {
  it("parses a correct verdict", () => {
    const result = parseJudgeResponse(
      '{"verdict": "correct", "ambiguous": false, "reason": "Matches expected"}'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.verdict).toBe("correct");
      expect(result.response.ambiguous).toBe(false);
      expect(result.response.reason).toBe("Matches expected");
    }
  });

  it("parses an incorrect, ambiguous verdict", () => {
    const result = parseJudgeResponse(
      '{"verdict": "incorrect", "ambiguous": true, "reason": "Answer was hedged"}'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.verdict).toBe("incorrect");
      expect(result.response.ambiguous).toBe(true);
    }
  });

  it("strips ```json code fences before parsing", () => {
    const result = parseJudgeResponse(
      '```json\n{"verdict": "correct", "ambiguous": false, "reason": "OK"}\n```'
    );
    expect(result.ok).toBe(true);
  });

  it("strips plain ``` code fences before parsing", () => {
    const result = parseJudgeResponse(
      '```\n{"verdict": "incorrect", "ambiguous": false, "reason": "Wrong"}\n```'
    );
    expect(result.ok).toBe(true);
  });

  it("returns retry signal for completely malformed text", () => {
    const result = parseJudgeResponse("I cannot evaluate this.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retry).toBe(true);
  });

  it("returns retry signal when JSON parses but schema is wrong (bad verdict value)", () => {
    const result = parseJudgeResponse(
      '{"verdict": "maybe", "ambiguous": false, "reason": "unsure"}'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retry).toBe(true);
  });

  it("returns retry signal when required fields are missing", () => {
    const result = parseJudgeResponse('{"verdict": "correct"}');
    expect(result.ok).toBe(false);
  });

  it("handles whitespace around valid JSON", () => {
    const result = parseJudgeResponse(
      '  \n  {"verdict": "correct", "ambiguous": false, "reason": "fine"}  \n  '
    );
    expect(result.ok).toBe(true);
  });
});
