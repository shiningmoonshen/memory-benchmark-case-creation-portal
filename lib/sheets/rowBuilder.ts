import type { CaseInput, Outcome, JudgeResponse } from "../schema";

const MAX_CELL_CHARS = 49_000;
const FORMULA_RISK = /^[=+\-@\t\r]/;

export function escapeFormula(cell: string): string {
  return FORMULA_RISK.test(cell) ? `'${cell}` : cell;
}

export function clampCell(cell: string): string {
  return cell.length > MAX_CELL_CHARS ? cell.slice(0, MAX_CELL_CHARS) + "[truncated]" : cell;
}

function safe(value: string): string {
  return escapeFormula(clampCell(value));
}

export interface RowInput {
  submissionId: string;
  caseId: string;
  version: number;
  parentSubmissionId: string;
  caseInput: CaseInput;
  outcome: Outcome;
  testAnswers: string[];
  testVerdicts: JudgeResponse[];
  wrongCount: number;
  oracleAnswer: string;
  oracleVerdict: JudgeResponse | null;
  flags: string[];
  modelVersions: string;
  errorDetail: string;
}

export function buildRow(input: RowInput): string[] {
  const {
    submissionId,
    caseId,
    version,
    parentSubmissionId,
    caseInput,
    outcome,
    testAnswers,
    testVerdicts,
    wrongCount,
    oracleAnswer,
    oracleVerdict,
    flags,
    modelVersions,
    errorDetail,
  } = input;

  const modelAnswersStr = testAnswers.map((a, i) => `Run ${i + 1}: ${a}`).join("\n");
  const verdictsStr = testVerdicts
    .map((v, i) => `Run ${i + 1}: ${v.verdict} — ${v.reason}`)
    .join("\n");
  const oracleStr = `${oracleAnswer} | verdict: ${oracleVerdict?.verdict ?? "n/a"} — ${oracleVerdict?.reason ?? ""}`;

  return [
    safe(submissionId),
    safe(caseId),
    safe(String(version)),
    safe(parentSubmissionId),
    safe(caseInput.characterId),
    safe(new Date().toISOString()),
    safe(outcome.toLowerCase()),
    safe(JSON.stringify(caseInput.memory)),
    safe(caseInput.prompt),
    safe(caseInput.expectedAnswer),
    safe(caseInput.questionType),
    safe(caseInput.evidence),
    safe(modelAnswersStr),
    safe(verdictsStr),
    safe(`${wrongCount}/3`),
    safe(oracleStr),
    safe(flags.join(", ")),
    safe("human-authored"),
    safe(modelVersions),
    safe(errorDetail),
  ];
}
