import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getModels, validateToolCall } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { expect, it, vi } from "vitest";
import { toToolDefinitions } from "./pi-tool-definition-adapter.js";

it("keeps filtered custom tool wrappers active without exposing default tools", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "session-tool-policy-"));
  const execute = vi.fn(async (_toolCallId: string, _params: unknown) => ({
    content: [{ type: "text" as const, text: "guarded" }],
    details: {},
  }));
  const customTools = toToolDefinitions([
    {
      name: "read",
      label: "Guarded read",
      description: "Read through the application policy wrapper",
      parameters: Type.Object({ path: Type.String() }),
      execute,
    },
  ]);
  const authStorage = AuthStorage.inMemory();
  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  try {
    const { session } = await createAgentSession({
      cwd,
      agentDir: cwd,
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
      model: getModels("anthropic")[0],
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
      resourceLoader,
      tools: customTools.map((tool) => tool.name),
      customTools,
    });
    try {
      const tools = session.agent.state.tools;
      expect(tools.map((tool) => tool.name)).toEqual(["read"]);
      const call = {
        type: "toolCall" as const,
        id: "guarded-read",
        name: "read",
        arguments: { path: "a.txt" },
      };
      const args = validateToolCall(tools, call);
      await tools[0].execute(call.id, args);
      expect(execute).toHaveBeenCalledOnce();
      expect(execute.mock.calls[0]?.[1]).toEqual({ path: "a.txt" });
      expect(() => validateToolCall(tools, { ...call, arguments: { path: 42 } })).toThrow();
    } finally {
      session.dispose();
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
