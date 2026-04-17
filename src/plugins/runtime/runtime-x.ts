import {
  isXAccountConfigured,
  listXAccountIds,
  resolveDefaultXAccountId,
  resolveXAccount,
} from "../../x/accounts.js";
import { removeClientManager } from "../../x/client.js";
import { monitorXProvider } from "../../x/monitor.js";
import { probeX } from "../../x/probe.js";
import { chunkTextForX, sendMessageX } from "../../x/send.js";

type RuntimeX = {
  defaultAccountId: string;
  listXAccountIds: typeof listXAccountIds;
  resolveXAccount: typeof resolveXAccount;
  isXAccountConfigured: typeof isXAccountConfigured;
  resolveDefaultXAccountId: typeof resolveDefaultXAccountId;
  chunkTextForX: typeof chunkTextForX;
  sendMessageX: typeof sendMessageX;
  probeX: typeof probeX;
  removeClientManager: typeof removeClientManager;
  monitorXProvider: typeof monitorXProvider;
};

export function createRuntimeX(): RuntimeX {
  return {
    defaultAccountId: "default",
    listXAccountIds,
    resolveXAccount,
    isXAccountConfigured,
    resolveDefaultXAccountId,
    chunkTextForX,
    sendMessageX,
    probeX,
    removeClientManager,
    monitorXProvider,
  };
}
