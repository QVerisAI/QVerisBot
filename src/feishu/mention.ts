/**
 * Feishu @mention extraction and forwarding utilities.
 *
 * Supports extracting @mention targets from incoming messages and
 * building messages with @mentions for bot replies.
 */

/**
 * Mention target user info extracted from Feishu message event
 */
export type MentionTarget = {
  /** User's open_id */
  openId: string;
  /** User's display name */
  name: string;
  /** Placeholder key in original message, e.g. @_user_1 */
  key: string;
};

/**
 * Feishu mention structure from message event
 */
export type FeishuMention = {
  key: string;
  id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  name: string;
  tenant_key?: string;
};

/**
 * Extract mention targets from message mentions (excluding the bot itself)
 *
 * @param mentions - Array of mentions from the message event
 * @param botOpenId - Bot's open_id to exclude from targets
 * @returns Array of mention targets (non-bot users)
 */
export function extractMentionTargets(
  mentions: FeishuMention[] | undefined,
  botOpenId?: string,
): MentionTarget[] {
  if (!mentions || mentions.length === 0) return [];

  return mentions
    .filter((m) => {
      // Exclude the bot itself
      if (botOpenId && m.id.open_id === botOpenId) return false;
      // Must have open_id
      return !!m.id.open_id;
    })
    .map((m) => ({
      openId: m.id.open_id!,
      name: m.name,
      key: m.key,
    }));
}

/**
 * Check if message is a mention forward request.
 *
 * Rules:
 * - Group: message mentions bot + at least one other user
 * - DM: message mentions any user (no need to mention bot)
 *
 * @param mentions - Array of mentions from the message event
 * @param chatType - "p2p" for DM, "group" for group chat
 * @param botOpenId - Bot's open_id
 * @returns true if bot should forward @mentions in reply
 */
export function isMentionForwardRequest(
  mentions: FeishuMention[] | undefined,
  chatType: "p2p" | "group",
  botOpenId?: string,
): boolean {
  if (!mentions || mentions.length === 0) return false;

  const isDirectMessage = chatType === "p2p";
  const hasOtherMention = mentions.some((m) => m.id.open_id !== botOpenId);

  if (isDirectMessage) {
    // DM: trigger if any non-bot user is mentioned
    return hasOtherMention;
  } else {
    // Group: need to mention both bot and other users
    const hasBotMention = mentions.some((m) => m.id.open_id === botOpenId);
    return hasBotMention && hasOtherMention;
  }
}

/**
 * Extract message body from text (remove @ placeholders)
 *
 * @param text - Original message text with placeholders
 * @param allMentionKeys - All mention keys to remove (including bot's)
 * @returns Cleaned message text
 */
export function extractMessageBody(text: string, allMentionKeys: string[]): string {
  let result = text;

  // Remove all @ placeholders
  for (const key of allMentionKeys) {
    // Escape special regex characters in the key
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), "");
  }

  // Normalize whitespace
  return result.replace(/\s+/g, " ").trim();
}

/**
 * Format @mention for text message (Feishu text format)
 *
 * @param target - Mention target
 * @returns Formatted mention string for text messages
 */
export function formatMentionForText(target: MentionTarget): string {
  return `<at user_id="${target.openId}">${target.name}</at>`;
}

/**
 * Format @everyone for text message
 *
 * @returns Formatted @all mention string
 */
export function formatMentionAllForText(): string {
  return `<at user_id="all">Everyone</at>`;
}

/**
 * Format @mention for card message (lark_md format)
 *
 * @param target - Mention target
 * @returns Formatted mention string for card markdown
 */
export function formatMentionForCard(target: MentionTarget): string {
  return `<at id=${target.openId}></at>`;
}

/**
 * Format @everyone for card message
 *
 * @returns Formatted @all mention string for cards
 */
export function formatMentionAllForCard(): string {
  return `<at id=all></at>`;
}

/**
 * Build complete message with @mentions prepended (text format)
 *
 * @param targets - Mention targets to include
 * @param message - Original message content
 * @returns Message with @mentions prepended
 */
export function buildMentionedMessage(targets: MentionTarget[], message: string): string {
  if (targets.length === 0) return message;

  const mentionParts = targets.map((t) => formatMentionForText(t));
  return `${mentionParts.join(" ")} ${message}`;
}

/**
 * Build card content with @mentions prepended (Markdown format)
 *
 * @param targets - Mention targets to include
 * @param message - Original message content
 * @returns Message with @mentions prepended (card markdown format)
 */
export function buildMentionedCardContent(targets: MentionTarget[], message: string): string {
  if (targets.length === 0) return message;

  const mentionParts = targets.map((t) => formatMentionForCard(t));
  return `${mentionParts.join(" ")} ${message}`;
}
