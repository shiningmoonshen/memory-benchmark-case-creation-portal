import { describe, it, expect } from "vitest";
import { validateCase } from "../../lib/validate";
import type { MemoryBlock } from "../../lib/schema";

const baseMemory: MemoryBlock[] = [
  { type: "conversation", date: "2024-01-01", content: "User: Hi\nAgent: Hello" },
];

const baseInput = {
  memory: baseMemory,
  prompt: "What did the user say?",
  expectedAnswer: "Hi",
  questionType: "single-session recall" as const,
  evidence: "User: Hi",
};

describe("validateCase", () => {
  it("is valid for a complete, correct input", () => {
    const result = validateCase(baseInput);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
    expect(result.mismatch).toBe(false);
  });

  it("errors when memory array is empty", () => {
    const result = validateCase({ ...baseInput, memory: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.memory).toBeDefined();
  });

  it("errors when all memory blocks have empty content", () => {
    const result = validateCase({
      ...baseInput,
      memory: [{ type: "conversation", date: "2024-01-01", content: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.memory).toBeDefined();
  });

  it("errors when memory content is only whitespace", () => {
    const result = validateCase({
      ...baseInput,
      memory: [{ type: "conversation", date: "2024-01-01", content: "   " }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.memory).toBeDefined();
  });

  it("errors when prompt is empty", () => {
    const result = validateCase({ ...baseInput, prompt: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.prompt).toBeDefined();
  });

  it("errors when prompt is only whitespace", () => {
    const result = validateCase({ ...baseInput, prompt: "   " });
    expect(result.valid).toBe(false);
    expect(result.errors.prompt).toBeDefined();
  });

  it("errors when expectedAnswer is empty", () => {
    const result = validateCase({ ...baseInput, expectedAnswer: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.expectedAnswer).toBeDefined();
  });

  it("errors when total memory exceeds 40,000 chars", () => {
    const bigContent = "a".repeat(40_001);
    const result = validateCase({
      ...baseInput,
      memory: [{ type: "conversation", date: "2024-01-01", content: bigContent }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.memoryLength).toBeDefined();
  });

  it("is valid at exactly the 40,000-char limit", () => {
    const content = "a".repeat(40_000);
    const result = validateCase({
      ...baseInput,
      memory: [{ type: "conversation", date: "2024-01-01", content }],
    });
    expect(result.errors.memoryLength).toBeUndefined();
  });

  it("sets mismatch when evidence is blank but question type is not abstention", () => {
    const result = validateCase({ ...baseInput, evidence: "", questionType: "single-session recall" });
    expect(result.mismatch).toBe(true);
  });

  it("does not set mismatch when evidence is blank, type is abstention, and expected answer looks like 'I don't know'", () => {
    const result = validateCase({
      ...baseInput,
      evidence: "",
      questionType: "abstention",
      expectedAnswer: "I don't know — that info wasn't provided.",
    });
    expect(result.mismatch).toBe(false);
  });

  it("sets mismatch when evidence is blank, type is abstention, but expected answer doesn't look like 'I don't know'", () => {
    const result = validateCase({
      ...baseInput,
      evidence: "",
      questionType: "abstention",
      expectedAnswer: "The budget is $50,000",
    });
    expect(result.mismatch).toBe(true);
  });

  it("does not set mismatch when evidence is provided", () => {
    const result = validateCase({ ...baseInput, evidence: "User: Hi", questionType: "single-session recall" });
    expect(result.mismatch).toBe(false);
  });

  it("can accumulate multiple errors at once", () => {
    const result = validateCase({ ...baseInput, memory: [], prompt: "", expectedAnswer: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.memory).toBeDefined();
    expect(result.errors.prompt).toBeDefined();
    expect(result.errors.expectedAnswer).toBeDefined();
  });
});
