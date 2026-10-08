import type { SheetsClient } from "./types";

export class FakeSheetsClient implements SheetsClient {
  private data = new Map<string, string[][]>();

  async append(tab: string, rows: string[][]): Promise<void> {
    const existing = this.data.get(tab) ?? [];
    this.data.set(tab, [...existing, ...rows]);
  }

  async getRows(tab: string): Promise<string[][]> {
    return this.data.get(tab) ?? [];
  }

  /** Synchronous helper for assertions in tests */
  getAllRows(tab: string): string[][] {
    return this.data.get(tab) ?? [];
  }
}
