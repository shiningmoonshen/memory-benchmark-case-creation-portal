import { config } from "./config";
import type { MemoryBlock, QuestionType } from "./schema";

interface ValidateInput {
  memory: MemoryBlock[];
  prompt: string;
  expectedAnswer: string;
  questionType: QuestionType;
  evidence: string;
}

export interface FieldErrors {
  memory?: string;
  prompt?: string;
  expectedAnswer?: string;
  memoryLength?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldErrors;
  mismatch: boolean;
}

function looksLikeIDontKnow(answer: string): boolean {
  const lower = answer.toLowerCase();
  return (
    lower.includes("don't know") ||
    lower.includes("do not know") ||
    lower.includes("doesn't know") ||
    lower.includes("not provided") ||
    lower.includes("wasn't provided") ||
    lower.includes("wasn't given")
  );
}

export function validateCase(input: ValidateInput): ValidationResult {
  const errors: FieldErrors = {};

  const hasMemoryContent =
    input.memory.length > 0 && input.memory.some((b) => b.content.trim().length > 0);
  if (!hasMemoryContent) {
    errors.memory = "Add at least one memory block with content.";
  }

  if (!input.prompt.trim()) {
    errors.prompt = "Question is required.";
  }

  if (!input.expectedAnswer.trim()) {
    errors.expectedAnswer = "Expected answer is required.";
  }

  const totalMemoryChars = input.memory.reduce((sum, b) => sum + b.content.length, 0);
  if (totalMemoryChars > config.maxMemoryChars) {
    errors.memoryLength = `Memory exceeds the ${config.maxMemoryChars.toLocaleString()} character limit.`;
  }

  const mismatch =
    input.evidence === "" &&
    (input.questionType !== "abstention" || !looksLikeIDontKnow(input.expectedAnswer));

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    mismatch,
  };
}

export function totalMemoryChars(memory: MemoryBlock[]): number {
  return memory.reduce((sum, b) => sum + b.content.length, 0);
}
