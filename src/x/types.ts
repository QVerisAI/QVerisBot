/**
 * X (Twitter) channel types.
 */

/**
 * Account configuration for X channel
 */
export interface XAccountConfig {
  /** Twitter/X Consumer Key (API Key) */
  consumerKey: string;
  /** Twitter/X Consumer Secret (API Secret) */
  consumerSecret: string;
  /** Twitter/X Access Token */
  accessToken: string;
  /** Twitter/X Access Token Secret */
  accessTokenSecret: string;
  /** Enable this account */
  enabled?: boolean;
  /** Polling interval in seconds (default: 60) */
  pollIntervalSeconds?: number;
  /** Allowlist of X user IDs who can trigger the bot */
  allowFrom?: string[];
  /** Account display name (for UI) */
  name?: string;
}

/**
 * X mention from the API
 */
export interface XMention {
  /** Tweet ID */
  id: string;
  /** Tweet text content */
  text: string;
  /** Author's user ID */
  authorId: string;
  /** Author's username (handle) */
  authorUsername?: string;
  /** Author's display name */
  authorName?: string;
  /** Tweet creation timestamp */
  createdAt?: Date;
  /** ID of tweet being replied to (if this is a reply) */
  inReplyToTweetId?: string;
  /** Conversation ID */
  conversationId?: string;
}

/**
 * Result from sending a tweet/reply
 */
export interface XSendResult {
  ok: boolean;
  error?: string;
  tweetId?: string;
}

/**
 * State tracker for polling
 */
export interface XPollState {
  /** Last processed tweet ID (for since_id) */
  lastTweetId?: string;
  /** Timestamp of last successful poll */
  lastPollAt?: number;
}

/**
 * Log sink interface
 */
export interface XLogSink {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
}
