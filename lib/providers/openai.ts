import OpenAI from "openai";
import { config } from "../config";
import type { LLMProvider } from "./types";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async complete({
    system,
    user,
    maxTokens,
    timeoutMs,
  }: {
    system: string;
    user: string;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.client.responses.create(
        {
          model: config.judgeModel.modelId,
          instructions: system,
          input: user,
          reasoning: { effort: "low" },
          max_output_tokens: maxTokens,
          // temperature not sent — reasoning models do not support it
        },
        { signal: controller.signal }
      );
      return response.output_text;
    } finally {
      clearTimeout(timer);
    }
  }
}
