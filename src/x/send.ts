/**
 * X channel message sending.
 */

import type { XAccountConfig, XSendResult, XLogSink } from "./types.js";
import { getOrCreateClientManager } from "./client.js";

/**
 * X character limit for tweets.
 * Standard limit is 280 characters.
 */
export const X_CHAR_LIMIT = 280;

/**
 * Chunk text into tweet-sized pieces.
 * Tries to break at word boundaries.
 */
export function chunkTextForX(text: string, limit: number = X_CHAR_LIMIT): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (space, newline)
    let breakPoint = limit;
    for (let i = limit; i > limit * 0.7; i--) {
      if (remaining[i] === " " || remaining[i] === "\n") {
        breakPoint = i;
        break;
      }
    }

    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}

/**
 * Send a reply to a tweet.
 */
export async function sendMessageX(
  to: string,
  text: string,
  options: {
    account: XAccountConfig;
    accountId: string;
    replyToTweetId?: string;
    logger: XLogSink;
  },
): Promise<XSendResult> {
  const { account, accountId, replyToTweetId, logger } = options;

  const clientManager = getOrCreateClientManager(accountId, logger);

  if (replyToTweetId) {
    return await clientManager.replyToTweet(account, accountId, replyToTweetId, text);
  } else {
    return await clientManager.sendTweet(account, accountId, text);
  }
}
