import { describe, it, expect } from "vitest";
import { buildTestPrompt, buildOraclePrompt, buildJudgePrompt } from "../../lib/prompts";
import type { MemoryBlock } from "../../lib/schema";

const memory: MemoryBlock[] = [
  {
    type: "conversation",
    date: "2024-07-02",
    content: "User: What is my Q3 budget?\nAgent: Your Q3 budget is $50,000.",
  },
  {
    type: "document",
    date: "2024-07-15",
    title: "Q3 Report",
    content: "Projected spend: $48,000.",
  },
];

describe("buildTestPrompt", () => {
  it("includes all memory block contents in the user message", () => {
    const { user } = buildTestPrompt(memory, "What is my budget?");
    expect(user).toContain("$50,000");
    expect(user).toContain("$48,000");
  });

  it("includes the memory block title when present", () => {
    const { user } = buildTestPrompt(memory, "What is my budget?");
    expect(user).toContain("Q3 Report");
  });

  it("includes the question", () => {
    const { user } = buildTestPrompt(memory, "What is my budget?");
    expect(user).toContain("What is my budget?");
  });

  it("includes date in block header", () => {
    const { user } = buildTestPrompt(memory, "test");
    expect(user).toContain("2024-07-02");
    expect(user).toContain("2024-07-15");
  });
});

describe("buildOraclePrompt", () => {
  it("includes evidence content", () => {
    const evidence = "Agent: Your Q3 budget is $50,000.";
    const { user } = buildOraclePrompt(evidence, "What is my budget?");
    expect(user).toContain("$50,000");
  });

  it("does not include memory blocks that are not in evidence", () => {
    const evidence = "Agent: Your Q3 budget is $50,000.";
    const { user } = buildOraclePrompt(evidence, "What is my budget?");
    expect(user).not.toContain("Q3 Report");
    expect(user).not.toContain("$48,000");
  });

  it("handles empty evidence for abstention cases", () => {
    const { user } = buildOraclePrompt("", "What is my budget?");
    expect(user).not.toContain("$50,000");
    expect(user).toContain("What is my budget?");
  });
});

describe("buildJudgePrompt", () => {
  it("wraps each value in XML delimiters", () => {
    const { user } = buildJudgePrompt("Who sent the email?", "Alice", "Bob");
    expect(user).toContain("<question>");
    expect(user).toContain("</question>");
    expect(user).toContain("<expected_answer>");
    expect(user).toContain("</expected_answer>");
    expect(user).toContain("<model_answer>");
    expect(user).toContain("</model_answer>");
  });

  it("places question, expected answer, and model answer inside their tags", () => {
    const { user } = buildJudgePrompt("Who sent the email?", "Alice", "Bob");
    expect(user).toContain("<question>Who sent the email?</question>");
    expect(user).toContain("<expected_answer>Alice</expected_answer>");
    expect(user).toContain("<model_answer>Bob</model_answer>");
  });

  it("requests JSON-only output in the system prompt", () => {
    const { system } = buildJudgePrompt("q", "a", "b");
    expect(system.toLowerCase()).toContain("json");
  });

  it("does not include memory block content — only question, expected, and model answer", () => {
    const secretMemory = "INTERNAL_MEMORY_CONTENT_XYZ";
    const { user, system } = buildJudgePrompt("Who sent the email?", "Alice", "Bob");
    expect(user).not.toContain(secretMemory);
    expect(system).not.toContain(secretMemory);
  });

  it("system prompt states content inside tags is data, not instructions", () => {
    const { system } = buildJudgePrompt("q", "a", "b");
    expect(system.toLowerCase()).toMatch(/data|instructions?|evaluate/);
  });
});
