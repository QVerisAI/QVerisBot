import { listAgentIds, resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import type { CliDeps } from "../../../cli/deps.js";
import { createDefaultDeps } from "../../../cli/deps.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { runBootOnce } from "../../../gateway/boot.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { HookHandler } from "../../hooks.js";

type BootHookContext = {
  cfg?: OpenClawConfig;
  deps?: CliDeps;
};

const log = createSubsystemLogger("hooks/boot-md");

const runBootChecklist: HookHandler = async (event) => {
  if (event.type !== "gateway" || event.action !== "startup") {
    return;
  }

  const context = (event.context ?? {}) as BootHookContext;
  if (!context.cfg) {
    return;
  }

  const deps = context.deps ?? createDefaultDeps();
  const agentIds = listAgentIds(context.cfg);
  for (const agentId of agentIds) {
    const workspaceDir = resolveAgentWorkspaceDir(context.cfg, agentId);
    const result = await runBootOnce({ cfg: context.cfg, deps, workspaceDir, agentId });
    if (result.status === "failed") {
      log.warn("boot-md failed for agent startup run", {
        agentId,
        workspaceDir,
        reason: result.reason,
      });
      continue;
    }
    if (result.status === "skipped") {
      log.debug("boot-md skipped for agent startup run", {
        agentId,
        workspaceDir,
        reason: result.reason,
      });
    }
  }
};

export default runBootChecklist;
