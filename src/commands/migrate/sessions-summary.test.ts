import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionSummaries, formatSessionSummariesMarkdown } from "./sessions-summary.js";

// Prevent real config reads
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({}),
}));

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qvb-sessions-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  vi.restoreAllMocks();
});

async function createSessionStore(
  storePath: string,
  entries: Record<string, { sessionId: string; updatedAt: number; sessionFile?: string }>,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(entries, null, 2), "utf-8");
}

describe("buildSessionSummaries", () => {
  it("returns empty array when store does not exist", () => {
    const target = {
      agentId: "main",
      storePath: path.join(tempDir, "nonexistent", "sessions.json"),
    };
    const result = buildSessionSummaries(target, 10);
    expect(result).toEqual([]);
  });

  it("caps results at maxSessions", async () => {
    const storePath = path.join(tempDir, "agents", "main", "sessions", "sessions.json");
    const entries: Record<string, { sessionId: string; updatedAt: number }> = {};
    for (let i = 0; i < 50; i++) {
      entries[`key:${i}`] = { sessionId: `session-${i}`, updatedAt: Date.now() - i * 1000 };
    }
    await createSessionStore(storePath, entries);

    const target = { agentId: "main", storePath };
    const result = buildSessionSummaries(target, 10);
    expect(result.length).toBe(10);
  });

  it("sorts sessions by updatedAt descending", async () => {
    const storePath = path.join(tempDir, "agents", "main", "sessions", "sessions.json");
    const now = Date.now();
    await createSessionStore(storePath, {
      "key:old": { sessionId: "old-session", updatedAt: now - 10_000 },
      "key:new": { sessionId: "new-session", updatedAt: now },
    });

    const target = { agentId: "main", storePath };
    const result = buildSessionSummaries(target, 200);
    expect(result[0].sessionId).toBe("new-session");
    expect(result[1].sessionId).toBe("old-session");
  });

  it("caps at 200 sessions by default (maxSessions boundary check)", async () => {
    const storePath = path.join(tempDir, "agents", "main", "sessions", "sessions.json");
    const entries: Record<string, { sessionId: string; updatedAt: number }> = {};
    for (let i = 0; i < 250; i++) {
      entries[`key:${i}`] = { sessionId: `session-${i}`, updatedAt: Date.now() - i * 1000 };
    }
    await createSessionStore(storePath, entries);

    const target = { agentId: "main", storePath };
    const result = buildSessionSummaries(target, 200);
    expect(result.length).toBe(200);
  });

  it("redacts secrets in firstUserMessage", async () => {
    const storePath = path.join(tempDir, "agents", "main", "sessions", "sessions.json");
    await createSessionStore(storePath, {
      "key:1": { sessionId: "s1", updatedAt: Date.now() },
    });

    // Stub readSessionTitleFieldsFromTranscript to return a message with a token
    vi.doMock("../../gateway/session-utils.fs.js", () => ({
      readSessionTitleFieldsFromTranscript: vi.fn().mockReturnValue({
        firstUserMessage: "My token is ghp_abcdefghijklmnopqrstu12345 please help",
        lastMessagePreview: null,
      }),
    }));

    const { buildSessionSummaries: buildFresh } = await import("./sessions-summary.js");
    const target = { agentId: "main", storePath };
    const result = buildFresh(target, 10);
    if (result.length > 0 && result[0].firstUserMessage) {
      expect(result[0].firstUserMessage).not.toContain("ghp_abcdefghijklmnopqrstu12345");
    }
  });
});

describe("formatSessionSummariesMarkdown", () => {
  it("returns no-sessions message for empty summaries", () => {
    const output = formatSessionSummariesMarkdown([], "main");
    expect(output).toContain("No sessions found");
  });

  it("includes agent ID in heading", () => {
    const summaries = [
      {
        sessionKey: "k1",
        agentId: "main",
        sessionId: "s1",
        updatedAt: Date.now(),
        firstUserMessage: "Hello there",
        lastMessagePreview: null,
      },
    ];
    const output = formatSessionSummariesMarkdown(summaries, "main");
    expect(output).toContain("## Sessions (main)");
    expect(output).toContain("Hello there");
  });
});
