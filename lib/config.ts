export const config = {
  testModel: {
    provider: "anthropic" as const,
    modelId: "claude-sonnet-5-5",
    supportsTemperature: false,
  },
  judgeModel: {
    provider: "openai" as const,
    modelId: "gpt-6.1-sol",
    supportsTemperature: false,
  },
  runs: 3,
  passThreshold: 2,
  maxMemoryChars: 40_000,
  maxOutputTokens: 1024,
  judgeMaxOutputTokens: 512,
  callTimeoutMs: 45_000,
  sheetTabs: {
    all: "All submissions",
    passed: "Passed",
  },
  characters: [
    { id: "bunny", name: "Bunny", emoji: "🐰" },
    { id: "raccoon", name: "Raccoon", emoji: "🦝" },
    { id: "beaver", name: "Beaver", emoji: "🦫" },
    { id: "bear", name: "Bear", emoji: "🐻" },
  ],
} as const;

export type CharacterId = (typeof config.characters)[number]["id"];
