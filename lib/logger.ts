export interface LogEntry {
  requestId: string;
  stage: string;
  ok: boolean;
  durationMs: number;
  code?: string;
  error?: string;
}

export function logStage(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}
