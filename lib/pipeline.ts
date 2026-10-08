import { randomUUID } from "crypto";
import { config } from "./config";
import { buildTestPrompt, buildOraclePrompt, buildJudgePrompt } from "./prompts";
import { parseJudgeResponse } from "./judgeParse";
import { decide } from "./decide";
import { resolveVersion } from "./versioning";
import { buildRow, COLUMN_HEADERS } from "./sheets/rowBuilder";
import { classifyError, type ErrorDetail } from "./errors";
import { logStage } from "./logger";
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

function makeErrorResult(requestId: string, errorInfo: ErrorDetail): PipelineResult {
  return {
    outcome: "ERROR",
    requestId,
    submissionId: randomUUID(),
    caseId: randomUUID(),
    version: 1,
    testAnswers: [],
    testVerdicts: [],
    wrongCount: 0,
    oracleAnswer: "",
    oracleVerdict: null,
    flags: [],
    errorDetail: `${errorInfo.stage}:${errorInfo.code}`,
    errorInfo,
  };
}

export async function runPipeline(
  caseInput: CaseInput,
  testProvider: LLMProvider,
  judgeProvider: LLMProvider,
  sheetsClient: SheetsClient,
  requestId: string
): Promise<PipelineResult> {
  const testPrompt = buildTestPrompt(caseInput.memory, caseInput.prompt);
  const oraclePrompt = buildOraclePrompt(caseInput.evidence, caseInput.prompt);

  // Stage: runs (3 test runs + oracle, all in parallel)
  let testAnswers: string[];
  let oracleAnswer: string;
  {
    const start = Date.now();
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
      logStage({ requestId, stage: "runs", ok: true, durationMs: Date.now() - start });
    } catch (err) {
      const errorInfo = classifyError(err, "runs");
      logStage({
        requestId,
        stage: "runs",
        ok: false,
        durationMs: Date.now() - start,
        code: errorInfo.code,
        error: errorInfo.message,
      });
      return makeErrorResult(requestId, errorInfo);
    }
  }

  // Stage: judge (all 4 answers in parallel)
  let testVerdicts: JudgeResponse[];
  let oracleVerdict: JudgeResponse;
  {
    const start = Date.now();
    try {
      const allVerdicts = await Promise.all([
        ...testAnswers.map((a) =>
          callJudge(caseInput.prompt, caseInput.expectedAnswer, a, judgeProvider)
        ),
        callJudge(caseInput.prompt, caseInput.expectedAnswer, oracleAnswer, judgeProvider),
      ]);
      testVerdicts = allVerdicts.slice(0, config.runs);
      oracleVerdict = allVerdicts[config.runs];
      logStage({ requestId, stage: "judge", ok: true, durationMs: Date.now() - start });
    } catch (err) {
      const errorInfo = classifyError(err, "judge");
      logStage({
        requestId,
        stage: "judge",
        ok: false,
        durationMs: Date.now() - start,
        code: errorInfo.code,
        error: errorInfo.message,
      });
      return makeErrorResult(requestId, errorInfo);
    }
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
  const deployment = process.env.VERCEL_URL ?? "local";
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
    deployment,
  });

  // Stage: sheets_write
  {
    const start = Date.now();
    try {
      await sheetsClient.append(config.sheetTabs.all, [row]);
      if (outcome === "PASS") {
        await sheetsClient.append(config.sheetTabs.passed, [row]);
      }
      logStage({ requestId, stage: "sheets_write", ok: true, durationMs: Date.now() - start });
    } catch (err) {
      const errorInfo = classifyError(err, "sheets_write");
      logStage({
        requestId,
        stage: "sheets_write",
        ok: false,
        durationMs: Date.now() - start,
        code: errorInfo.code,
        error: errorInfo.message,
      });
      return makeErrorResult(requestId, errorInfo);
    }
  }

  return {
    outcome,
    requestId,
    ...versionInfo,
    testAnswers,
    testVerdicts,
    wrongCount,
    oracleAnswer,
    oracleVerdict,
    flags,
    errorDetail: "",
  };
}
