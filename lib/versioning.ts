import { randomUUID } from "crypto";
import { config } from "./config";
import type { SheetsClient } from "./sheets/types";

export interface VersionInfo {
  submissionId: string;
  caseId: string;
  version: number;
}

export async function resolveVersion(
  parentSubmissionId: string | undefined,
  sheetsClient: SheetsClient
): Promise<VersionInfo> {
  const submissionId = randomUUID();

  if (!parentSubmissionId) {
    return { submissionId, caseId: randomUUID(), version: 1 };
  }

  try {
    const rows = await sheetsClient.getRows(config.sheetTabs.all);
    // Column 0 = Submission ID, 1 = Case ID, 2 = Version
    const parentRow = rows.find((row) => row[0] === parentSubmissionId);

    if (!parentRow) {
      return { submissionId, caseId: randomUUID(), version: 1 };
    }

    const parentCaseId = parentRow[1];
    const parentVersion = parseInt(parentRow[2], 10);
    const version = Number.isNaN(parentVersion) ? 1 : parentVersion + 1;

    return { submissionId, caseId: parentCaseId, version };
  } catch {
    return { submissionId, caseId: randomUUID(), version: 1 };
  }
}
