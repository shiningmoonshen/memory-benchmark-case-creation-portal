import { randomUUID } from "crypto";
import { config } from "./config";
import { buildTestPrompt, buildOraclePrompt, buildJudgePrompt } from "./prompts";
import { parseJudgeResponse } from "./judgeParse";
import { decide } from "./decide";
import { resolveVersion } from "./versioning";
import { buildRow } from "./sheets/rowBuilder";
import type { CaseInput, PipelineResult, JudgeResponse } from "./schema";
import type { LLMProvider } from "./providers/types";
import type { SheetsClient } from "./sheets/types";

async function callJudge(
  prompt: string,
  expectedAnswer: string,
  modelAnswer: string,
  judgeProvider: LLMProvider
): Promise<JudgeResponse> {
  const judgePrompt = buildJudgePrompt(prompt, expectedAnswer, modelAnswer);
  const call = () =>
    judgeProvider.complete({
      system: judgePrompt.system,
      user: judgePrompt.user,
      maxTokens: config.judgeMaxOutputTokens,
      timeoutMs: config.callTimeoutMs,
    });

  let result = parseJudgeResponse(await call());
  if (!result.ok) {
    result = parseJudgeResponse(await call());
  }
  if (!result.ok) {
    throw new Error("judge unparseable after retry");
  }
  return result.response;
}

function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("abort") || msg.includes("timeout")) return "provider timeout";
    if (msg.includes("auth") || msg.includes("api key")) return "provider auth error";
    if (msg.includes("rate limit") || msg.includes("quota")) return "provider rate limit";
    if (msg.includes("unparseable")) return "judge unparseable after retry";
    return "provider error";
  }
  return "unknown error";
}

function makeErrorResult(errorDetail: string): PipelineResult {
  return {
    outcome: "ERROR",
    submissionId: randomUUID(),
    caseId: randomUUID(),
    version: 1,
    testAnswers: [],
    testVerdicts: [],
    wrongCount: 0,
    oracleAnswer: "",
    oracleVerdict: null,
    flags: [],
    errorDetail,
  };
}

export async function runPipeline(
  caseInput: CaseInput,
  testProvider: LLMProvider,
  judgeProvider: LLMProvider,
  sheetsClient: SheetsClient
): Promise<PipelineResult> {
  const testPrompt = buildTestPrompt(caseInput.memory, caseInput.prompt);
  const oraclePrompt = buildOraclePrompt(caseInput.evidence, caseInput.prompt);

  // 3 test runs + 1 oracle, all in parallel
  let testAnswers: string[];
  let oracleAnswer: string;
  try {
    const allAnswers = await Promise.all([
      ...Array.from({ length: config.runs }, () =>
        testProvider.complete({
          system: testPrompt.system,
          user: testPrompt.user,
          maxTokens: config.maxOutputTokens,
          timeoutMs: config.callTimeoutMs,
        })
      ),
      testProvider.complete({
        system: oraclePrompt.system,
        user: oraclePrompt.user,
        maxTokens: config.maxOutputTokens,
        timeoutMs: config.callTimeoutMs,
      }),
    ]);
    testAnswers = allAnswers.slice(0, config.runs);
    oracleAnswer = allAnswers[config.runs];
  } catch (err) {
    return makeErrorResult(sanitizeError(err));
  }

  // Judge all 4 answers in parallel
  let testVerdicts: JudgeResponse[];
  let oracleVerdict: JudgeResponse;
  try {
    const allVerdicts = await Promise.all([
      ...testAnswers.map((a) =>
        callJudge(caseInput.prompt, caseInput.expectedAnswer, a, judgeProvider)
      ),
      callJudge(caseInput.prompt, caseInput.expectedAnswer, oracleAnswer, judgeProvider),
    ]);
    testVerdicts = allVerdicts.slice(0, config.runs);
    oracleVerdict = allVerdicts[config.runs];
  } catch (err) {
    return makeErrorResult(sanitizeError(err));
  }

  const wrongCount = testVerdicts.filter((v) => v.verdict === "incorrect").length;
  const oracleCorrect = oracleVerdict.verdict === "correct";
  const outcome = decide({ wrongCount, oracleCorrect, hasError: false });

  const flags: string[] = [];
  if ([...testVerdicts, oracleVerdict].some((v) => v.ambiguous)) {
    flags.push("ambiguous-output");
  }

  const versionInfo = await resolveVersion(caseInput.parentSubmissionId, sheetsClient);

  const modelVersions = `test:${config.testModel.modelId}, judge:${config.judgeModel.modelId}`;
  const row = buildRow({
    ...versionInfo,
    parentSubmissionId: caseInput.parentSubmissionId ?? "",
    caseInput,
    outcome,
    testAnswers,
    testVerdicts,
    wrongCount,
    oracleAnswer,
    oracleVerdict,
    flags,
    modelVersions,
    errorDetail: "",
  });

  try {
    await sheetsClient.append(config.sheetTabs.all, [row]);
    if (outcome === "PASS") {
      await sheetsClient.append(config.sheetTabs.passed, [row]);
    }
  } catch {
    return makeErrorResult("sheets write error");
  }

  return {
    outcome,
    ...versionInfo,
    testAnswers,
    testVerdicts,
    wrongCount,
    oracleAnswer,
    oracleVerdict,
    flags,
  };
}
