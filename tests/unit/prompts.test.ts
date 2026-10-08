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

describe("buildTestPrompt — edge cases", () => {
  it("renders multiple blocks with blank lines and a conversation ending on Agent:", () => {
    const blocks: MemoryBlock[] = [
      {
        type: "conversation",
        date: "2024-07-01",
        content:
          "User: Hello\nAgent: Hi there\n\nUser: What is my budget?\nAgent: Your budget is $50,000.",
      },
      {
        type: "document",
        date: "2024-07-02",
        title: "Q3 Notes",
        content: "Line 1\n\nLine 2\n\nLine 3",
      },
      {
        type: "conversation",
        date: "2024-07-03",
        // ends on an Agent: turn — trimEnd should strip trailing whitespace
        content: "User: Thanks for confirming.\nAgent: You're welcome.\nUser: One more thing.\nAgent: ",
      },
    ];

    const { user } = buildTestPrompt(blocks, "What is my budget?");

    // Single non-empty string — not an array or multi-turn structure
    expect(typeof user).toBe("string");
    expect(user.trim().length).toBeGreaterThan(0);

    // All block content present as plain text
    expect(user).toContain("$50,000");
    expect(user).toContain("Q3 Notes");
    expect(user).toContain("Line 1");
    expect(user).toContain("You're welcome.");
    expect(user).toContain("What is my budget?");

    // Trailing empty Agent: turn should be trimmed, not left dangling
    expect(user).not.toMatch(/Agent:\s*$/m);
  });

  it("filters out blocks with empty or whitespace-only content", () => {
    const blocks: MemoryBlock[] = [
      { type: "conversation", date: "2024-07-01", content: "User: Hi\nAgent: Hello" },
      { type: "document", date: "2024-07-02", content: "" },
      { type: "transcript", date: "2024-07-03", content: "   " },
    ];

    const { user } = buildTestPrompt(blocks, "What did the user say?");

    // The empty/whitespace blocks should not create headers with no content
    expect(user).toContain("User: Hi");
    // Only one block header should appear (the conversation)
    expect(user.match(/\[CONVERSATION/g)?.length).toBe(1);
    expect(user).not.toContain("[DOCUMENT");
    expect(user).not.toContain("[TRANSCRIPT");
  });

  it("returns a non-empty user message even if all blocks are filtered out", () => {
    const blocks: MemoryBlock[] = [
      { type: "conversation", date: "2024-07-01", content: "" },
    ];

    const { user } = buildTestPrompt(blocks, "What happened?");
    expect(user.trim().length).toBeGreaterThan(0);
  });

  it("user message is a plain string — no array or message-turn structure", () => {
    const { user, system } = buildTestPrompt(memory, "What is my budget?");
    // Both must be plain strings, never arrays
    expect(typeof user).toBe("string");
    expect(typeof system).toBe("string");
    // User:/Agent: labels inside content must not be message role separators
    // (verify they appear as literal text inside the user string)
    expect(user).toContain("User:");
    expect(user).toContain("Agent:");
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
