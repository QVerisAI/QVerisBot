/**
 * X (Twitter) service layer.
 *
 * Provides a high-level API for X operations that can be used from any context
 * (agent tools, other channel handlers, CLI commands, etc.).
 */

import type { OpenClawConfig } from "../config/config.js";
import { resolveXAccount, isXAccountConfigured, DEFAULT_ACCOUNT_ID } from "./accounts.js";
import { getOrCreateClientManager } from "./client.js";
import type {
  XAccountConfig,
  XFollowResult,
  XDmResult,
  XLikeResult,
  XRetweetResult,
  XUserInfo,
  XLogSink,
  XSendResult,
  XTweet,
  XTweetDetails,
  XSearchResult,
  XQuoteResult,
} from "./types.js";

/**
 * Options for creating an X service instance
 */
export interface XServiceOptions {
  /** Account ID to use (defaults to "default") */
  accountId?: string;
  /** Custom logger (defaults to console) */
  logger?: XLogSink;
}

/**
 * High-level X service interface for performing X/Twitter actions.
 */
export interface XService {
  /** The resolved account ID */
  readonly accountId: string;

  /** The underlying account configuration */
  readonly account: XAccountConfig;

  // ─────────────────────────────────────────────────────────────────────────────
  // User actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Follow a user by username or user ID.
   * @param target - Username (with or without @) or user ID
   */
  followUser(target: string): Promise<XFollowResult>;

  /**
   * Unfollow a user by username or user ID.
   * @param target - Username (with or without @) or user ID
   */
  unfollowUser(target: string): Promise<XFollowResult>;

  /**
   * Look up a user by username.
   * @param username - Username (with or without @)
   */
  getUserByUsername(username: string): Promise<XUserInfo | null>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Tweet actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Like a tweet.
   * @param tweetIdOrUrl - Tweet ID or URL (e.g., https://x.com/user/status/123)
   */
  likeTweet(tweetIdOrUrl: string): Promise<XLikeResult>;

  /**
   * Unlike a tweet.
   * @param tweetIdOrUrl - Tweet ID or URL
   */
  unlikeTweet(tweetIdOrUrl: string): Promise<XLikeResult>;

  /**
   * Retweet (repost) a tweet.
   * @param tweetIdOrUrl - Tweet ID or URL
   */
  retweetTweet(tweetIdOrUrl: string): Promise<XRetweetResult>;

  /**
   * Undo a retweet (unrepost) a tweet.
   * @param tweetIdOrUrl - Tweet ID or URL
   */
  unretweetTweet(tweetIdOrUrl: string): Promise<XRetweetResult>;

  /**
   * Send a standalone tweet (not a reply).
   * @param text - Tweet content (max 280 chars)
   */
  sendTweet(text: string): Promise<XSendResult>;

  /**
   * Reply to a tweet.
   * @param replyToTweetId - The tweet ID to reply to
   * @param text - Reply content (max 280 chars)
   */
  replyToTweet(replyToTweetId: string, text: string): Promise<XSendResult>;

  /**
   * Get the author ID of a tweet (for permission checks).
   * @param tweetId - Tweet ID
   * @returns Author user ID or null if not found
   */
  getTweetAuthor(tweetId: string): Promise<string | null>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Direct messages
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Send a direct message to a user.
   * @param target - Username (with or without @) or user ID
   * @param message - Message content
   */
  sendDM(target: string, message: string): Promise<XDmResult>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Read / query actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get a user's recent tweets (timeline).
   * @param target - Username (with or without @) or user ID
   * @param maxResults - Max tweets to return (default 10)
   */
  getUserTimeline(target: string, maxResults?: number): Promise<XTweet[]>;

  /**
   * Look up a user by username.
   * @param username - Username (with or without @)
   */
  getUserInfo(username: string): Promise<XUserInfo | null>;

  /**
   * Get the authenticated user's info.
   */
  getMe(): Promise<XUserInfo>;

  /**
   * Search recent tweets by keyword query.
   * @param query - Search query string
   * @param maxResults - Max tweets to return (default 10)
   */
  searchTweets(query: string, maxResults?: number): Promise<XSearchResult>;

  /**
   * Get detailed tweet info including engagement metrics.
   * @param tweetIdOrUrl - Tweet ID or URL
   */
  getTweetDetails(tweetIdOrUrl: string): Promise<XTweetDetails | null>;

  /**
   * Post a quote tweet (retweet with comment).
   * @param tweetIdOrUrl - Tweet ID or URL of the tweet to quote
   * @param text - Comment text (max 280 chars)
   */
  quoteTweet(tweetIdOrUrl: string, text: string): Promise<XQuoteResult>;
}

/**
 * Parse a user target - either a user ID or @username.
 */
function parseUserTarget(input: string): { kind: "id" | "username"; value: string } {
  const trimmed = input.trim();

  // Check if it's a username (starts with @)
  if (trimmed.startsWith("@")) {
    return { kind: "username", value: trimmed.slice(1) };
  }

  // Check if it's a numeric ID
  if (/^\d+$/.test(trimmed)) {
    return { kind: "id", value: trimmed };
  }

  // Assume it's a username without @
  return { kind: "username", value: trimmed };
}

/**
 * Parse a tweet ID from various formats:
 * - Raw tweet ID: "1234567890"
 * - Tweet URL: "https://twitter.com/user/status/1234567890"
 * - Tweet URL: "https://x.com/user/status/1234567890"
 */
function parseTweetId(input: string): string {
  const trimmed = input.trim();

  // Check if it's a URL
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i,
  );
  if (urlMatch) {
    return urlMatch[1];
  }

  // Assume it's a raw ID
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(
    `Invalid tweet ID or URL: "${input}". Expected a tweet ID or URL like https://x.com/user/status/1234567890`,
  );
}

/**
 * Create a default logger that outputs to console.
 */
function createDefaultLogger(): XLogSink {
  return {
    info: (msg: string) => console.log(`[x] ${msg}`),
    warn: (msg: string) => console.warn(`[x] ${msg}`),
    error: (msg: string) => console.error(`[x] ${msg}`),
    debug: (msg: string) => console.debug(`[x] ${msg}`),
  };
}

/**
 * Create an X service instance for performing X/Twitter actions.
 *
 * Can be used from any context - agent tools, other channel handlers, CLI, etc.
 *
 * @example
 * ```typescript
 * import { createXService } from "../x/index.js";
 *
 * // Create service with default account
 * const xService = createXService(cfg);
 *
 * // Follow a user
 * const result = await xService.followUser("@elonmusk");
 *
 * // Like a tweet
 * await xService.likeTweet("https://x.com/user/status/123456");
 *
 * // Send a DM
 * await xService.sendDM("@username", "Hello!");
 * ```
 *
 * @throws Error if the account is not configured
 */
export function createXService(cfg: OpenClawConfig, options?: XServiceOptions): XService {
  const accountId = options?.accountId ?? DEFAULT_ACCOUNT_ID;
  const logger = options?.logger ?? createDefaultLogger();

  const resolvedAccount = resolveXAccount(cfg, accountId);
  if (!resolvedAccount) {
    throw new Error(`X account "${accountId}" not configured`);
  }

  if (!isXAccountConfigured(resolvedAccount)) {
    throw new Error(
      `X account "${accountId}" is missing required credentials (consumerKey, consumerSecret, accessToken, accessTokenSecret)`,
    );
  }

  // Account is now guaranteed to be valid
  const account: XAccountConfig = resolvedAccount;

  const clientManager = getOrCreateClientManager(accountId, logger, {
    proxyUrl: account.proxy,
  });

  /**
   * Resolve a user target to a user ID.
   */
  async function resolveUserId(target: string): Promise<string> {
    const parsed = parseUserTarget(target);
    if (parsed.kind === "id") {
      return parsed.value;
    }
    const user = await clientManager.getUserByUsername(account, accountId, parsed.value);
    if (!user) {
      throw new Error(`User @${parsed.value} not found`);
    }
    return user.id;
  }

  return {
    accountId,
    account,

    // ───────────────────────────────────────────────────────────────────────────
    // User actions
    // ───────────────────────────────────────────────────────────────────────────

    async followUser(target: string): Promise<XFollowResult> {
      const userId = await resolveUserId(target);
      return clientManager.followUser(account, accountId, userId);
    },

    async unfollowUser(target: string): Promise<XFollowResult> {
      const userId = await resolveUserId(target);
      return clientManager.unfollowUser(account, accountId, userId);
    },

    async getUserByUsername(username: string): Promise<XUserInfo | null> {
      return clientManager.getUserByUsername(account, accountId, username);
    },

    // ───────────────────────────────────────────────────────────────────────────
    // Tweet actions
    // ───────────────────────────────────────────────────────────────────────────

    async likeTweet(tweetIdOrUrl: string): Promise<XLikeResult> {
      const tweetId = parseTweetId(tweetIdOrUrl);
      return clientManager.likeTweet(account, accountId, tweetId);
    },

    async unlikeTweet(tweetIdOrUrl: string): Promise<XLikeResult> {
      const tweetId = parseTweetId(tweetIdOrUrl);
      return clientManager.unlikeTweet(account, accountId, tweetId);
    },

    async retweetTweet(tweetIdOrUrl: string): Promise<XRetweetResult> {
      const tweetId = parseTweetId(tweetIdOrUrl);
      return clientManager.retweetTweet(account, accountId, tweetId);
    },

    async unretweetTweet(tweetIdOrUrl: string): Promise<XRetweetResult> {
      const tweetId = parseTweetId(tweetIdOrUrl);
      return clientManager.unretweetTweet(account, accountId, tweetId);
    },

    async sendTweet(text: string): Promise<XSendResult> {
      return clientManager.sendTweet(account, accountId, text);
    },

    async replyToTweet(replyToTweetId: string, text: string): Promise<XSendResult> {
      return clientManager.replyToTweet(account, accountId, replyToTweetId, text);
    },

    async getTweetAuthor(tweetId: string): Promise<string | null> {
      return clientManager.getTweetAuthor(account, accountId, tweetId);
    },

    // ───────────────────────────────────────────────────────────────────────────
    // Direct messages
    // ───────────────────────────────────────────────────────────────────────────

    async sendDM(target: string, message: string): Promise<XDmResult> {
      const userId = await resolveUserId(target);
      return clientManager.sendDirectMessage(account, accountId, userId, message);
    },

    // ───────────────────────────────────────────────────────────────────────────
    // Read / query actions
    // ───────────────────────────────────────────────────────────────────────────

    async getUserTimeline(target: string, maxResults?: number): Promise<XTweet[]> {
      const userId = await resolveUserId(target);
      return clientManager.getUserTweets(account, accountId, userId, maxResults ?? 10);
    },

    async getUserInfo(username: string): Promise<XUserInfo | null> {
      return clientManager.getUserByUsername(account, accountId, username);
    },

    async getMe(): Promise<XUserInfo> {
      return clientManager.getMe(account, accountId);
    },

    async searchTweets(query: string, maxResults?: number): Promise<XSearchResult> {
      return clientManager.searchTweets(account, accountId, query, maxResults ?? 10);
    },

    async getTweetDetails(tweetIdOrUrl: string): Promise<XTweetDetails | null> {
      const tweetId = parseTweetId(tweetIdOrUrl);
      return clientManager.getTweetDetails(account, accountId, tweetId);
    },

    async quoteTweet(tweetIdOrUrl: string, text: string): Promise<XQuoteResult> {
      const tweetId = parseTweetId(tweetIdOrUrl);
      return clientManager.quoteTweet(account, accountId, tweetId, text);
    },
  };
}

/**
 * Try to create an X service, returning null if the account is not configured.
 *
 * Useful when you want to check if X is available before attempting actions.
 */
export function tryCreateXService(cfg: OpenClawConfig, options?: XServiceOptions): XService | null {
  try {
    return createXService(cfg, options);
  } catch {
    return null;
  }
}
