/**
 * X (Twitter) action handlers for the message tool.
 *
 * Supports: x-follow, x-unfollow, x-dm, x-like, x-unlike, x-repost, x-unrepost, x-reply, x-post
 *
 * These handlers delegate to the X service layer for actual API operations.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveXAccount } from "../../x/accounts.js";
import { createXService, DEFAULT_ACCOUNT_ID } from "../../x/index.js";
import { jsonResult, readStringParam } from "./common.js";

const X_ACTIONS = new Set([
  "x-follow",
  "x-unfollow",
  "x-dm",
  "x-like",
  "x-unlike",
  "x-reply",
  "x-repost",
  "x-unrepost",
  "x-post",
  "x-timeline",
  "x-user-info",
  "x-me",
  "x-search",
  "x-quote",
  "x-tweet-info",
]);

/**
 * Check if an action is an X-specific action
 */
export function isXAction(action: string): boolean {
  return X_ACTIONS.has(action);
}

/**
 * Resolve the X actions allowlist for a cross-channel originator (e.g. Feishu).
 *
 * Checks two lists in order:
 * 1. `channels.<channel>.xActionsAllowFrom` — dedicated X-action allowlist (Feishu user IDs)
 * 2. `channels.<channel>.allowFrom` — general allowlist (fallback: any user allowed to chat
 *    with the bot is also allowed to trigger X actions)
 *
 * This fallback makes cross-channel X operations work out of the box when only `allowFrom`
 * is configured during onboarding, without requiring explicit `xActionsAllowFrom`.
 */
function resolveCrossChannelXActionsAllowFrom(
  cfg: OpenClawConfig,
  channel: string,
): string[] | undefined {
  const channels = cfg.channels as Record<string, Record<string, unknown>> | undefined;
  const channelCfg = channels?.[channel];
  if (!channelCfg || typeof channelCfg !== "object") {
    return undefined;
  }

  // Prefer explicit xActionsAllowFrom
  const xList = channelCfg.xActionsAllowFrom;
  if (Array.isArray(xList) && xList.length > 0) {
    return xList.map((entry) => String(entry).trim());
  }

  // Fallback to allowFrom — if a user is trusted enough to talk to the bot,
  // they should be able to trigger X actions too.
  const allowFrom = channelCfg.allowFrom;
  if (Array.isArray(allowFrom) && allowFrom.length > 0) {
    return allowFrom.map((entry) => String(entry).trim());
  }

  return undefined;
}

/**
 * Check if the sender is allowed to trigger proactive X actions (follow, like, repost, reply, dm).
 *
 * Permission model:
 * - From X: uses `channels.x.actionsAllowFrom` (X user IDs).
 * - From other configured channels (Feishu, Telegram, etc.): uses
 *   `channels.<channel>.xActionsAllowFrom` or falls back to `channels.<channel>.allowFrom`.
 * - From CLI/unattended: allowed if `channels.x.actionsAllowFrom` is configured
 *   (the CLI operator is assumed to be the owner).
 */
function checkXActionsAllowed(params: {
  cfg: OpenClawConfig;
  accountId?: string;
  actionCtx?: XActionContext;
}): void {
  const { cfg, accountId, actionCtx } = params;
  const origChannel = actionCtx?.toolContext?.originatingChannel?.trim().toLowerCase();
  const origSenderId = actionCtx?.toolContext?.originatingSenderId?.trim();

  // --- CLI / unattended context: allow if X actionsAllowFrom is configured ---
  if (!origChannel || !origSenderId) {
    const account = resolveXAccount(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
    const list = account?.actionsAllowFrom;
    if (Array.isArray(list) && list.length > 0) {
      // X channel has actionsAllowFrom configured — CLI/owner is trusted.
      return;
    }
    throw new Error(
      "Permission denied: X actions require channels.x.actionsAllowFrom to be configured.",
    );
  }

  // --- From X: check channels.x.actionsAllowFrom ---
  if (origChannel === "x") {
    const account = resolveXAccount(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
    const list = account?.actionsAllowFrom;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        "Permission denied: X actions allowlist (channels.x.actionsAllowFrom) is not configured; proactive X operations are disabled.",
      );
    }
    if (!list.includes(origSenderId)) {
      throw new Error(
        "Permission denied: your X user is not in the actions allowlist (channels.x.actionsAllowFrom); only listed users can trigger follow/like/repost/reply/dm.",
      );
    }
    return;
  }

  // --- From any other channel: check xActionsAllowFrom → allowFrom → X actionsAllowFrom ---
  const list = resolveCrossChannelXActionsAllowFrom(cfg, origChannel);
  if (Array.isArray(list) && list.length > 0) {
    // Explicit allowlist exists — check the sender.
    if (!list.includes(origSenderId)) {
      throw new Error(
        `Permission denied: your ${origChannel} user is not in the allowlist for X actions. ` +
          `Add your user ID to channels.${origChannel}.xActionsAllowFrom or channels.${origChannel}.allowFrom.`,
      );
    }
    return;
  }

  // No per-channel allowlist. If X itself has actionsAllowFrom configured,
  // allow cross-channel operations — the user is already authenticated by
  // the originating channel infrastructure and the owner explicitly enabled
  // X actions by setting channels.x.actionsAllowFrom.
  const xAccount = resolveXAccount(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
  if (Array.isArray(xAccount?.actionsAllowFrom) && xAccount.actionsAllowFrom.length > 0) {
    return;
  }

  throw new Error(
    `Permission denied: no allowlist configured for X actions. ` +
      `Set channels.${origChannel}.xActionsAllowFrom, channels.${origChannel}.allowFrom, ` +
      `or channels.x.actionsAllowFrom.`,
  );
}

/**
 * Handle x-post action (post a new standalone tweet).
 */
async function handlePost(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const message = readStringParam(params, "message", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const result = await xService.sendTweet(message);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to post tweet");
  }

  return jsonResult({
    ok: true,
    action: "x-post",
    tweetId: result.tweetId,
  });
}

/**
 * Handle x-timeline action (get a user's recent tweets).
 */
async function handleTimeline(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const maxResultsRaw = params.maxResults ?? params.max_results ?? params.count;
  const maxResults =
    typeof maxResultsRaw === "number"
      ? maxResultsRaw
      : typeof maxResultsRaw === "string"
        ? Number.parseInt(maxResultsRaw, 10) || 10
        : 10;
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const tweets = await xService.getUserTimeline(target, maxResults);

  return jsonResult({
    ok: true,
    action: "x-timeline",
    target,
    count: tweets.length,
    tweets: tweets.map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.authorId,
      createdAt: t.createdAt?.toISOString(),
    })),
  });
}

/**
 * Handle x-user-info action (look up a user by username).
 */
async function handleUserInfo(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const user = await xService.getUserInfo(target);
  if (!user) {
    throw new Error(`User not found: ${target}`);
  }

  return jsonResult({
    ok: true,
    action: "x-user-info",
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
  });
}

/**
 * Handle x-me action (get authenticated account info).
 */
async function handleMe(
  _params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const me = await xService.getMe();

  return jsonResult({
    ok: true,
    action: "x-me",
    user: {
      id: me.id,
      username: me.username,
      name: me.name,
    },
  });
}

/**
 * Handle x-search action (search recent tweets by keyword).
 */
async function handleSearch(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const query = readStringParam(params, "query", { required: true });
  const maxResultsRaw = params.maxResults ?? params.max_results ?? params.count;
  const maxResults =
    typeof maxResultsRaw === "number"
      ? maxResultsRaw
      : typeof maxResultsRaw === "string"
        ? Number.parseInt(maxResultsRaw, 10) || 10
        : 10;
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const result = await xService.searchTweets(query, maxResults);
  if (!result.ok) {
    throw new Error(result.error ?? "Search failed");
  }

  return jsonResult({
    ok: true,
    action: "x-search",
    query,
    count: result.tweets.length,
    tweets: result.tweets.map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.authorId,
      authorUsername: t.authorUsername,
      authorName: t.authorName,
      createdAt: t.createdAt?.toISOString(),
      metrics: t.metrics,
    })),
  });
}

/**
 * Handle x-tweet-info action (get tweet details with metrics).
 */
async function handleTweetInfo(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const details = await xService.getTweetDetails(target);
  if (!details) {
    throw new Error(`Tweet not found: ${target}`);
  }

  return jsonResult({
    ok: true,
    action: "x-tweet-info",
    tweet: {
      id: details.id,
      text: details.text,
      authorId: details.authorId,
      authorUsername: details.authorUsername,
      authorName: details.authorName,
      createdAt: details.createdAt?.toISOString(),
      metrics: details.metrics,
      urls: details.urls,
    },
  });
}

/**
 * Handle x-quote action (quote tweet / retweet with comment).
 */
async function handleQuote(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const message = readStringParam(params, "message", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const result = await xService.quoteTweet(target, message);
  if (!result.ok) {
    throw new Error(result.error ?? "Failed to quote tweet");
  }

  return jsonResult({
    ok: true,
    action: "x-quote",
    quotedTweet: target,
    tweetId: result.tweetId,
  });
}

/**
 * Parse a tweet ID from various formats (for validation/normalization).
 * Moved to service layer but kept here for backward compatibility with any direct imports.
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
 * Handle x-follow action
 */
async function handleFollow(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const result = await xService.followUser(target);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to follow user");
  }

  return jsonResult({
    ok: true,
    action: "x-follow",
    target,
    following: result.following,
  });
}

/**
 * Handle x-unfollow action
 */
async function handleUnfollow(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const result = await xService.unfollowUser(target);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to unfollow user");
  }

  return jsonResult({
    ok: true,
    action: "x-unfollow",
    target,
    following: result.following,
  });
}

/**
 * Handle x-dm action
 */
async function handleDm(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const message = readStringParam(params, "message", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });

  const result = await xService.sendDM(target, message);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to send direct message");
  }

  return jsonResult({
    ok: true,
    action: "x-dm",
    target,
    dmId: result.dmId,
    conversationId: result.conversationId,
  });
}

/**
 * Handle x-like action
 */
async function handleLike(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });
  const tweetId = parseTweetId(target);

  const result = await xService.likeTweet(tweetId);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to like tweet");
  }

  return jsonResult({
    ok: true,
    action: "x-like",
    tweetId,
    liked: result.liked,
  });
}

/**
 * Handle x-unlike action
 */
async function handleUnlike(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });
  const tweetId = parseTweetId(target);

  const result = await xService.unlikeTweet(tweetId);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to unlike tweet");
  }

  return jsonResult({
    ok: true,
    action: "x-unlike",
    tweetId,
    liked: result.liked,
  });
}

/**
 * Handle x-repost action (retweet)
 */
async function handleRepost(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });
  const tweetId = parseTweetId(target);

  const result = await xService.retweetTweet(tweetId);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to retweet");
  }

  return jsonResult({
    ok: true,
    action: "x-repost",
    tweetId,
    retweeted: result.retweeted,
  });
}

/**
 * Handle x-unrepost action (undo retweet)
 */
async function handleUnrepost(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });
  const tweetId = parseTweetId(target);

  const result = await xService.unretweetTweet(tweetId);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to unretweet");
  }

  return jsonResult({
    ok: true,
    action: "x-unrepost",
    tweetId,
    retweeted: result.retweeted,
  });
}

/** Optional context for permission checks (e.g. x-reply only to mentioner when from X). */
export type XActionContext = {
  toolContext?: {
    originatingChannel?: string;
    originatingSenderId?: string;
  };
};

/**
 * Handle x-reply action (comment/reply to a tweet).
 * When the control message originated from X (mention), only allows replying to that user's tweets.
 */
async function handleReply(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
  actionCtx?: XActionContext,
): Promise<AgentToolResult<unknown>> {
  const target = readStringParam(params, "target", { required: true });
  const message = readStringParam(params, "message", { required: true });
  const xService = createXService(cfg, { accountId: accountId ?? DEFAULT_ACCOUNT_ID });
  const tweetId = parseTweetId(target);

  // When triggered from X (mention), only allow replying to the user who mentioned us
  const origChannel = actionCtx?.toolContext?.originatingChannel?.trim().toLowerCase();
  const origSenderId = actionCtx?.toolContext?.originatingSenderId?.trim();
  if (origChannel === "x" && origSenderId) {
    const authorId = await xService.getTweetAuthor(tweetId);
    if (authorId === null) {
      throw new Error("Could not resolve tweet; reply not allowed.");
    }
    if (authorId !== origSenderId) {
      throw new Error(
        "Permission denied: when triggered from an X mention, you can only reply to that user's tweets, not to other users.",
      );
    }
  }

  const result = await xService.replyToTweet(tweetId, message);

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to reply to tweet");
  }

  return jsonResult({
    ok: true,
    action: "x-reply",
    tweetId,
    replyTweetId: result.tweetId,
  });
}

/**
 * Handle X actions dispatched from the message tool.
 * Pass full ctx so x-reply can enforce "reply only to mentioner" when originating from X.
 * All proactive X actions (follow, like, reply, dm) require the sender to be in actionsAllowFrom (X).
 */
/** Read-only actions that do not require actionsAllowFrom permission. */
const X_READ_ACTIONS = new Set(["x-timeline", "x-user-info", "x-me", "x-search", "x-tweet-info"]);

export async function handleXAction(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  accountId?: string,
  actionCtx?: XActionContext,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });

  // Read-only actions skip the actionsAllowFrom check — they don't mutate state.
  if (!X_READ_ACTIONS.has(action)) {
    checkXActionsAllowed({ cfg, accountId, actionCtx });
  }

  switch (action) {
    case "x-follow":
      return handleFollow(params, cfg, accountId);
    case "x-unfollow":
      return handleUnfollow(params, cfg, accountId);
    case "x-dm":
      return handleDm(params, cfg, accountId);
    case "x-like":
      return handleLike(params, cfg, accountId);
    case "x-unlike":
      return handleUnlike(params, cfg, accountId);
    case "x-reply":
      return handleReply(params, cfg, accountId, actionCtx);
    case "x-repost":
      return handleRepost(params, cfg, accountId);
    case "x-unrepost":
      return handleUnrepost(params, cfg, accountId);
    case "x-post":
      return handlePost(params, cfg, accountId);
    case "x-quote":
      return handleQuote(params, cfg, accountId);
    case "x-timeline":
      return handleTimeline(params, cfg, accountId);
    case "x-user-info":
      return handleUserInfo(params, cfg, accountId);
    case "x-me":
      return handleMe(params, cfg, accountId);
    case "x-search":
      return handleSearch(params, cfg, accountId);
    case "x-tweet-info":
      return handleTweetInfo(params, cfg, accountId);
    default:
      throw new Error(`Unknown X action: ${action}`);
  }
}
