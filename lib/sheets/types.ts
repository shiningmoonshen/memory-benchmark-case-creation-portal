export interface SheetsClient {
  append(tab: string, rows: string[][]): Promise<void>;
  getRows(tab: string): Promise<string[][]>;
}
