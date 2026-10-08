import { describe, it, expect } from "vitest";
import { config } from "../../lib/config";

describe("config", () => {
  it("callTimeoutMs is at least 30 seconds", () => {
    expect(config.callTimeoutMs).toBeGreaterThanOrEqual(30_000);
  });

  it("maxDuration in submit route covers two pipeline stages plus headroom", () => {
    // Two stages (runs + judge), each capped at callTimeoutMs.
    // maxDuration (seconds) must exceed 2 × callTimeoutMs (ms) / 1000.
    const minFunctionSeconds = (2 * config.callTimeoutMs) / 1000;
    // We can't import the route's maxDuration here, so we assert the config
    // alone provides enough headroom when maxDuration = 120.
    expect(minFunctionSeconds).toBeLessThan(120);
  });

  it("passThreshold is less than runs", () => {
    expect(config.passThreshold).toBeLessThan(config.runs);
  });

  it("maxMemoryChars is 40000", () => {
    expect(config.maxMemoryChars).toBe(40_000);
  });
});
