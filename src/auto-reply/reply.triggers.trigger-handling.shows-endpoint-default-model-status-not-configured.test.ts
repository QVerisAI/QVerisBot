import { beforeAll, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  getRunEmbeddedPiAgentMock,
  installTriggerHandlingE2eTestHooks,
  makeCfg,
  withTempHome,
} from "./reply.triggers.trigger-handling.test-harness.js";
import { markCompleteReplyConfig } from "./reply/get-reply-fast-path.js";

vi.mock("./directive-handling.auth.js", () => ({
  formatAuthLabel: (value: { label?: string } | undefined) => value?.label ?? "missing",
  resolveAuthLabel: async () => ({ label: "missing", source: "" }),
}));

let getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig;
beforeAll(async () => {
  ({ getReplyFromConfig } = await import("./reply.js"));
});

installTriggerHandlingE2eTestHooks();

describe("trigger handling", () => {
  it("restarts when explicitly enabled", async () => {
    await withTempHome(async (home) => {
      const runEmbeddedPiAgentMock = getRunEmbeddedPiAgentMock();
      const res = await getReplyFromConfig(
        {
          Body: "  [Dec 5] /restart",
          From: "+1001",
          To: "+2000",
          CommandAuthorized: true,
        },
        {},
        markCompleteReplyConfig({
          ...makeCfg(home),
          commands: {
            restart: true,
          },
        } as OpenClawConfig),
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text?.startsWith("⚙️ Restarting") || text?.startsWith("⚠️ Restart failed")).toBe(true);
      expect(runEmbeddedPiAgentMock).not.toHaveBeenCalled();
    });
  });
  it("rejects /restart when explicitly disabled", async () => {
    await withTempHome(async (home) => {
      const runEmbeddedPiAgentMock = getRunEmbeddedPiAgentMock();
      const cfg = markCompleteReplyConfig({
        ...makeCfg(home),
        commands: { restart: false },
      } as OpenClawConfig);
      const res = await getReplyFromConfig(
        {
          Body: "/restart",
          From: "+1001",
          To: "+2000",
          CommandAuthorized: true,
        },
        {},
        cfg,
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("/restart is disabled");
      expect(runEmbeddedPiAgentMock).not.toHaveBeenCalled();
    });
  });
});
