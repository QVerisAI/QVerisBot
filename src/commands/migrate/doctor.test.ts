import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../../runtime.js";

// Prevent real config reads
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    agents: {
      defaults: {},
      list: [{ id: "main", default: true }],
    },
  }),
}));

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qvb-doctor-test-"));
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  vi.restoreAllMocks();
});

describe("migrate doctor - workspace path checks", () => {
  it("detects /Users/ prefix on non-macOS (simulated Linux)", async () => {
    // Mock the platform check
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    vi.doMock("../../config/config.js", () => ({
      loadConfig: vi.fn().mockReturnValue({
        agents: {
          defaults: { workspace: "/Users/testuser/.openclaw/workspace" },
          list: [],
        },
      }),
    }));

    vi.doMock("../../agents/agent-scope.js", () => ({
      listAgentIds: () => ["main"],
      resolveAgentWorkspaceDir: () => "/Users/testuser/.openclaw/workspace",
    }));

    vi.doMock("../session-store-targets.js", () => ({
      resolveSessionStoreTargets: () => [],
    }));

    const { migrateDoctor } = await import("./doctor.js");
    const logs: string[] = [];
    const runtime: RuntimeEnv = {
      log: (...args: unknown[]) => {
        logs.push(String(args[0]));
      },
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateDoctor(runtime, {});

    const output = logs.join("\n");
    expect(output).toContain("foreign OS path");

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("reports no issues on clean install", async () => {
    const wsDir = path.join(tempDir, "workspace");
    await fs.mkdir(wsDir, { recursive: true });

    vi.doMock("../../config/config.js", () => ({
      loadConfig: vi.fn().mockReturnValue({
        agents: {
          defaults: { workspace: wsDir },
          list: [],
        },
      }),
    }));

    vi.doMock("../../agents/agent-scope.js", () => ({
      listAgentIds: () => ["main"],
      resolveAgentWorkspaceDir: () => wsDir,
    }));

    vi.doMock("../session-store-targets.js", () => ({
      resolveSessionStoreTargets: () => [],
    }));

    const { migrateDoctor } = await import("./doctor.js");
    const logs: string[] = [];
    const runtime: RuntimeEnv = {
      log: (...args: unknown[]) => {
        logs.push(String(args[0]));
      },
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateDoctor(runtime, {});
    const output = logs.join("\n");
    expect(output).toContain("No migration issues");
  });
});

describe("migrate doctor - session poison scan", () => {
  it("detects session store entries with foreign OS paths", async () => {
    const storePath = path.join(tempDir, "sessions.json");
    const store = {
      "key:1": {
        sessionId: "s1",
        updatedAt: Date.now(),
        sessionFile: "/Users/macuser/.openclaw/agents/main/sessions/s1.jsonl",
      },
    };
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");

    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    // Use a valid Linux workspace so only session poison issue fires
    const linuxWs = path.join(tempDir, "workspace");
    vi.doMock("../../config/config.js", () => ({
      loadConfig: vi.fn().mockReturnValue({ agents: { defaults: {}, list: [] } }),
    }));

    vi.doMock("../../agents/agent-scope.js", () => ({
      listAgentIds: () => ["main"],
      resolveAgentWorkspaceDir: () => linuxWs,
    }));

    vi.doMock("../session-store-targets.js", () => ({
      resolveSessionStoreTargets: () => [{ agentId: "main", storePath }],
    }));

    const { migrateDoctor } = await import("./doctor.js");
    const logs: string[] = [];
    const runtime: RuntimeEnv = {
      log: (...args: unknown[]) => {
        logs.push(String(args[0]));
      },
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateDoctor(runtime, {});
    const output = logs.join("\n");
    expect(output).toContain("session-store-path-poison");

    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });
});

describe("migrate doctor - JSON output", () => {
  it("outputs valid JSON when --json flag is set", async () => {
    vi.doMock("../../config/config.js", () => ({
      loadConfig: vi.fn().mockReturnValue({ agents: { list: [] } }),
    }));

    vi.doMock("../../agents/agent-scope.js", () => ({
      listAgentIds: () => ["main"],
      resolveAgentWorkspaceDir: () => path.join(tempDir, "workspace"),
    }));

    vi.doMock("../session-store-targets.js", () => ({
      resolveSessionStoreTargets: () => [],
    }));

    const { migrateDoctor } = await import("./doctor.js");
    const logs: string[] = [];
    const runtime: RuntimeEnv = {
      log: (...args: unknown[]) => {
        logs.push(String(args[0]));
      },
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateDoctor(runtime, { json: true });
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs[0]);
    expect(typeof parsed.ok).toBe("boolean");
    expect(Array.isArray(parsed.issues)).toBe(true);
  });
});
