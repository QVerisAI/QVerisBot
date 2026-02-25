import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import {
  filterContextByRetentionAndTurns,
  resolveMaxRecentTurns,
  resolveTranscriptRetentionDays,
} from "./context-filter.js";

function userMessage(text: string, timestamp?: number): AgentMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp,
  } as AgentMessage;
}

function assistantMessage(text: string, timestamp?: number): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp,
  } as AgentMessage;
}

function textOf(message: AgentMessage): string | undefined {
  if (!("content" in message)) {
    return undefined;
  }
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  const first = content[0];
  return first?.type === "text" ? first.text : undefined;
}

function messageEntries(
  messages: AgentMessage[],
  timestamps: Array<number | undefined>,
): unknown[] {
  return messages.map((message, idx) => ({
    type: "message",
    timestamp: timestamps[idx] !== undefined ? new Date(timestamps[idx]).toISOString() : undefined,
    message,
  }));
}

describe("context-filter", () => {
  it("uses default transcript retention days (7)", () => {
    expect(resolveTranscriptRetentionDays(undefined)).toBe(7);
  });

  it("uses session maxRecentTurns default (100) when channel limit is unset", () => {
    const maxTurns = resolveMaxRecentTurns({
      config: {
        session: {},
      } satisfies OpenClawConfig,
      sessionKey: "unknown:dm:user",
    });
    expect(maxTurns).toBe(100);
  });

  it("filters out entries older than retention window", () => {
    const now = Date.UTC(2026, 1, 25, 0, 0, 0);
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;

    const messages = [
      userMessage("old-user"),
      assistantMessage("old-assistant"),
      userMessage("recent-user"),
      assistantMessage("recent-assistant"),
      userMessage("latest-user"),
      assistantMessage("latest-assistant"),
    ];

    const entries = messageEntries(messages, [
      tenDaysAgo,
      tenDaysAgo,
      oneDayAgo,
      oneDayAgo,
      twoHoursAgo,
      twoHoursAgo,
    ]);

    const filtered = filterContextByRetentionAndTurns({
      messages,
      entries,
      nowMs: now,
      sessionKey: "telegram:dm:alice",
      config: {
        session: {
          transcriptRetentionDays: 7,
          maxRecentTurns: 100,
        },
      } satisfies OpenClawConfig,
    });

    expect(filtered.map((msg) => textOf(msg))).toEqual([
      "recent-user",
      "recent-assistant",
      "latest-user",
      "latest-assistant",
    ]);
  });

  it("applies channel historyLimit before session maxRecentTurns", () => {
    const now = Date.UTC(2026, 1, 25, 0, 0, 0);
    const oneHourAgo = now - 60 * 60 * 1000;

    const messages = [
      userMessage("u1"),
      assistantMessage("a1"),
      userMessage("u2"),
      assistantMessage("a2"),
      userMessage("u3"),
      assistantMessage("a3"),
    ];
    const entries = messageEntries(messages, [
      oneHourAgo,
      oneHourAgo,
      oneHourAgo,
      oneHourAgo,
      oneHourAgo,
      oneHourAgo,
    ]);

    const filtered = filterContextByRetentionAndTurns({
      messages,
      entries,
      nowMs: now,
      sessionKey: "telegram:dm:alice",
      config: {
        session: {
          transcriptRetentionDays: 7,
          maxRecentTurns: 100,
        },
        channels: {
          telegram: {
            dmHistoryLimit: 2,
          },
        },
      } satisfies OpenClawConfig,
    });

    expect(filtered.map((msg) => textOf(msg))).toEqual(["u2", "a2", "u3", "a3"]);
  });

  it("keeps entries without timestamps for backward compatibility", () => {
    const now = Date.UTC(2026, 1, 25, 0, 0, 0);
    const oneHourAgo = now - 60 * 60 * 1000;

    const messages = [
      userMessage("old-without-ts"),
      assistantMessage("old-assistant-without-ts"),
      userMessage("recent-user"),
      assistantMessage("recent-assistant"),
    ];
    const entries = messageEntries(messages, [undefined, undefined, oneHourAgo, oneHourAgo]);

    const filtered = filterContextByRetentionAndTurns({
      messages,
      entries,
      nowMs: now,
      sessionKey: "telegram:dm:alice",
      config: {
        session: {
          transcriptRetentionDays: 7,
          maxRecentTurns: 100,
        },
      } satisfies OpenClawConfig,
    });

    expect(filtered.map((msg) => textOf(msg))).toEqual([
      "old-without-ts",
      "old-assistant-without-ts",
      "recent-user",
      "recent-assistant",
    ]);
  });
});
