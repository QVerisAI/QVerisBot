import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTempPaths,
  createContextEngineAttemptRunner,
  getHoisted,
  resetEmbeddedAttemptHarness,
} from "./attempt.spawn-workspace.test-support.js";

const hoisted = getHoisted();

describe("runEmbeddedAttempt undici timeout wiring", () => {
  const tempPaths: string[] = [];

  beforeEach(() => {
    resetEmbeddedAttemptHarness();
  });

  afterEach(async () => {
    await cleanupTempPaths(tempPaths);
  });

  it("forwards the configured run timeout into global undici stream tuning", async () => {
    await createContextEngineAttemptRunner({
      sessionKey: "agent:main:timeout-test",
      tempPaths,
      contextEngine: {
        assemble: async ({ messages }) => ({
          messages,
          estimatedTokens: 1,
        }),
      },
      sessionPrompt: async (session) => {
        session.messages = [
          ...session.messages,
          {
            role: "assistant",
            content: "done",
            timestamp: 2,
          },
        ];
      },
      attemptOverrides: {
        abortSignal: AbortSignal.abort(new Error("stop after timeout wiring")),
        timeoutMs: 1_234,
      },
    });

    expect(hoisted.ensureGlobalUndiciEnvProxyDispatcherMock).toHaveBeenCalledOnce();
    expect(hoisted.ensureGlobalUndiciStreamTimeoutsMock).toHaveBeenCalledWith({
      timeoutMs: 1_234,
    });
  });
});
