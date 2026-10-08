import { randomUUID } from "crypto";
import { config } from "./config";
import { buildTestPrompt, buildOraclePrompt, buildJudgePrompt } from "./prompts";
import { parseJudgeResponse } from "./judgeParse";
import { decide } from "./decide";
import { resolveVersion } from "./versioning";
import { buildRow } from "./sheets/rowBuilder";
import { classifyError, type ErrorDetail } from "./errors";
import { logStage } from "./logger";
import type { CaseInput, PipelineResult, JudgeResponse, Outcome } from "./schema";
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

export async function runPipeline(
  caseInput: CaseInput,
  testProvider: LLMProvider,
  judgeProvider: LLMProvider,
  sheetsClient: SheetsClient,
  requestId: string
): Promise<PipelineResult> {
  // Resolve version info up front so it's available for both success and error rows.
  // resolveVersion has its own internal fallback; the outer guard handles edge cases.
  let versionInfo = { submissionId: randomUUID(), caseId: randomUUID(), version: 1 };
  try {
    versionInfo = await resolveVersion(caseInput.parentSubmissionId, sheetsClient);
  } catch {
    // keep fresh IDs
  }

  // Mutable accumulators — populated as stages complete; used in the row even on error
  let currentStage = "runs";
  let testAnswers: string[] = [];
  let oracleAnswer = "";
  let testVerdicts: JudgeResponse[] = [];
  let oracleVerdict: JudgeResponse | null = null;
  let wrongCount = 0;
  let flags: string[] = [];
  let outcome: Outcome = "ERROR";
  let errorInfo: ErrorDetail | undefined;
  let stageStartMs = Date.now();

  try {
    // Stage: runs — prompt building is inside the try block so any synchronous
    // exception here is caught and still produces an ERROR row in Sheets.
    const testPrompt = buildTestPrompt(caseInput.memory, caseInput.prompt);
    const oraclePrompt = buildOraclePrompt(caseInput.evidence, caseInput.prompt);

    stageStartMs = Date.now();
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
    logStage({ requestId, stage: "runs", ok: true, durationMs: Date.now() - stageStartMs });

    // Stage: judge
    currentStage = "judge";
    stageStartMs = Date.now();
    const allVerdicts = await Promise.all([
      ...testAnswers.map((a) =>
        callJudge(caseInput.prompt, caseInput.expectedAnswer, a, judgeProvider)
      ),
      callJudge(caseInput.prompt, caseInput.expectedAnswer, oracleAnswer, judgeProvider),
    ]);
    testVerdicts = allVerdicts.slice(0, config.runs);
    oracleVerdict = allVerdicts[config.runs];
    logStage({ requestId, stage: "judge", ok: true, durationMs: Date.now() - stageStartMs });

    wrongCount = testVerdicts.filter((v) => v.verdict === "incorrect").length;
    const oracleCorrect = oracleVerdict.verdict === "correct";
    outcome = decide({ wrongCount, oracleCorrect, hasError: false });

    if ([...testVerdicts, oracleVerdict].some((v) => v.ambiguous)) {
      flags = ["ambiguous-output"];
    }
  } catch (err) {
    errorInfo = classifyError(err, currentStage);
    logStage({
      requestId,
      stage: currentStage,
      ok: false,
      durationMs: Date.now() - stageStartMs,
      code: errorInfo.code,
      error: errorInfo.message,
    });
    outcome = "ERROR";
  }

  // Always write to All submissions — including ERROR rows so every validated
  // submission is on record regardless of pipeline failure.
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
    modelVersions: `test:${config.testModel.modelId}, judge:${config.judgeModel.modelId}`,
    errorDetail: errorInfo ? `${errorInfo.stage}:${errorInfo.code}` : "",
    deployment: process.env.VERCEL_URL ?? "local",
  });

  {
    const start = Date.now();
    try {
      await sheetsClient.append(config.sheetTabs.all, [row]);
      if (outcome === "PASS") {
        await sheetsClient.append(config.sheetTabs.passed, [row]);
      }
      logStage({ requestId, stage: "sheets_write", ok: true, durationMs: Date.now() - start });
    } catch (err) {
      const sheetsError = classifyError(err, "sheets_write");
      logStage({
        requestId,
        stage: "sheets_write",
        ok: false,
        durationMs: Date.now() - start,
        code: sheetsError.code,
        error: sheetsError.message,
      });
      // Sheets failure is logged server-side; outcome is not overridden.
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
    errorDetail: errorInfo ? `${errorInfo.stage}:${errorInfo.code}` : "",
    errorInfo,
  };
}
