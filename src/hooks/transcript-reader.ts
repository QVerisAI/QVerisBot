/**
 * Shared transcript parsing utilities for memory management hooks.
 *
 * Provides safe, token-aware parsing of JSONL session transcripts
 * and cross-session collection with configurable time windows.
 */

import fs from "node:fs/promises";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { hasInterSessionUserProvenance } from "../sessions/input-provenance.js";

const log = createSubsystemLogger("hooks/transcript-reader");

const DEFAULT_MAX_BYTES = 50_000;

export type ParsedMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
};

export type SessionTranscriptSummary = {
  sessionKey: string;
  sessionId: string;
  updatedAt: number;
  messages: ParsedMessage[];
};

/**
 * Parse a JSONL session transcript into user/assistant messages.
 *
 * - Skips system messages and `/` commands.
 * - Filters out inter-session provenance entries.
 * - Respects maxBytes to avoid reading huge transcripts into memory.
 * - Returns messages in chronological order; caller slices as needed.
 */
export async function parseTranscriptMessages(
  filePath: string,
  options?: { maxMessages?: number; maxBytes?: number },
): Promise<ParsedMessage[]> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxMessages = options?.maxMessages;

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const content = raw.length > maxBytes ? raw.slice(0, maxBytes) : raw;
    const lines = content.trim().split("\n");
    const messages: ParsedMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "message" || !entry.message) {
          continue;
        }

        const msg = entry.message;
        const role = msg.role;
        if (role !== "user" && role !== "assistant") {
          continue;
        }
        if (role === "user" && hasInterSessionUserProvenance(msg)) {
          continue;
        }

        const text = Array.isArray(msg.content)
          ? // oxlint-disable-next-line typescript/no-explicit-any
            msg.content.find((c: any) => c.type === "text")?.text
          : msg.content;
        if (!text || text.startsWith("/")) {
          continue;
        }

        let timestamp: number | undefined;
        if (entry.timestamp) {
          const ts =
            typeof entry.timestamp === "number"
              ? entry.timestamp
              : new Date(entry.timestamp).getTime();
          if (Number.isFinite(ts)) {
            timestamp = ts;
          }
        }

        messages.push({ role: role as "user" | "assistant", text, timestamp });
      } catch {
        // skip malformed lines
      }
    }

    if (maxMessages && messages.length > maxMessages) {
      return messages.slice(-maxMessages);
    }
    return messages;
  } catch {
    return [];
  }
}

type SessionStoreEntry = {
  sessionId?: string;
  updatedAt?: number;
  sessionFile?: string;
};

async function loadSessionStoreAsync(
  storePath: string,
): Promise<Record<string, SessionStoreEntry>> {
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, SessionStoreEntry>;
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Collect recent session transcripts within a time window.
 *
 * - Reads sessions.json and filters by updatedAt within `days` of `now`.
 * - Reads transcripts newest-first; stops when maxTotalChars budget exhausted.
 * - Returns a Map keyed by sessionKey.
 */
export async function collectRecentSessionTranscripts(params: {
  storePath: string;
  days: number;
  now: Date;
  maxMessagesPerSession?: number;
  maxTotalChars?: number;
}): Promise<Map<string, SessionTranscriptSummary>> {
  const { storePath, days, now } = params;
  const maxMessagesPerSession = params.maxMessagesPerSession ?? 20;
  const maxTotalChars = params.maxTotalChars ?? 24_000;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  const store = await loadSessionStoreAsync(storePath);
  const result = new Map<string, SessionTranscriptSummary>();

  // Sort entries by updatedAt descending (newest first)
  const entries = Object.entries(store)
    .filter(([, entry]) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if (!entry.updatedAt || entry.updatedAt < cutoff) {
        return false;
      }
      if (!entry.sessionFile) {
        return false;
      }
      return true;
    })
    .toSorted(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  let totalChars = 0;

  for (const [sessionKey, entry] of entries) {
    if (totalChars >= maxTotalChars) {
      log.debug("Reached maxTotalChars budget, stopping transcript collection", {
        totalChars,
        maxTotalChars,
        collected: result.size,
      });
      break;
    }

    const sessionFile = entry.sessionFile!;
    try {
      await fs.access(sessionFile);
    } catch {
      continue;
    }

    const messages = await parseTranscriptMessages(sessionFile, {
      maxMessages: maxMessagesPerSession,
    });

    if (messages.length === 0) {
      continue;
    }

    const sessionChars = messages.reduce((sum, m) => sum + m.text.length, 0);
    totalChars += sessionChars;

    result.set(sessionKey, {
      sessionKey,
      sessionId: entry.sessionId ?? "unknown",
      updatedAt: entry.updatedAt ?? 0,
      messages,
    });
  }

  log.debug("Collected recent session transcripts", {
    sessions: result.size,
    totalChars,
    days,
  });

  return result;
}
