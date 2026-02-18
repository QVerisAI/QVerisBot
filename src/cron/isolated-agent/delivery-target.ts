import type { ChannelId } from "../../channels/plugins/types.js";
import { DEFAULT_CHAT_CHANNEL } from "../../channels/registry.js";
import type { OpenClawConfig } from "../../config/config.js";
import {
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveStorePath,
} from "../../config/sessions.js";
import { resolveMessageChannelSelection } from "../../infra/outbound/channel-selection.js";
import type { OutboundChannel } from "../../infra/outbound/targets.js";
import {
  resolveOutboundTarget,
  resolveSessionDeliveryTarget,
} from "../../infra/outbound/targets.js";
import { buildChannelAccountBindings } from "../../routing/bindings.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { CronDeliveryMode, CronOrigin } from "../types.js";

export async function resolveDeliveryTarget(
  cfg: OpenClawConfig,
  agentId: string,
  jobPayload: {
    channel?: "last" | ChannelId;
    to?: string;
    sessionKey?: string;
  },
  options?: {
    /** Origin context from when the job was created */
    origin?: CronOrigin;
    /** Delivery mode: "origin" (default) or "current" */
    deliveryMode?: CronDeliveryMode;
  },
): Promise<{
  channel: Exclude<OutboundChannel, "none">;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  mode: "explicit" | "implicit";
  error?: Error;
}> {
  const origin = options?.origin;
  const deliveryMode = options?.deliveryMode ?? "origin";

  // Explicit payload values always take precedence
  const hasExplicitChannel =
    typeof jobPayload.channel === "string" && jobPayload.channel !== "last";
  const hasExplicitTo = typeof jobPayload.to === "string" && jobPayload.to.trim() !== "";

  // Determine if we should use origin context
  // Use origin when: deliveryMode is "origin" (default), origin exists, and no explicit overrides
  const useOrigin =
    deliveryMode === "origin" &&
    origin &&
    !hasExplicitChannel &&
    !hasExplicitTo &&
    (origin.channel || origin.to);

  if (useOrigin && origin.channel && origin.to) {
    // Route directly to origin - no need to look up main session
    const docked = resolveOutboundTarget({
      channel: origin.channel,
      to: origin.to,
      cfg,
      accountId: origin.accountId,
      mode: "explicit",
    });
    return {
      channel: origin.channel,
      to: docked.ok ? docked.to : undefined,
      accountId: origin.accountId,
      threadId: origin.threadId,
      mode: "explicit",
      error: docked.ok ? undefined : docked.error,
    };
  }

  // Fall back to main session lookup (current behavior)
  const requestedChannel = hasExplicitChannel
    ? (jobPayload.channel as ChannelId)
    : useOrigin && origin?.channel
      ? origin.channel
      : "last";
  const explicitTo = hasExplicitTo
    ? jobPayload.to
    : useOrigin && origin?.to
      ? origin.to
      : undefined;
  const allowMismatchedLastTo = requestedChannel === "last";

  const sessionCfg = cfg.session;
  const mainSessionKey = resolveAgentMainSessionKey({ cfg, agentId });
  const storePath = resolveStorePath(sessionCfg?.store, { agentId });
  const store = loadSessionStore(storePath);

  // Look up thread-specific session first (e.g. agent:main:main:thread:1234),
  // then fall back to the main session entry.
  const threadSessionKey = jobPayload.sessionKey?.trim();
  const threadEntry = threadSessionKey ? store[threadSessionKey] : undefined;
  const main = threadEntry ?? store[mainSessionKey];

  const preliminary = resolveSessionDeliveryTarget({
    entry: main,
    requestedChannel,
    explicitTo,
    allowMismatchedLastTo,
  });

  let fallbackChannel: Exclude<OutboundChannel, "none"> | undefined;
  if (!preliminary.channel) {
    // Try origin channel as fallback before config/default
    if (useOrigin && origin?.channel) {
      fallbackChannel = origin.channel;
    } else {
      try {
        const selection = await resolveMessageChannelSelection({ cfg });
        fallbackChannel = selection.channel;
      } catch {
        fallbackChannel = preliminary.lastChannel ?? DEFAULT_CHAT_CHANNEL;
      }
    }
  }

  const resolved = fallbackChannel
    ? resolveSessionDeliveryTarget({
        entry: main,
        requestedChannel,
        explicitTo,
        fallbackChannel,
        allowMismatchedLastTo,
        mode: preliminary.mode,
      })
    : preliminary;

  const channel = resolved.channel ?? fallbackChannel ?? DEFAULT_CHAT_CHANNEL;
  const mode = resolved.mode as "explicit" | "implicit";
  const toCandidate = resolved.to;

  //const accountId = useOrigin && origin?.accountId ? origin.accountId : resolved.accountId;
  //const threadId = useOrigin && origin?.threadId != null ? origin.threadId : resolved.threadId;

  // When the session has no lastAccountId (e.g. first-run isolated cron
  // session), fall back to the agent's bound account from bindings config.
  // This ensures the message tool in isolated sessions resolves the correct
  // bot token for multi-account setups.
  let accountId = resolved.accountId;
  if (!accountId && channel) {
    const bindings = buildChannelAccountBindings(cfg);
    const byAgent = bindings.get(channel);
    const boundAccounts = byAgent?.get(normalizeAgentId(agentId));
    if (boundAccounts && boundAccounts.length > 0) {
      accountId = boundAccounts[0];
    }
  }

  // Carry threadId when it was explicitly set (from :topic: parsing or config)
  // or when delivering to the same recipient as the session's last conversation.
  // Session-derived threadIds are dropped when the target differs to prevent
  // stale thread IDs from leaking to a different chat.
  const threadId =
    resolved.threadId &&
    (resolved.threadIdExplicit || (resolved.to && resolved.to === resolved.lastTo))
      ? resolved.threadId
      : undefined;

  if (!toCandidate) {
    return {
      channel,
      to: undefined,
      accountId,
      threadId,
      mode,
    };
  }

  const docked = resolveOutboundTarget({
    channel,
    to: toCandidate,
    cfg,
    accountId,
    mode,
  });
  return {
    channel,
    to: docked.ok ? docked.to : undefined,
    accountId,
    threadId,
    mode,
    error: docked.ok ? undefined : docked.error,
  };
}
