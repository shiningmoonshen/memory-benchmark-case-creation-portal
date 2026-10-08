import type { Outcome } from "./schema";
import { config } from "./config";

interface DecideInput {
  wrongCount: number;
  oracleCorrect: boolean;
  hasError: boolean;
}

export function decide({ wrongCount, oracleCorrect, hasError }: DecideInput): Outcome {
  if (hasError) return "ERROR";
  if (wrongCount < config.passThreshold) return "FAIL";
  if (oracleCorrect) return "PASS";
  return "FLAGGED";
}
