/**
 * Smart memory hook handler
 *
 * Automatically identifies important conversations (research, papers,
 * multi-step projects, decisions) and persists them as durable memory
 * files under memory/important/.
 *
 * Uses keyword-based heuristic classification for reliability and speed
 * (no LLM call required). Files in memory/important/ are never
 * automatically deleted, providing a permanent knowledge base.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../../config/config.js";
import type { HookHandler } from "../../hooks.js";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";

/** Default number of messages to analyse from the session. */
const DEFAULT_MESSAGE_COUNT = 30;

// -- classification ---------------------------------------------------------

export type ConversationCategory =
  | "research"
  | "paper"
  | "project"
  | "decision"
  | "remember"
  | "routine";

type CategoryRule = {
  category: ConversationCategory;
  /** At least one keyword must match (case-insensitive). */
  keywords: string[];
  /** Minimum number of keyword hits to trigger this category. */
  minHits: number;
};

/**
 * Classification rules ordered by priority.
 * The first category that meets its minHits threshold wins.
 * "remember" is checked first because explicit user intent overrides everything.
 */
const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "remember",
    keywords: [
      "remember",
      "do not forget",
      "dont forget",
      "save this",
      "important",
      "keep this",
      "memorize",
      "note this",
      "record this",
    ],
    minHits: 1,
  },
  {
    category: "research",
    keywords: [
      "experiment",
      "dataset",
      "methodology",
      "hypothesis",
      "conclusion",
      "literature",
      "citation",
      "findings",
      "analysis",
      "survey",
      "literature review",
      "thesis",
      "dissertation",
      "研究",
      "实验",
      "数据集",
      "方法论",
      "假设",
      "结论",
      "文献",
      "综述",
      "分析",
    ],
    minHits: 2,
  },
  {
    category: "paper",
    keywords: [
      "manuscript",
      "draft",
      "revision",
      "reviewer",
      "figure",
      "table",
      "section",
      "abstract",
      "submission",
      "rebuttal",
      "camera-ready",
      "稿件",
      "修改",
      "审稿",
      "图表",
      "投稿",
    ],
    minHits: 2,
  },
  {
    category: "project",
    keywords: [
      "milestone",
      "step",
      "progress",
      "next step",
      "todo",
      "deadline",
      "phase",
      "sprint",
      "implementation",
      "deploy",
      "release",
      "roadmap",
      "项目",
      "进度",
      "待完成",
      "下一步",
      "部署",
      "里程碑",
    ],
    minHits: 2,
  },
  {
    category: "decision",
    keywords: [
      "decision",
      "choose",
      "compare",
      "trade-off",
      "tradeoff",
      "architecture",
      "design",
      "versus",
      "option a",
      "option b",
      "pros and cons",
      "决策",
      "选择",
      "对比",
      "架构",
      "方案",
    ],
    minHits: 2,
  },
];

/**
 * Classify a conversation based on keyword frequency.
 * Returns the category and matched keywords.
 */
export function classifyConversation(text: string): {
  category: ConversationCategory;
  matchedKeywords: string[];
} {
  const lower = text.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    const matched: string[] = [];
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        matched.push(kw);
      }
    }
    if (matched.length >= rule.minHits) {
      return { category: rule.category, matchedKeywords: matched };
    }
  }

  return { category: "routine", matchedKeywords: [] };
}

// -- transcript parsing -----------------------------------------------------

type ParsedMessage = {
  role: string;
  text: string;
};

/**
 * Read recent messages from a session transcript (JSONL).
 */
async function getRecentSessionMessages(
  sessionFilePath: string,
  messageCount: number,
): Promise<ParsedMessage[]> {
  try {
    const content = await fs.readFile(sessionFilePath, "utf-8");
    const lines = content.trim().split("\n");
    const allMessages: ParsedMessage[] = [];

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

        allMessages.push({ role, text });
      } catch {
        // skip malformed lines
      }
    }

    return allMessages.slice(-messageCount);
  } catch {
    return [];
  }
}

// -- slug generation --------------------------------------------------------

/**
 * Generate a filename slug from conversation content (heuristic, no LLM).
 * Takes the first meaningful user message and derives a slug.
 */
export function generateSlug(messages: ParsedMessage[]): string {
  // Find the first user message with enough content
  const candidate = messages.find((m) => m.role === "user" && m.text.length > 10);
  if (!candidate) return "conversation";

  const slug = candidate.text
    .slice(0, 60)
    .toLowerCase()
    // Keep alphanumeric, CJK characters, and hyphens
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return slug || "conversation";
}

// -- markdown builder -------------------------------------------------------

/**
 * Build a persistent memory file for an important conversation.
 */
export function buildImportantMemoryMarkdown(params: {
  category: ConversationCategory;
  matchedKeywords: string[];
  messages: ParsedMessage[];
  date: string;
  sessionKey: string;
  sessionId: string;
}): string {
  const { category, matchedKeywords, messages, date, sessionKey, sessionId } = params;

  const slug = generateSlug(messages);
  const title = `${category} - ${slug}`;

  const parts: string[] = [
    `# Important: ${title}`,
    `Date: ${date}`,
    `Category: ${category}`,
    `Tags: ${matchedKeywords.join(", ")}`,
    `Session Key: ${sessionKey}`,
    `Session ID: ${sessionId}`,
    "",
    "## Conversation",
    "",
  ];

  // Include conversation content (truncated per message)
  for (const msg of messages) {
    const preview = msg.text.length > 500 ? msg.text.slice(0, 500) + "..." : msg.text;
    parts.push(`**${msg.role}**: ${preview}`);
    parts.push("");
  }

  return parts.join("\n");
}

// -- main handler -----------------------------------------------------------

/**
 * Smart memory hook: classifies the current conversation and persists
 * important ones to memory/important/.
 */
const smartMemoryHandler: HookHandler = async (event) => {
  // Only trigger on /new command
  if (event.type !== "command" || event.action !== "new") return;

  try {
    console.log("[smart-memory] Hook triggered for /new command");

    const context = event.context || {};
    const cfg = context.cfg as OpenClawConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(os.homedir(), ".openclaw", "workspace");

    // Get session transcript
    const sessionEntry = (context.previousSessionEntry || context.sessionEntry || {}) as Record<
      string,
      unknown
    >;
    const sessionFile = sessionEntry.sessionFile as string | undefined;
    const sessionId = (sessionEntry.sessionId as string) || "unknown";

    if (!sessionFile) {
      console.log("[smart-memory] No session file available, skipping");
      return;
    }

    // Read message count from hook config
    const hookConfig = resolveHookConfig(cfg, "smart-memory");
    const messageCount =
      typeof hookConfig?.messages === "number" && hookConfig.messages > 0
        ? hookConfig.messages
        : DEFAULT_MESSAGE_COUNT;

    // Read recent messages
    const messages = await getRecentSessionMessages(sessionFile, messageCount);
    if (messages.length === 0) {
      console.log("[smart-memory] No messages in session, skipping");
      return;
    }

    // Classify the conversation
    const fullText = messages.map((m) => m.text).join("\n");
    const { category, matchedKeywords } = classifyConversation(fullText);

    if (category === "routine") {
      console.log("[smart-memory] Conversation classified as routine, skipping");
      return;
    }

    console.log(
      `[smart-memory] Classified as ${category} ` + `(keywords: ${matchedKeywords.join(", ")})`,
    );

    // Build and write the memory file
    const now = new Date(event.timestamp);
    const dateStr = now.toISOString().split("T")[0];
    const slug = generateSlug(messages);

    const importantDir = path.join(workspaceDir, "memory", "important");
    await fs.mkdir(importantDir, { recursive: true });

    const filename = `${dateStr}-${slug}.md`;
    const filePath = path.join(importantDir, filename);

    const markdown = buildImportantMemoryMarkdown({
      category,
      matchedKeywords,
      messages,
      date: dateStr,
      sessionKey: event.sessionKey,
      sessionId,
    });

    await fs.writeFile(filePath, markdown, "utf-8");

    const relPath = filePath.replace(os.homedir(), "~");
    console.log(`[smart-memory] Saved important conversation to ${relPath}`);
  } catch (err) {
    console.error("[smart-memory] Failed:", err instanceof Error ? err.message : String(err));
  }
};

export default smartMemoryHandler;
