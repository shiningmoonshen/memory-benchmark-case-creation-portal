import { z } from "zod";

export const MemoryBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("conversation"),
    date: z.string(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("transcript"),
    date: z.string(),
    title: z.string().optional(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("document"),
    date: z.string(),
    title: z.string().optional(),
    content: z.string(),
  }),
]);

export type MemoryBlock = z.infer<typeof MemoryBlockSchema>;

export const QuestionTypeSchema = z.enum([
  "single-session recall",
  "multi-session reasoning",
  "knowledge update",
  "temporal reasoning",
  "preference recall",
  "abstention",
  "conflict resolution",
]);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const CaseInputSchema = z.object({
  characterId: z.string().min(1),
  title: z.string().min(1),
  memory: z.array(MemoryBlockSchema).min(1),
  prompt: z.string().min(1),
  expectedAnswer: z.string().min(1),
  questionType: QuestionTypeSchema,
  evidence: z.string(),
  parentSubmissionId: z.string().optional(),
});

export type CaseInput = z.infer<typeof CaseInputSchema>;

export const OutcomeSchema = z.enum(["PASS", "FAIL", "FLAGGED", "ERROR"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const JudgeResponseSchema = z.object({
  verdict: z.enum(["correct", "incorrect"]),
  ambiguous: z.boolean(),
  reason: z.string(),
});

export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

export interface PipelineResult {
  outcome: Outcome;
  requestId: string;
  submissionId: string;
  caseId: string;
  version: number;
  testAnswers: string[];
  testVerdicts: JudgeResponse[];
  wrongCount: number;
  oracleAnswer: string;
  oracleVerdict: JudgeResponse | null;
  flags: string[];
  /** stage:code written to the Error detail column; "" for non-error outcomes */
  errorDetail: string;
  /** present only for ERROR outcomes; message stripped from client response when not in debug mode */
  errorInfo?: { stage: string; code: string; message: string };
}
