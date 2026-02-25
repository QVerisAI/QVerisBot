import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../config/config.js";
import { getHistoryLimitFromSessionKey, limitHistoryTurns } from "./history.js";

const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 7;
const DEFAULT_MAX_RECENT_TURNS = 100;

type SessionEntryLike = {
  type?: unknown;
  timestamp?: unknown;
  message?: { timestamp?: unknown };
};

function normalizeTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
    const time = Date.parse(value);
    if (!Number.isNaN(time)) {
      return time;
    }
  }
  return undefined;
}

function parseEntryTimestampMs(entry: SessionEntryLike | undefined): number | undefined {
  if (!entry) {
    return undefined;
  }
  const fromEntry = normalizeTimestampMs(entry.timestamp);
  if (fromEntry !== undefined) {
    return fromEntry;
  }
  return normalizeTimestampMs(entry.message?.timestamp);
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function getMessageEntries(entries: unknown[] | undefined): SessionEntryLike[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  const result: SessionEntryLike[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const typed = entry as SessionEntryLike;
    if (typed.type !== "message" || !typed.message || typeof typed.message !== "object") {
      continue;
    }
    result.push(typed);
  }
  return result;
}

export function resolveTranscriptRetentionDays(config: OpenClawConfig | undefined): number {
  return (
    toPositiveInt(config?.session?.transcriptRetentionDays) ?? DEFAULT_TRANSCRIPT_RETENTION_DAYS
  );
}

export function resolveMaxRecentTurns(params: {
  config: OpenClawConfig | undefined;
  sessionKey: string | undefined;
}): number {
  const channelLimit = toPositiveInt(
    getHistoryLimitFromSessionKey(params.sessionKey, params.config),
  );
  if (channelLimit !== undefined) {
    return channelLimit;
  }
  return toPositiveInt(params.config?.session?.maxRecentTurns) ?? DEFAULT_MAX_RECENT_TURNS;
}

export function filterContextByRetentionAndTurns(params: {
  messages: AgentMessage[];
  entries?: unknown[];
  config: OpenClawConfig | undefined;
  sessionKey: string | undefined;
  nowMs?: number;
}): AgentMessage[] {
  const { messages } = params;
  if (messages.length === 0) {
    return messages;
  }

  const retentionDays = resolveTranscriptRetentionDays(params.config);
  const maxTurns = resolveMaxRecentTurns({
    config: params.config,
    sessionKey: params.sessionKey,
  });

  const cutoffMs = (params.nowMs ?? Date.now()) - retentionDays * 24 * 60 * 60 * 1000;
  const messageEntries = getMessageEntries(params.entries);

  const filteredByTime: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const entryTs = parseEntryTimestampMs(messageEntries[i]);
    const messageTs = normalizeTimestampMs((messages[i] as { timestamp?: unknown }).timestamp);
    const ts = entryTs ?? messageTs;
    if (ts === undefined || ts >= cutoffMs) {
      filteredByTime.push(messages[i]);
    }
  }

  return limitHistoryTurns(filteredByTime, maxTurns);
}
