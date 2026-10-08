export interface LLMProvider {
  complete(opts: {
    system: string;
    user: string;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<string>;
}
