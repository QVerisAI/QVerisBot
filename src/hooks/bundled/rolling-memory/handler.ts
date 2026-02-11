/**
 * Rolling memory hook handler
 *
 * Maintains a rolling 7-day conversation summary in memory/rolling-7d.md.
 * Triggered on /new command and session:end events.
 *
 * Collects all session transcripts updated within the configured retention
 * window (default: 7 days), groups messages by date, and generates a
 * categorised summary that is overwritten each time.
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../../config/config.js";
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { HookHandler } from "../../hooks.js";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";

/** Default number of days to retain in the rolling summary. */
const DEFAULT_ROLLING_DAYS = 7;

/** Maximum characters of transcript to read per session (avoid blowing up memory). */
const MAX_TRANSCRIPT_CHARS = 50_000;

// -- helpers ----------------------------------------------------------------

type ParsedMessage = {
  role: string;
  text: string;
  /** ISO date string YYYY-MM-DD derived from the entry timestamp or session updatedAt. */
  date: string;
};

/**
 * Parse a JSONL transcript file into user/assistant messages.
 * Returns an empty array on any I/O or parse error.
 */
export async function parseTranscriptMessages(
  filePath: string,
  fallbackDate: string,
): Promise<ParsedMessage[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const content = raw.length > MAX_TRANSCRIPT_CHARS ? raw.slice(0, MAX_TRANSCRIPT_CHARS) : raw;
    const lines = content.trim().split("\n");
    const messages: ParsedMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "message" || !entry.message) continue;

        const msg = entry.message;
        const role = msg.role;
        if (role !== "user" && role !== "assistant") continue;

        const text = Array.isArray(msg.content)
          ? msg.content.find((c: any) => c.type === "text")?.text
          : msg.content;
        if (!text || text.startsWith("/")) continue;

        // Try to derive date from entry timestamp, fall back to session date
        let date = fallbackDate;
        if (entry.timestamp) {
          const ts =
            typeof entry.timestamp === "number"
              ? new Date(entry.timestamp)
              : new Date(entry.timestamp);
          if (!Number.isNaN(ts.getTime())) {
            date = ts.toISOString().split("T")[0];
          }
        }

        messages.push({ role, text, date });
      } catch {
        // skip malformed lines
      }
    }
    return messages;
  } catch {
    return [];
  }
}

/**
 * Resolve the sessions.json store path from context or fall back to defaults.
 */
function resolveStorePath(context: Record<string, unknown>): string | null {
  // The hook context may carry the storePath directly
  if (typeof context.storePath === "string") {
    return context.storePath;
  }
  // Fall back to the default location
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "agents", "main", "sessions", "sessions.json");
}

/**
 * Load sessions.json synchronously (simplified; avoids import coupling
 * to the cache layer).
 */
function loadSessionStoreSimple(storePath: string): Record<string, SessionEntry> {
  try {
    const raw = fsSync.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, SessionEntry>;
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Collect all session transcripts whose `updatedAt` falls within `days`
 * of `now`. Returns messages grouped by YYYY-MM-DD date string.
 */
export async function collectRecentMessages(params: {
  storePath: string;
  days: number;
  now: Date;
}): Promise<Map<string, ParsedMessage[]>> {
  const { storePath, days, now } = params;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const store = loadSessionStoreSimple(storePath);
  const byDate = new Map<string, ParsedMessage[]>();

  for (const [_key, entry] of Object.entries(store)) {
    if (!entry || typeof entry !== "object") continue;
    if (!entry.updatedAt || entry.updatedAt < cutoff) continue;

    // Resolve transcript file path
    const sessionFile = entry.sessionFile;
    if (!sessionFile) continue;

    try {
      await fs.access(sessionFile);
    } catch {
      continue; // transcript file missing
    }

    const fallbackDate = new Date(entry.updatedAt).toISOString().split("T")[0];
    const messages = await parseTranscriptMessages(sessionFile, fallbackDate);

    for (const msg of messages) {
      const bucket = byDate.get(msg.date) || [];
      bucket.push(msg);
      byDate.set(msg.date, bucket);
    }
  }

  return byDate;
}

/**
 * Build the rolling markdown summary from date-grouped messages.
 * Each date section contains a bullet per conversation turn (truncated).
 */
export function buildRollingMarkdown(params: {
  byDate: Map<string, ParsedMessage[]>;
  now: Date;
}): string {
  const { byDate, now } = params;
  const parts: string[] = [
    "# Rolling 7-Day Context (auto-generated)",
    `Last updated: ${now.toISOString()}`,
    "",
  ];

  // Sort dates descending (most recent first)
  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  if (sortedDates.length === 0) {
    parts.push("No conversations in the last 7 days.");
    parts.push("");
    return parts.join("\n");
  }

  for (const date of sortedDates) {
    parts.push(`## ${date}`);
    parts.push("");
    const messages = byDate.get(date) || [];

    // Show up to 50 messages per day, truncate long texts
    const shown = messages.slice(0, 50);
    for (const msg of shown) {
      const preview = msg.text.length > 200 ? msg.text.slice(0, 200) + "..." : msg.text;
      // Collapse newlines for bullet readability
      const oneLine = preview.replace(/\n+/g, " ").trim();
      parts.push(`- **${msg.role}**: ${oneLine}`);
    }
    if (messages.length > 50) {
      parts.push(`- *(${messages.length - 50} more messages omitted)*`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

// -- main handler -----------------------------------------------------------

/**
 * Rolling memory hook: collects recent session transcripts and writes
 * a rolling summary to memory/rolling-7d.md.
 */
const rollingMemoryHandler: HookHandler = async (event) => {
  // Trigger on command:new or session:end
  const isNew = event.type === "command" && event.action === "new";
  const isEnd = event.type === "session" && event.action === "end";
  if (!isNew && !isEnd) return;

  try {
    console.log("[rolling-memory] Hook triggered:", event.type, event.action);

    const context = event.context || {};
    const cfg = context.cfg as OpenClawConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(os.homedir(), ".openclaw", "workspace");

    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    // Resolve rolling days from hook config (default: 7)
    const hookConfig = resolveHookConfig(cfg, "rolling-memory");
    const days =
      typeof hookConfig?.days === "number" && hookConfig.days > 0
        ? hookConfig.days
        : DEFAULT_ROLLING_DAYS;

    // Resolve sessions.json path
    const storePath = resolveStorePath(context);
    if (!storePath) {
      console.log("[rolling-memory] Could not resolve sessions store path");
      return;
    }

    const now = new Date(event.timestamp);

    // Collect messages from all sessions within the retention window
    const byDate = await collectRecentMessages({ storePath, days, now });

    // Build and write the rolling summary
    const markdown = buildRollingMarkdown({ byDate, now });
    const rollingFile = path.join(memoryDir, "rolling-7d.md");
    await fs.writeFile(rollingFile, markdown, "utf-8");

    const relPath = rollingFile.replace(os.homedir(), "~");
    console.log(
      `[rolling-memory] Updated ${relPath} ` +
        `(${byDate.size} day(s), ${[...byDate.values()].reduce((s, m) => s + m.length, 0)} messages)`,
    );
  } catch (err) {
    console.error("[rolling-memory] Failed:", err instanceof Error ? err.message : String(err));
  }
};

export default rollingMemoryHandler;
