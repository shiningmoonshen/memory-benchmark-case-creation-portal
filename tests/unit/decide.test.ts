import { describe, it, expect } from "vitest";
import { decide } from "../../lib/decide";

describe("decide", () => {
  it("returns ERROR when hasError is true, regardless of other inputs", () => {
    expect(decide({ wrongCount: 0, oracleCorrect: true, hasError: true })).toBe("ERROR");
    expect(decide({ wrongCount: 3, oracleCorrect: false, hasError: true })).toBe("ERROR");
  });

  it("returns FAIL when wrongCount is 0", () => {
    expect(decide({ wrongCount: 0, oracleCorrect: true, hasError: false })).toBe("FAIL");
    expect(decide({ wrongCount: 0, oracleCorrect: false, hasError: false })).toBe("FAIL");
  });

  it("returns FAIL when wrongCount is 1", () => {
    expect(decide({ wrongCount: 1, oracleCorrect: true, hasError: false })).toBe("FAIL");
    expect(decide({ wrongCount: 1, oracleCorrect: false, hasError: false })).toBe("FAIL");
  });

  it("returns PASS when wrongCount is 2 and oracle is correct", () => {
    expect(decide({ wrongCount: 2, oracleCorrect: true, hasError: false })).toBe("PASS");
  });

  it("returns PASS when wrongCount is 3 and oracle is correct", () => {
    expect(decide({ wrongCount: 3, oracleCorrect: true, hasError: false })).toBe("PASS");
  });

  it("returns FLAGGED when wrongCount is 2 and oracle is incorrect", () => {
    expect(decide({ wrongCount: 2, oracleCorrect: false, hasError: false })).toBe("FLAGGED");
  });

  it("returns FLAGGED when wrongCount is 3 and oracle is incorrect", () => {
    expect(decide({ wrongCount: 3, oracleCorrect: false, hasError: false })).toBe("FLAGGED");
  });
});
