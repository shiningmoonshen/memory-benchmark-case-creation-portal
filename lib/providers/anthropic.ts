import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { LLMProvider } from "./types";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    if (!user.trim()) {
      throw new Error("invalid_request_error: user message content is empty");
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.client.messages.create(
        {
          model: config.testModel.modelId,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          ...(config.testModel.supportsTemperature ? { temperature: 0 } : {}),
        },
        { signal: controller.signal, timeout: timeoutMs }
      );
      const block = response.content[0];
      if (!block || block.type !== "text") throw new Error("unexpected content type from Anthropic");
      return block.text;
    } catch (err) {
      const elapsedMs = Date.now() - start;
      if (controller.signal.aborted) {
        throw new Error(`provider timeout after ${elapsedMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
