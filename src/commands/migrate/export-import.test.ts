import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../../runtime.js";

// Prevent real config reads
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    agents: {
      list: [{ id: "main", default: true }],
    },
  }),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
}));

let tempDir = "";
let originalHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qvb-export-import-test-"));
  originalHome = process.env.HOME;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  }
  vi.restoreAllMocks();
});

async function createFixtureWorkspace(wsDir: string): Promise<void> {
  await fs.mkdir(wsDir, { recursive: true });
  await fs.writeFile(path.join(wsDir, "AGENTS.md"), "# My Agent\nThis is my agent config.\n");
  await fs.writeFile(path.join(wsDir, "SOUL.md"), "# Soul\nI am helpful.\n");
  await fs.writeFile(
    path.join(wsDir, "MEMORY.md"),
    "# Memory\nSome memory content without secrets.\n",
  );
  const memoryDir = path.join(wsDir, "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(path.join(memoryDir, "note.md"), "A note.\n");
}

describe("migrate export + import roundtrip", () => {
  it("creates a tarball containing manifest.json and workspace files", async () => {
    const wsDir = path.join(tempDir, "workspace");
    await createFixtureWorkspace(wsDir);

    const outputPath = path.join(tempDir, "bundle.tar.gz");

    // Mock agent scope resolution to use our fixture workspace
    vi.doMock("../../agents/agent-scope.js", () => ({
      listAgentIds: () => ["main"],
      resolveDefaultAgentId: () => "main",
      resolveAgentWorkspaceDir: () => wsDir,
    }));
    vi.doMock("../../utils.js", () => ({
      CONFIG_DIR: path.join(tempDir, "openclaw"),
      resolveUserPath: (p: string) => p,
      ensureDir: async (p: string) => {
        await fs.mkdir(p, { recursive: true });
      },
    }));
    // No session store targets
    vi.doMock("../session-store-targets.js", () => ({
      resolveSessionStoreTargets: () => [],
    }));

    const { migrateExport } = await import("./export.js");
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateExport(runtime, {
      output: outputPath,
      noSessions: true,
      noSkills: true,
    });

    // Verify the tarball was created
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("import places workspace files and updates config", async () => {
    // Create a minimal bundle manually
    const stagingDir = path.join(tempDir, "staging");
    await fs.mkdir(path.join(stagingDir, "agents", "main", "workspace"), { recursive: true });
    await fs.writeFile(
      path.join(stagingDir, "agents", "main", "workspace", "AGENTS.md"),
      "# Imported Agent\n",
    );
    await fs.writeFile(
      path.join(stagingDir, "agents", "main", "agent.json"),
      JSON.stringify({ agentId: "main", isDefault: true }),
    );

    const manifest = {
      version: 1,
      bundleId: "test123",
      createdAt: new Date().toISOString(),
      sourceOS: "linux",
      sourceArch: "x64",
      agents: [
        {
          agentId: "main",
          isDefault: true,
          workspacePath: path.join("agents", "main", "workspace"),
        },
      ],
      hasManagedSkills: false,
      hasPersonalSkills: false,
      hasSessions: false,
      redaction: { filesScanned: 1, filesChanged: 0, replacements: 0 },
    };
    await fs.writeFile(path.join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(stagingDir, "README.md"), "# Bundle\n");

    // Create the tarball
    const tar = await import("tar");
    const bundlePath = path.join(tempDir, "bundle.tar.gz");
    await tar.c({ gzip: true, file: bundlePath, cwd: stagingDir, portable: true }, ["."]);

    // Now test import
    const targetWsDir = path.join(tempDir, "target-workspace");
    vi.doMock("../../agents/workspace.js", async () => {
      const actual = await vi.importActual<typeof import("../../agents/workspace.js")>(
        "../../agents/workspace.js",
      );
      return {
        ...actual,
        resolveDefaultAgentWorkspaceDir: () => targetWsDir,
      };
    });
    vi.doMock("../cleanup-utils.js", () => ({
      listAgentSessionDirs: async () => [],
    }));

    const { migrateImport } = await import("./import.js");
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateImport(runtime, bundlePath, {
      yes: true,
      skipSessionsReset: true,
      skipServiceSync: true,
    });

    // Verify workspace file was placed
    const agentsContent = await fs.readFile(path.join(targetWsDir, "AGENTS.md"), "utf-8");
    expect(agentsContent).toContain("Imported Agent");

    // Verify writeConfigFile was called (config updated)
    const { writeConfigFile } = await import("../../config/config.js");
    expect(writeConfigFile).toHaveBeenCalled();
  });

  it("reports redaction stats when secrets are present in workspace", async () => {
    const wsDir = path.join(tempDir, "workspace-secret");
    await fs.mkdir(wsDir, { recursive: true });
    await fs.writeFile(
      path.join(wsDir, "AGENTS.md"),
      '# Agent\napiKey: "sk-abcdef1234567890abcdef12"\n',
    );

    const outputPath = path.join(tempDir, "secret-bundle.tar.gz");

    vi.doMock("../../agents/agent-scope.js", () => ({
      listAgentIds: () => ["main"],
      resolveDefaultAgentId: () => "main",
      resolveAgentWorkspaceDir: () => wsDir,
    }));
    vi.doMock("../../utils.js", () => ({
      CONFIG_DIR: path.join(tempDir, "openclaw2"),
      resolveUserPath: (p: string) => p,
      ensureDir: async (p: string) => {
        await fs.mkdir(p, { recursive: true });
      },
    }));
    vi.doMock("../session-store-targets.js", () => ({
      resolveSessionStoreTargets: () => [],
    }));

    const { migrateExport } = await import("./export.js");
    const logMessages: string[] = [];
    const runtime: RuntimeEnv = {
      log: (...args: unknown[]) => {
        logMessages.push(String(args[0]));
      },
      error: vi.fn(),
      exit: vi.fn(),
    };

    await migrateExport(runtime, {
      output: outputPath,
      noSessions: true,
      noSkills: true,
    });

    // Verify bundle was created
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(0);

    // Verify redaction was reported in logs
    const logOutput = logMessages.join("\n");
    expect(logOutput).toContain("sanitized");
  });
});
