export interface SheetsClient {
  append(tab: string, rows: string[][]): Promise<void>;
  getRows(tab: string): Promise<string[][]>;
  /** Write headers as row 1 if the tab is completely empty. No-op otherwise. */
  ensureHeaders(tab: string, headers: string[]): Promise<void>;
}
