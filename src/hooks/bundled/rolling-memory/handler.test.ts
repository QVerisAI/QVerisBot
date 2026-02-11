import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../../../test-helpers/workspace.js";
import { createHookEvent } from "../../hooks.js";
import handler from "./handler.js";
import { parseTranscriptMessages, collectRecentMessages, buildRollingMarkdown } from "./handler.js";

// -- helpers ----------------------------------------------------------------

/** Build a JSONL transcript line for a user/assistant message. */
function msgLine(role: string, content: string, timestamp?: number): string {
  const entry: Record<string, unknown> = {
    type: "message",
    message: { role, content },
  };
  if (timestamp !== undefined) {
    entry.timestamp = timestamp;
  }
  return JSON.stringify(entry);
}

/** Build a non-message JSONL line (tool call etc). */
function toolLine(tool: string): string {
  return JSON.stringify({ type: "tool_use", tool });
}

/** Create a mock sessions.json with the given entries. */
async function writeSessionsJson(dir: string, entries: Record<string, unknown>): Promise<string> {
  const storePath = path.join(dir, "sessions.json");
  await fs.writeFile(storePath, JSON.stringify(entries), "utf-8");
  return storePath;
}

/** Helper: create a temp workspace with sessions dir + transcript. */
async function setupWorkspaceWithSessions(params: {
  /** Map of sessionKey -> { updatedAt, messages } */
  sessions: Array<{
    key: string;
    updatedAt: number;
    messages: Array<{ role: string; content: string; timestamp?: number }>;
  }>;
}): Promise<{
  tempDir: string;
  storePath: string;
  sessionsDir: string;
}> {
  const tempDir = await makeTempWorkspace("openclaw-rolling-memory-");
  const sessionsDir = path.join(tempDir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });

  const storeEntries: Record<string, unknown> = {};

  for (const sess of params.sessions) {
    const sessionId = `session-${sess.key.replace(/[^a-z0-9]/g, "-")}`;
    const sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);

    // Write transcript
    const lines = sess.messages.map((m) => msgLine(m.role, m.content, m.timestamp));
    await fs.writeFile(sessionFile, lines.join("\n"), "utf-8");

    storeEntries[sess.key] = {
      sessionId,
      updatedAt: sess.updatedAt,
      sessionFile,
    };
  }

  const storePath = await writeSessionsJson(sessionsDir, storeEntries);
  return { tempDir, storePath, sessionsDir };
}

// -- unit tests: parseTranscriptMessages ------------------------------------

describe("parseTranscriptMessages", () => {
  it("parses user and assistant messages from JSONL", async () => {
    const tempDir = await makeTempWorkspace("openclaw-parse-");
    const filePath = path.join(tempDir, "test.jsonl");
    const content = [
      msgLine("user", "Hello"),
      msgLine("assistant", "Hi there"),
      msgLine("user", "How are you?"),
    ].join("\n");
    await fs.writeFile(filePath, content, "utf-8");

    const messages = await parseTranscriptMessages(filePath, "2026-02-10");
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({
      role: "user",
      text: "Hello",
      date: "2026-02-10",
    });
  });

  it("skips tool entries and command messages", async () => {
    const tempDir = await makeTempWorkspace("openclaw-parse-");
    const filePath = path.join(tempDir, "test.jsonl");
    const content = [
      msgLine("user", "/help"),
      toolLine("search"),
      msgLine("assistant", "Result"),
      msgLine("user", "Thanks"),
    ].join("\n");
    await fs.writeFile(filePath, content, "utf-8");

    const messages = await parseTranscriptMessages(filePath, "2026-02-10");
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe("Result");
    expect(messages[1].text).toBe("Thanks");
  });

  it("uses entry timestamp when available", async () => {
    const tempDir = await makeTempWorkspace("openclaw-parse-");
    const filePath = path.join(tempDir, "test.jsonl");
    const ts = new Date("2026-02-09T15:00:00Z").getTime();
    const content = msgLine("user", "Hello", ts);
    await fs.writeFile(filePath, content, "utf-8");

    const messages = await parseTranscriptMessages(filePath, "2026-02-10");
    expect(messages[0].date).toBe("2026-02-09");
  });

  it("returns empty array for missing file", async () => {
    const messages = await parseTranscriptMessages(
      "/tmp/nonexistent-file-abc123.jsonl",
      "2026-02-10",
    );
    expect(messages).toEqual([]);
  });

  it("returns empty array for empty file", async () => {
    const tempDir = await makeTempWorkspace("openclaw-parse-");
    const filePath = path.join(tempDir, "empty.jsonl");
    await fs.writeFile(filePath, "", "utf-8");

    const messages = await parseTranscriptMessages(filePath, "2026-02-10");
    expect(messages).toEqual([]);
  });
});

// -- unit tests: collectRecentMessages --------------------------------------

describe("collectRecentMessages", () => {
  it("collects messages from sessions within the retention window", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const day10 = new Date("2026-02-10T10:00:00Z").getTime();
    const day09 = new Date("2026-02-09T10:00:00Z").getTime();

    const { storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "agent:main:feishu:group:oc_abc",
          updatedAt: day10,
          messages: [{ role: "user", content: "Feb 10 message", timestamp: day10 }],
        },
        {
          key: "agent:main:feishu:group:oc_def",
          updatedAt: day09,
          messages: [{ role: "user", content: "Feb 09 message", timestamp: day09 }],
        },
      ],
    });

    const byDate = await collectRecentMessages({
      storePath,
      days: 7,
      now,
    });

    expect(byDate.size).toBe(2);
    expect(byDate.get("2026-02-10")).toHaveLength(1);
    expect(byDate.get("2026-02-09")).toHaveLength(1);
  });

  it("excludes sessions older than retention window", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const recent = new Date("2026-02-10T10:00:00Z").getTime();
    const old = new Date("2026-01-01T10:00:00Z").getTime(); // >7 days ago

    const { storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "recent-session",
          updatedAt: recent,
          messages: [{ role: "user", content: "Recent msg", timestamp: recent }],
        },
        {
          key: "old-session",
          updatedAt: old,
          messages: [{ role: "user", content: "Old msg", timestamp: old }],
        },
      ],
    });

    const byDate = await collectRecentMessages({
      storePath,
      days: 7,
      now,
    });

    expect(byDate.size).toBe(1);
    expect(byDate.has("2026-02-10")).toBe(true);
    expect(byDate.has("2026-01-01")).toBe(false);
  });

  it("handles missing sessions.json gracefully", async () => {
    const byDate = await collectRecentMessages({
      storePath: "/tmp/nonexistent-sessions-abc123.json",
      days: 7,
      now: new Date(),
    });
    expect(byDate.size).toBe(0);
  });

  it("handles sessions with missing transcript files", async () => {
    const tempDir = await makeTempWorkspace("openclaw-rolling-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const storePath = await writeSessionsJson(sessionsDir, {
      "missing-file": {
        sessionId: "missing",
        updatedAt: Date.now(),
        sessionFile: "/tmp/nonexistent-transcript.jsonl",
      },
    });

    const byDate = await collectRecentMessages({
      storePath,
      days: 7,
      now: new Date(),
    });
    expect(byDate.size).toBe(0);
  });

  it("collects messages across multiple sessions into same date bucket", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const sameDay = new Date("2026-02-10T10:00:00Z").getTime();

    const { storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "session-a",
          updatedAt: sameDay,
          messages: [{ role: "user", content: "Message A", timestamp: sameDay }],
        },
        {
          key: "session-b",
          updatedAt: sameDay + 3600_000,
          messages: [
            {
              role: "user",
              content: "Message B",
              timestamp: sameDay + 3600_000,
            },
          ],
        },
      ],
    });

    const byDate = await collectRecentMessages({
      storePath,
      days: 7,
      now,
    });

    // Both messages should be in the same date bucket
    expect(byDate.get("2026-02-10")?.length).toBe(2);
  });
});

// -- unit tests: buildRollingMarkdown ---------------------------------------

describe("buildRollingMarkdown", () => {
  it("generates markdown with dates sorted descending", () => {
    const byDate = new Map([
      ["2026-02-09", [{ role: "user", text: "Earlier message", date: "2026-02-09" }]],
      ["2026-02-10", [{ role: "user", text: "Later message", date: "2026-02-10" }]],
    ]);

    const md = buildRollingMarkdown({
      byDate,
      now: new Date("2026-02-11T12:00:00Z"),
    });

    expect(md).toContain("# Rolling 7-Day Context (auto-generated)");
    // 2026-02-10 should appear before 2026-02-09
    const idx10 = md.indexOf("## 2026-02-10");
    const idx09 = md.indexOf("## 2026-02-09");
    expect(idx10).toBeLessThan(idx09);
  });

  it("handles empty message map", () => {
    const md = buildRollingMarkdown({
      byDate: new Map(),
      now: new Date("2026-02-11T12:00:00Z"),
    });
    expect(md).toContain("No conversations in the last 7 days.");
  });

  it("truncates long messages", () => {
    const longText = "x".repeat(300);
    const byDate = new Map([
      ["2026-02-10", [{ role: "user", text: longText, date: "2026-02-10" }]],
    ]);

    const md = buildRollingMarkdown({
      byDate,
      now: new Date("2026-02-11T12:00:00Z"),
    });

    expect(md).toContain("...");
    // Should not contain the full 300-char string
    expect(md).not.toContain(longText);
  });
});

// -- integration tests: full handler ----------------------------------------

describe("rolling-memory handler (integration)", () => {
  it("skips non-matching events", async () => {
    const tempDir = await makeTempWorkspace("openclaw-rolling-");
    const event = createHookEvent("agent", "bootstrap", "agent:main:main", {
      workspaceDir: tempDir,
    });
    await handler(event);

    const memoryDir = path.join(tempDir, "memory");
    await expect(fs.access(memoryDir)).rejects.toThrow();
  });

  it("creates rolling-7d.md on command:new", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    const { tempDir, storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "agent:main:feishu:group:oc_abc",
          updatedAt: day10,
          messages: [
            { role: "user", content: "Hello from Feb 10", timestamp: day10 },
            {
              role: "assistant",
              content: "Hi! How can I help?",
              timestamp: day10 + 1000,
            },
          ],
        },
      ],
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    // Override timestamp
    (event as any).timestamp = now;

    await handler(event);

    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const content = await fs.readFile(rollingFile, "utf-8");
    expect(content).toContain("# Rolling 7-Day Context (auto-generated)");
    expect(content).toContain("## 2026-02-10");
    expect(content).toContain("Hello from Feb 10");
  });

  it("creates rolling-7d.md on session:end", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    const { tempDir, storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "agent:main:main",
          updatedAt: day10,
          messages: [{ role: "user", content: "Session end test", timestamp: day10 }],
        },
      ],
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("session", "end", "agent:main:main", {
      cfg,
      storePath,
    });
    (event as any).timestamp = now;

    await handler(event);

    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const content = await fs.readFile(rollingFile, "utf-8");
    expect(content).toContain("Session end test");
  });

  it("10-day simulation: only retains last 7 days", async () => {
    const now = new Date("2026-02-11T12:00:00Z");

    // Create sessions for days 1-10 (Feb 01 through Feb 10)
    const sessions = [];
    for (let d = 1; d <= 10; d++) {
      const dateStr = `2026-02-${String(d).padStart(2, "0")}`;
      const ts = new Date(`${dateStr}T10:00:00Z`).getTime();
      sessions.push({
        key: `session-day-${d}`,
        updatedAt: ts,
        messages: [{ role: "user" as const, content: `Day ${d} message`, timestamp: ts }],
      });
    }

    const { tempDir, storePath } = await setupWorkspaceWithSessions({
      sessions,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    (event as any).timestamp = now;

    await handler(event);

    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const content = await fs.readFile(rollingFile, "utf-8");

    // Days 5-10 should be present (within 7 days of Feb 11)
    expect(content).toContain("Day 5 message");
    expect(content).toContain("Day 6 message");
    expect(content).toContain("Day 7 message");
    expect(content).toContain("Day 8 message");
    expect(content).toContain("Day 9 message");
    expect(content).toContain("Day 10 message");

    // Days 1-3 should NOT be present (older than 7 days from Feb 11)
    expect(content).not.toContain("Day 1 message");
    expect(content).not.toContain("Day 2 message");
    expect(content).not.toContain("Day 3 message");
  });

  it("handles empty sessions.json", async () => {
    const tempDir = await makeTempWorkspace("openclaw-rolling-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const storePath = await writeSessionsJson(sessionsDir, {});
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });

    await handler(event);

    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const content = await fs.readFile(rollingFile, "utf-8");
    expect(content).toContain("No conversations in the last 7 days.");
  });

  it("respects custom days config", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const day01 = new Date("2026-02-01T10:00:00Z").getTime(); // 10 days ago

    const { tempDir, storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "old-session",
          updatedAt: day01,
          messages: [{ role: "user", content: "Feb 01 message", timestamp: day01 }],
        },
      ],
    });

    // Configure 14 days retention
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
      hooks: {
        internal: {
          entries: {
            "rolling-memory": { enabled: true, days: 14 },
          },
        },
      },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    (event as any).timestamp = now;

    await handler(event);

    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const content = await fs.readFile(rollingFile, "utf-8");
    // With 14-day retention, Feb 01 should be included
    expect(content).toContain("Feb 01 message");
  });

  it("overwrites existing rolling-7d.md", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    const { tempDir, storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "session-1",
          updatedAt: day10,
          messages: [{ role: "user", content: "New content", timestamp: day10 }],
        },
      ],
    });

    // Pre-create an existing rolling-7d.md
    const memoryDir = path.join(tempDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(path.join(memoryDir, "rolling-7d.md"), "OLD CONTENT", "utf-8");

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    (event as any).timestamp = now;

    await handler(event);

    const content = await fs.readFile(path.join(memoryDir, "rolling-7d.md"), "utf-8");
    expect(content).not.toContain("OLD CONTENT");
    expect(content).toContain("New content");
  });

  it("handles very long transcripts (truncation)", async () => {
    const now = new Date("2026-02-11T12:00:00Z");
    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    // Create a session with many messages
    const messages = [];
    for (let i = 0; i < 100; i++) {
      messages.push({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message number ${i}: ${"x".repeat(200)}`,
        timestamp: day10 + i * 1000,
      });
    }

    const { tempDir, storePath } = await setupWorkspaceWithSessions({
      sessions: [
        {
          key: "long-session",
          updatedAt: day10,
          messages,
        },
      ],
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    (event as any).timestamp = now;

    // Should not throw
    await handler(event);

    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const content = await fs.readFile(rollingFile, "utf-8");
    expect(content).toContain("## 2026-02-10");
  });
});
