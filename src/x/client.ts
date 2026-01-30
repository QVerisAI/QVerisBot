/**
 * X (Twitter) API v2 client wrapper.
 *
 * Handles authentication and API interactions using OAuth 1.0a credentials.
 */

import { TwitterApi } from "twitter-api-v2";
import type { XAccountConfig, XMention, XSendResult, XLogSink } from "./types.js";

/**
 * Manages X API client connections
 */
export class XClientManager {
  private clients = new Map<string, TwitterApi>();

  constructor(private logger: XLogSink) {}

  /**
   * Get or create an authenticated client for an account
   */
  getClient(account: XAccountConfig, accountId: string): TwitterApi {
    const existing = this.clients.get(accountId);
    if (existing) {
      return existing;
    }

    if (!account.consumerKey || !account.consumerSecret) {
      throw new Error("Missing X consumer key/secret");
    }
    if (!account.accessToken || !account.accessTokenSecret) {
      throw new Error("Missing X access token/secret");
    }

    const client = new TwitterApi({
      appKey: account.consumerKey,
      appSecret: account.consumerSecret,
      accessToken: account.accessToken,
      accessSecret: account.accessTokenSecret,
    });

    this.clients.set(accountId, client);
    this.logger.info(`Created X client for account ${accountId}`);

    return client;
  }

  /**
   * Get the authenticated user's info
   */
  async getMe(
    account: XAccountConfig,
    accountId: string,
  ): Promise<{
    id: string;
    username: string;
    name: string;
  }> {
    const client = this.getClient(account, accountId);
    const me = await client.v2.me({
      "user.fields": ["id", "username", "name"],
    });
    return {
      id: me.data.id,
      username: me.data.username,
      name: me.data.name,
    };
  }

  /**
   * Fetch mentions for the authenticated user
   *
   * @param sinceId - Only return tweets newer than this ID (for incremental polling)
   */
  async getMentions(
    account: XAccountConfig,
    accountId: string,
    sinceId?: string,
  ): Promise<{ mentions: XMention[]; newestId?: string }> {
    const client = this.getClient(account, accountId);

    // First get the authenticated user's ID
    const me = await this.getMe(account, accountId);

    const options: Parameters<typeof client.v2.userMentionTimeline>[1] = {
      max_results: 100,
      "tweet.fields": [
        "id",
        "text",
        "author_id",
        "created_at",
        "conversation_id",
        "in_reply_to_user_id",
      ],
      "user.fields": ["id", "username", "name"],
      expansions: ["author_id"],
    };

    if (sinceId) {
      options.since_id = sinceId;
    }

    const response = await client.v2.userMentionTimeline(me.id, options);

    const mentions: XMention[] = [];
    const users = new Map<string, { username: string; name: string }>();

    // Build user lookup from includes
    if (response.includes?.users) {
      for (const user of response.includes.users) {
        users.set(user.id, { username: user.username, name: user.name });
      }
    }

    // Process tweets
    for (const tweet of response.data?.data ?? []) {
      const author = users.get(tweet.author_id ?? "");
      mentions.push({
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id ?? "",
        authorUsername: author?.username,
        authorName: author?.name,
        createdAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
        conversationId: tweet.conversation_id,
      });
    }

    // Get the newest ID for next poll
    const newestId = response.data?.meta?.newest_id;

    return { mentions, newestId };
  }

  /**
   * Reply to a tweet
   */
  async replyToTweet(
    account: XAccountConfig,
    accountId: string,
    replyToTweetId: string,
    text: string,
  ): Promise<XSendResult> {
    try {
      const client = this.getClient(account, accountId);

      const result = await client.v2.tweet({
        text,
        reply: {
          in_reply_to_tweet_id: replyToTweetId,
        },
      });

      this.logger.info(`Sent reply to tweet ${replyToTweetId}: ${result.data.id}`);

      return {
        ok: true,
        tweetId: result.data.id,
      };
    } catch (error: unknown) {
      let errorMsg = error instanceof Error ? error.message : String(error);

      // Extract more details from twitter-api-v2 errors
      const apiError = error as {
        code?: number;
        data?: { detail?: string; title?: string; errors?: Array<{ message?: string }> };
      };
      if (apiError.data) {
        const detail = apiError.data.detail || apiError.data.title || "";
        const errors = apiError.data.errors?.map((e) => e.message).join(", ") || "";
        if (detail || errors) {
          errorMsg = `${errorMsg} - ${detail} ${errors}`.trim();
        }
        this.logger.error(`X API error details: ${JSON.stringify(apiError.data)}`);
      }

      this.logger.error(`Failed to reply to tweet ${replyToTweetId}: ${errorMsg}`);
      return {
        ok: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Send a standalone tweet (not a reply)
   */
  async sendTweet(account: XAccountConfig, accountId: string, text: string): Promise<XSendResult> {
    try {
      const client = this.getClient(account, accountId);

      const result = await client.v2.tweet({ text });

      this.logger.info(`Sent tweet: ${result.data.id}`);

      return {
        ok: true,
        tweetId: result.data.id,
      };
    } catch (error: unknown) {
      let errorMsg = error instanceof Error ? error.message : String(error);

      // Extract more details from twitter-api-v2 errors
      const apiError = error as {
        code?: number;
        data?: { detail?: string; title?: string; errors?: Array<{ message?: string }> };
      };
      if (apiError.data) {
        const detail = apiError.data.detail || apiError.data.title || "";
        const errors = apiError.data.errors?.map((e) => e.message).join(", ") || "";
        if (detail || errors) {
          errorMsg = `${errorMsg} - ${detail} ${errors}`.trim();
        }
        this.logger.error(`X API error details: ${JSON.stringify(apiError.data)}`);
      }

      this.logger.error(`Failed to send tweet: ${errorMsg}`);
      return {
        ok: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Remove a client from the cache
   */
  removeClient(accountId: string): void {
    this.clients.delete(accountId);
    this.logger.info(`Removed X client for account ${accountId}`);
  }

  /**
   * Clear all clients
   */
  clearAll(): void {
    this.clients.clear();
    this.logger.info("Cleared all X clients");
  }
}

// Global client manager registry (one per account)
const clientManagers = new Map<string, XClientManager>();

export function getOrCreateClientManager(accountId: string, logger: XLogSink): XClientManager {
  let manager = clientManagers.get(accountId);
  if (!manager) {
    manager = new XClientManager(logger);
    clientManagers.set(accountId, manager);
  }
  return manager;
}

export function removeClientManager(accountId: string): void {
  const manager = clientManagers.get(accountId);
  if (manager) {
    manager.clearAll();
    clientManagers.delete(accountId);
  }
}
