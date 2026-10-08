import type { Outcome } from "./schema";

interface DecideInput {
  wrongCount: number;
  oracleCorrect: boolean;
  hasError: boolean;
}

export function decide({ wrongCount, oracleCorrect, hasError }: DecideInput): Outcome {
  if (hasError) return "ERROR";
  if (wrongCount <= 1) return "FAIL";
  if (oracleCorrect) return "PASS";
  return "FLAGGED";
}
