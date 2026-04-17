import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/x";

type XAccountConfig = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  enabled?: boolean;
  pollIntervalSeconds?: number;
  allowFrom?: string[];
  actionsAllowFrom?: string[];
  name?: string;
  proxy?: string;
};

type XMonitorDeps = {
  resolveAgentRoute: PluginRuntime["channel"]["routing"]["resolveAgentRoute"];
  formatAgentEnvelope: PluginRuntime["channel"]["reply"]["formatAgentEnvelope"];
  resolveEnvelopeFormatOptions: PluginRuntime["channel"]["reply"]["resolveEnvelopeFormatOptions"];
  finalizeInboundContext: PluginRuntime["channel"]["reply"]["finalizeInboundContext"];
  resolveStorePath: PluginRuntime["channel"]["session"]["resolveStorePath"];
  recordInboundSession: PluginRuntime["channel"]["session"]["recordInboundSession"];
  dispatchReply: (params: {
    ctx: Record<string, unknown>;
    cfg: OpenClawConfig;
    deliver: (payload: { text?: string }) => Promise<void>;
  }) => Promise<void>;
};

type XRuntimeChannel = {
  defaultAccountId: string;
  listXAccountIds: (cfg: OpenClawConfig) => string[];
  resolveXAccount: (cfg: OpenClawConfig, accountId?: string | null) => XAccountConfig | null;
  isXAccountConfigured: (account: XAccountConfig | null) => boolean;
  resolveDefaultXAccountId: (cfg: OpenClawConfig) => string;
  chunkTextForX: (text: string, limit: number) => string[];
  sendMessageX: (
    to: string | undefined,
    text: string,
    params: {
      account: XAccountConfig;
      accountId: string;
      replyToTweetId?: string;
      logger: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
        debug: (msg: string) => void;
      };
    },
  ) => Promise<{ ok: boolean; tweetId?: string; error?: string }>;
  probeX: (
    account: XAccountConfig,
    timeoutMs?: number,
  ) => Promise<{
    ok: boolean;
    profileName?: string;
    connectedAs?: string;
    details?: Record<string, unknown>;
    error?: string;
  }>;
  removeClientManager: (accountId: string) => void;
  monitorXProvider: (params: {
    account: XAccountConfig;
    accountId: string;
    config: OpenClawConfig;
    abortSignal: AbortSignal;
    logger: {
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
      debug: (msg: string) => void;
    };
    deps: XMonitorDeps;
  }) => Promise<void>;
};

let runtime: PluginRuntime | null = null;

export function setXRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getXRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("X runtime not initialized");
  }
  return runtime;
}

export function getXChannel(): XRuntimeChannel {
  return (getXRuntime().channel as Record<string, unknown>).x as XRuntimeChannel;
}
