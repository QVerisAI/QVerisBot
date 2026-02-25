import { loadSessionStore } from "../../config/sessions.js";
import { readSessionTitleFieldsFromTranscript } from "../../gateway/session-utils.fs.js";
import type { SessionStoreTarget } from "../session-store-targets.js";
import { forceRedactText } from "./redact-files.js";

export type SessionSummaryEntry = {
  sessionKey: string;
  agentId: string;
  sessionId: string;
  updatedAt: number;
  firstUserMessage: string | null;
  lastMessagePreview: string | null;
};

/**
 * Build session summaries for a single session store target.
 * Returns the most recent `maxSessions` sessions, sorted by updatedAt desc.
 * All message text is redacted of secrets before inclusion.
 */
export function buildSessionSummaries(
  target: SessionStoreTarget,
  maxSessions: number,
): SessionSummaryEntry[] {
  let store: Record<string, { sessionId: string; updatedAt: number; sessionFile?: string }>;
  try {
    store = loadSessionStore(target.storePath);
  } catch {
    return [];
  }

  const entries = Object.entries(store)
    .filter(([, entry]) => Boolean(entry?.sessionId))
    .toSorted(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, Math.max(1, maxSessions));

  return entries.map(([sessionKey, entry]) => {
    const fields = readSessionTitleFieldsFromTranscript(
      entry.sessionId,
      target.storePath,
      entry.sessionFile,
      target.agentId,
    );

    const rawFirst = fields.firstUserMessage;
    const rawLast = fields.lastMessagePreview;

    return {
      sessionKey,
      agentId: target.agentId,
      sessionId: entry.sessionId,
      updatedAt: entry.updatedAt ?? 0,
      firstUserMessage: rawFirst ? forceRedactText(rawFirst).text : null,
      lastMessagePreview: rawLast ? forceRedactText(rawLast).text : null,
    };
  });
}

/**
 * Build a markdown summary of sessions for inclusion in the bundle README.
 */
export function formatSessionSummariesMarkdown(
  summaries: SessionSummaryEntry[],
  agentId: string,
): string {
  if (summaries.length === 0) {
    return `## Sessions (${agentId})\n\nNo sessions found.\n`;
  }
  const lines: string[] = [`## Sessions (${agentId}) — ${summaries.length} entries\n`];
  for (const s of summaries) {
    const date = s.updatedAt
      ? new Date(s.updatedAt).toISOString().replace("T", " ").slice(0, 16)
      : "unknown";
    const first = s.firstUserMessage ? s.firstUserMessage.slice(0, 120) : "(no message)";
    lines.push(`- \`${s.sessionKey}\` | ${date} | ${first}`);
  }
  return lines.join("\n") + "\n";
}
