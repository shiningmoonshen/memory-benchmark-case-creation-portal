import { describe, it, expect } from "vitest";
import { resolveVersion } from "../../lib/versioning";
import { FakeSheetsClient } from "../../lib/sheets/fakeClient";

describe("resolveVersion", () => {
  it("no parentSubmissionId → new submissionId, new caseId, version 1", async () => {
    const client = new FakeSheetsClient();
    const result = await resolveVersion(undefined, client);
    expect(result.version).toBe(1);
    expect(result.submissionId).toBeTruthy();
    expect(result.caseId).toBeTruthy();
    expect(typeof result.submissionId).toBe("string");
    expect(typeof result.caseId).toBe("string");
  });

  it("each call without a parent generates a unique submissionId", async () => {
    const client = new FakeSheetsClient();
    const a = await resolveVersion(undefined, client);
    const b = await resolveVersion(undefined, client);
    expect(a.submissionId).not.toBe(b.submissionId);
    expect(a.caseId).not.toBe(b.caseId);
  });

  it("parent found → inherits caseId, increments version", async () => {
    const client = new FakeSheetsClient();
    // Row layout: [submissionId, caseId, version, ...]
    await client.append("All submissions", [
      ["sub-parent-1", "case-abc-123", "1", "", "bunny"],
    ]);

    const result = await resolveVersion("sub-parent-1", client);
    expect(result.caseId).toBe("case-abc-123");
    expect(result.version).toBe(2);
    expect(result.submissionId).not.toBe("sub-parent-1");
  });

  it("parent with version 3 → version 4", async () => {
    const client = new FakeSheetsClient();
    await client.append("All submissions", [
      ["sub-parent-2", "case-xyz-456", "3", "", "raccoon"],
    ]);

    const result = await resolveVersion("sub-parent-2", client);
    expect(result.version).toBe(4);
    expect(result.caseId).toBe("case-xyz-456");
  });

  it("parent not found → new caseId, version 1", async () => {
    const client = new FakeSheetsClient();
    // Sheet has rows, but none matching the given parent
    await client.append("All submissions", [
      ["different-sub", "case-other", "2", "", "bear"],
    ]);

    const result = await resolveVersion("non-existent-parent", client);
    expect(result.version).toBe(1);
    expect(result.caseId).not.toBe("case-other");
  });

  it("empty sheet with parentSubmissionId → treats as new case", async () => {
    const client = new FakeSheetsClient();
    const result = await resolveVersion("some-parent-id", client);
    expect(result.version).toBe(1);
    expect(result.caseId).toBeTruthy();
  });
});
