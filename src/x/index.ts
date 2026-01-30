// X channel public exports

export { XClientManager, getOrCreateClientManager, removeClientManager } from "./client.js";
export {
  listXAccountIds,
  resolveXAccount,
  isXAccountConfigured,
  resolveDefaultXAccountId,
  DEFAULT_ACCOUNT_ID,
} from "./accounts.js";
export { probeX, type XProbeResult } from "./probe.js";
export { sendMessageX, chunkTextForX, X_CHAR_LIMIT } from "./send.js";
export { loadXPollState, saveXPollState, updateXLastTweetId } from "./state.js";
export {
  monitorXProvider,
  type XMonitorOptions,
  type XMonitorResult,
  type XMonitorDeps,
} from "./monitor.js";
export type { XAccountConfig, XMention, XSendResult, XPollState, XLogSink } from "./types.js";
