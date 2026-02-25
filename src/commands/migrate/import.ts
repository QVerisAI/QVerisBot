import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { confirm, isCancel } from "@clack/prompts";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { extractArchive } from "../../infra/archive.js";
import { fetchWithSsrFGuard } from "../../infra/net/fetch-guard.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { RuntimeEnv } from "../../runtime.js";
import { stylePromptMessage } from "../../terminal/prompt-style.js";
import { CONFIG_DIR, resolveUserPath } from "../../utils.js";
import { applyAgentConfig } from "../agents.config.js";
import { listAgentSessionDirs } from "../cleanup-utils.js";
import { validateManifest, type MigrateBundle } from "./manifest.js";

export type MigrateImportOptions = {
  workspace?: string;
  overwrite?: boolean;
  skipSessionsReset?: boolean;
  skipServiceSync?: boolean;
  yes?: boolean;
  json?: boolean;
};

function isUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function isNodeReadableStream(value: unknown): value is NodeJS.ReadableStream {
  return Boolean(value && typeof (value as NodeJS.ReadableStream).pipe === "function");
}

async function downloadBundleToTemp(url: string, runtime: RuntimeEnv): Promise<string> {
  runtime.log(`Downloading bundle from ${url}...`);
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qverisbot-import-dl-"));
  const tmpFile = path.join(tmpDir, "bundle.tar.gz");

  const { response, release } = await fetchWithSsrFGuard({
    url,
    timeoutMs: 120_000,
  });
  try {
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status} ${response.statusText})`);
    }
    const file = fs.createWriteStream(tmpFile);
    const body = response.body as unknown;
    const readable = isNodeReadableStream(body)
      ? body
      : Readable.fromWeb(body as NodeReadableStream);
    await pipeline(readable, file);
    const stat = await fsPromises.stat(tmpFile);
    runtime.log(`Downloaded ${Math.ceil(stat.size / 1024)} KB`);
    return tmpFile;
  } finally {
    await release();
  }
}

async function readManifestFromExtracted(extractDir: string): Promise<MigrateBundle> {
  const manifestPath = path.join(extractDir, "manifest.json");
  let raw: string;
  try {
    raw = await fsPromises.readFile(manifestPath, "utf-8");
  } catch {
    throw new Error("Invalid bundle: manifest.json not found. Is this a valid qverisbot bundle?");
  }
  return validateManifest(JSON.parse(raw));
}

async function copyDirRecursive(src: string, dest: string, overwrite: boolean): Promise<void> {
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fsPromises.mkdir(destPath, { recursive: true });
      await copyDirRecursive(srcPath, destPath, overwrite);
    } else if (entry.isFile()) {
      if (!overwrite) {
        try {
          await fsPromises.access(destPath);
          continue; // Skip existing files when not overwriting
        } catch {
          // Does not exist, proceed to copy
        }
      }
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

async function placeAgentWorkspace(
  extractDir: string,
  agentId: string,
  bundleWorkspacePath: string,
  targetWorkspaceDir: string,
  overwrite: boolean,
): Promise<void> {
  const srcDir = path.join(extractDir, bundleWorkspacePath);
  try {
    await fsPromises.stat(srcDir);
  } catch {
    return; // No workspace in bundle for this agent
  }
  await fsPromises.mkdir(targetWorkspaceDir, { recursive: true });
  await copyDirRecursive(srcDir, targetWorkspaceDir, overwrite);
}

async function placeManagedSkills(extractDir: string, overwrite: boolean): Promise<void> {
  const src = path.join(extractDir, "managed-skills");
  try {
    await fsPromises.stat(src);
  } catch {
    return;
  }
  const dest = path.join(CONFIG_DIR, "skills");
  await fsPromises.mkdir(dest, { recursive: true });
  await copyDirRecursive(src, dest, overwrite);
}

async function placePersonalSkills(extractDir: string, overwrite: boolean): Promise<void> {
  const src = path.join(extractDir, "personal-skills");
  try {
    await fsPromises.stat(src);
  } catch {
    return;
  }
  const dest = path.join(os.homedir(), ".agents", "skills");
  await fsPromises.mkdir(dest, { recursive: true });
  await copyDirRecursive(src, dest, overwrite);
}

function resolveTargetWorkspaceDir(
  agentId: string,
  isDefault: boolean,
  workspaceOpt?: string,
): string {
  if (workspaceOpt) {
    return resolveUserPath(workspaceOpt);
  }
  if (isDefault) {
    return resolveDefaultAgentWorkspaceDir();
  }
  // Non-default agents: ~/.openclaw/workspace-<agentId>
  const stateDir = resolveStateDir(process.env);
  return path.join(stateDir, `workspace-${agentId}`);
}

async function resetAgentSessions(agentIds: string[], runtime: RuntimeEnv): Promise<void> {
  const stateDir = resolveStateDir(process.env);
  const allSessionDirs = await listAgentSessionDirs(stateDir);
  // Filter to only the imported agents' session dirs
  const targetDirs = allSessionDirs.filter((dir) => {
    const agentDirName = path.basename(path.dirname(dir));
    return agentIds.some((id) => normalizeAgentId(agentDirName) === normalizeAgentId(id));
  });
  for (const dir of targetDirs) {
    try {
      await fsPromises.rm(dir, { recursive: true, force: true });
      runtime.log(`  Cleared sessions: ${dir}`);
    } catch (err) {
      runtime.error(`  Failed to clear sessions at ${dir}: ${String(err)}`);
    }
  }
}

async function syncGatewayToken(runtime: RuntimeEnv): Promise<void> {
  const { resolveIsNixMode } = await import("../../config/paths.js");
  if (resolveIsNixMode(process.env)) {
    runtime.log("  Nix mode: skipping gateway service sync");
    return;
  }
  try {
    const { runDaemonInstall } = await import("../../cli/daemon-cli/install.js");
    await runDaemonInstall({ force: true, json: false });
    runtime.log("  Gateway service reinstalled with current token");
  } catch (err) {
    runtime.error(`  Gateway service sync failed (non-fatal): ${String(err)}`);
    runtime.log("  Run: qverisbot gateway install --force");
  }
}

async function confirmAction(message: string, yes: boolean): Promise<boolean> {
  if (yes) {
    return true;
  }
  const result = await confirm({
    message: stylePromptMessage(message),
  });
  if (isCancel(result)) {
    return false;
  }
  return Boolean(result);
}

export async function migrateImport(
  runtime: RuntimeEnv,
  bundleArg: string,
  opts: MigrateImportOptions,
): Promise<void> {
  const yes = Boolean(opts.yes);
  let bundlePath: string;
  let tempDownloadDir: string | undefined;

  // Step 1: Resolve bundle source
  if (isUrl(bundleArg)) {
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qverisbot-import-dl-"));
    tempDownloadDir = tmpDir;
    bundlePath = await downloadBundleToTemp(bundleArg, runtime);
  } else {
    bundlePath = resolveUserPath(bundleArg);
  }

  const extractDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qverisbot-import-"));
  try {
    // Step 2: Extract archive
    runtime.log("Extracting bundle...");
    await extractArchive({
      archivePath: bundlePath,
      destDir: extractDir,
      timeoutMs: 60_000,
    });

    // Clean up download temp if applicable
    if (tempDownloadDir) {
      await fsPromises.rm(tempDownloadDir, { recursive: true, force: true }).catch(() => undefined);
      tempDownloadDir = undefined;
    }

    // Step 3: Validate manifest
    const manifest = await readManifestFromExtracted(extractDir);
    runtime.log(`Bundle: ${manifest.bundleId} (created ${manifest.createdAt})`);
    runtime.log(`  Source: ${manifest.sourceOS}/${manifest.sourceArch}`);
    runtime.log(`  Agents: ${manifest.agents.map((a) => a.agentId).join(", ")}`);

    // Step 4: Place workspaces + skills
    const cfg = loadConfig();
    const defaultAgentId = resolveDefaultAgentId(cfg);
    let nextCfg: OpenClawConfig = cfg;
    const importedAgentIds: string[] = [];

    for (const agentManifest of manifest.agents) {
      const agentId = agentManifest.agentId;
      const targetDir = resolveTargetWorkspaceDir(agentId, agentManifest.isDefault, opts.workspace);
      runtime.log(`  Placing workspace for ${agentId} → ${targetDir}`);
      await placeAgentWorkspace(
        extractDir,
        agentId,
        agentManifest.workspacePath,
        targetDir,
        Boolean(opts.overwrite),
      );
      importedAgentIds.push(agentId);

      // Update config: workspace paths only (non-secret)
      if (agentManifest.isDefault || agentId === normalizeAgentId(defaultAgentId)) {
        // Update agents.defaults.workspace for the default agent
        nextCfg = {
          ...nextCfg,
          agents: {
            ...nextCfg.agents,
            defaults: {
              ...nextCfg.agents?.defaults,
              workspace: targetDir,
            },
          },
        };
      } else {
        // Update agents.list[].workspace for non-default agents
        nextCfg = applyAgentConfig(nextCfg, {
          agentId,
          workspace: targetDir,
          ...(agentManifest.name ? { name: agentManifest.name } : {}),
          ...(agentManifest.model ? { model: agentManifest.model } : {}),
        });
      }
    }

    // Place skills
    if (manifest.hasManagedSkills) {
      runtime.log("  Placing managed skills...");
      await placeManagedSkills(extractDir, Boolean(opts.overwrite));
    }
    if (manifest.hasPersonalSkills) {
      runtime.log("  Placing personal skills...");
      await placePersonalSkills(extractDir, Boolean(opts.overwrite));
    }

    // Write updated config
    await writeConfigFile(nextCfg);
    runtime.log("Config updated.");

    // Step 6: Session reset (default: yes)
    if (!opts.skipSessionsReset) {
      const doReset = await confirmAction(
        `Reset sessions for imported agents (${importedAgentIds.join(", ")})? (Recommended to clear stale path references)`,
        yes,
      );
      if (doReset) {
        runtime.log("Resetting sessions for imported agents...");
        await resetAgentSessions(importedAgentIds, runtime);
      } else {
        runtime.log("Skipping session reset.");
      }
    }

    // Step 7: Gateway token/service sync (default: yes)
    if (!opts.skipServiceSync) {
      const doSync = await confirmAction(
        "Reinstall gateway service to sync authentication token?",
        yes,
      );
      if (doSync) {
        runtime.log("Syncing gateway service...");
        await syncGatewayToken(runtime);
      } else {
        runtime.log("Skipping gateway sync. Run: qverisbot gateway install --force");
      }
    }

    // Step 8: Print checklist
    runtime.log("\nImport complete! Next steps:");
    runtime.log("  1. Reconfigure channels (Feishu, Telegram, etc.) — run: qverisbot onboard");
    runtime.log("  2. Open the dashboard: qverisbot dashboard");
    runtime.log("  3. If Web UI shows 'token mismatch', clear browser localStorage and reload.");
    if (!opts.skipServiceSync) {
      runtime.log("  4. Start the gateway: qverisbot gateway start");
    }
  } finally {
    await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
    if (tempDownloadDir) {
      await fsPromises.rm(tempDownloadDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
