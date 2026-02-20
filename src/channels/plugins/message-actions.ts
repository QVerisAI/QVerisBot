import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../config/config.js";
import { getChannelPlugin, listChannelPlugins } from "./index.js";
import type { ChannelMessageActionContext, ChannelMessageActionName } from "./types.js";

const trustedRequesterRequiredByChannel: Readonly<
  Partial<Record<string, ReadonlySet<ChannelMessageActionName>>>
> = {
  discord: new Set<ChannelMessageActionName>(["timeout", "kick", "ban"]),
};

function requiresTrustedRequesterSender(ctx: ChannelMessageActionContext): boolean {
  const actions = trustedRequesterRequiredByChannel[ctx.channel];
  return Boolean(actions?.has(ctx.action) && ctx.toolContext);
}

export function listChannelMessageActions(cfg: OpenClawConfig): ChannelMessageActionName[] {
  const actions = new Set<ChannelMessageActionName>(["send", "broadcast"]);
  for (const plugin of listChannelPlugins()) {
    const list = plugin.actions?.listActions?.({ cfg });
    if (!list) {
      continue;
    }
    for (const action of list) {
      actions.add(action);
    }
  }
  return Array.from(actions);
}

export function supportsChannelMessageButtons(cfg: OpenClawConfig): boolean {
  for (const plugin of listChannelPlugins()) {
    if (plugin.actions?.supportsButtons?.({ cfg })) {
      return true;
    }
  }
  return false;
}

export function supportsChannelMessageButtonsForChannel(params: {
  cfg: OpenClawConfig;
  channel?: string;
}): boolean {
  if (!params.channel) {
    return false;
  }
  const plugin = getChannelPlugin(params.channel as Parameters<typeof getChannelPlugin>[0]);
  return plugin?.actions?.supportsButtons?.({ cfg: params.cfg }) === true;
}

export function supportsChannelMessageCards(cfg: OpenClawConfig): boolean {
  for (const plugin of listChannelPlugins()) {
    if (plugin.actions?.supportsCards?.({ cfg })) {
      return true;
    }
  }
  return false;
}

export function supportsChannelMessageCardsForChannel(params: {
  cfg: OpenClawConfig;
  channel?: string;
}): boolean {
  if (!params.channel) {
    return false;
  }
  const plugin = getChannelPlugin(params.channel as Parameters<typeof getChannelPlugin>[0]);
  return plugin?.actions?.supportsCards?.({ cfg: params.cfg }) === true;
}

export async function dispatchChannelMessageAction(
  ctx: ChannelMessageActionContext,
): Promise<AgentToolResult<unknown> | null> {
  if (requiresTrustedRequesterSender(ctx) && !ctx.requesterSenderId?.trim()) {
    throw new Error(
      `Trusted sender identity is required for ${ctx.channel}:${ctx.action} in tool-driven contexts.`,
    );
  }
  const plugin = getChannelPlugin(ctx.channel);
  if (plugin?.actions?.handleAction) {
    const supported =
      !plugin.actions.supportsAction || plugin.actions.supportsAction({ action: ctx.action });
    if (supported) {
      return await plugin.actions.handleAction(ctx);
    }
  }

  // Cross-channel fallback: the inferred channel doesn't support this action.
  // Try other loaded channel plugins (e.g. X actions invoked from Feishu).
  for (const candidate of listChannelPlugins()) {
    if (candidate.id === ctx.channel) {
      continue;
    }
    if (!candidate.actions?.handleAction) {
      continue;
    }
    if (
      candidate.actions.supportsAction &&
      !candidate.actions.supportsAction({ action: ctx.action })
    ) {
      continue;
    }
    // Found a plugin that supports the action — dispatch with corrected channel.
    return await candidate.actions.handleAction({ ...ctx, channel: candidate.id });
  }

  return null;
}
