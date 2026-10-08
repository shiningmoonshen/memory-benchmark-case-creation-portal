import { google } from "googleapis";
import type { SheetsClient } from "./types";

export type { SheetsClient };

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const credentials = JSON.parse(json);
  // Handle escaped newlines in private_key (common when pasting into Vercel dashboard)
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status: number = err?.response?.status ?? err?.code ?? 0;
      const isRetryable = status === 429 || (status >= 500 && status < 600);
      if (isRetryable && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function createSheetsClient(): SheetsClient {
  const spreadsheetId = process.env.SHEET_ID;
  if (!spreadsheetId) throw new Error("SHEET_ID is not set");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  return {
    async append(tab: string, rows: string[][]): Promise<void> {
      await withRetry(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: tab,
          valueInputOption: "RAW",
          requestBody: { values: rows },
        })
      );
    },

    async getRows(tab: string): Promise<string[][]> {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: tab,
      });
      return (response.data.values ?? []) as string[][];
    },

    async ensureHeaders(tab: string, headers: string[]): Promise<void> {
      const rows = await this.getRows(tab);
      if (rows.length === 0) {
        await this.append(tab, [headers]);
      }
    },
  };
}
