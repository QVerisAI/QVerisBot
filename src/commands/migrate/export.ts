import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
} from "../../agents/workspace.js";
import { loadConfig, writeConfigFile as _wcf } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { RuntimeEnv } from "../../runtime.js";
import { CONFIG_DIR, resolveUserPath } from "../../utils.js";
import { resolveSessionStoreTargets } from "../session-store-targets.js";
import { buildManifest, buildBundleReadme, type MigrateAgentManifest } from "./manifest.js";
import { mergeRedactStats, redactDirectoryInPlace, type RedactStats } from "./redact-files.js";
import {
  buildSessionSummaries,
  formatSessionSummariesMarkdown,
  type SessionSummaryEntry,
} from "./sessions-summary.js";

// Core workspace files to copy (order matches bootstrap loading)
const WORKSPACE_CORE_FILES = [
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
];

// Subdirectories of the workspace to copy entirely
const WORKSPACE_SUBDIRS = ["memory", "skills", ".agents"];

// State marker file (inside .openclaw/ subdir of workspace)
const WORKSPACE_STATE_SUBPATH = path.join(".openclaw", "workspace-state.json");

export type MigrateExportOptions = {
  output?: string;
  agentId?: string;
  maxSessions?: number;
  noSessions?: boolean;
  noSkills?: boolean;
};

function defaultOutputPath(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `./qverisbot-experience-${ts}.tar.gz`;
}

async function copyFileIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return true;
  } catch {
    return false;
  }
}

async function copyDirIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await fs.stat(src);
  } catch {
    return false;
  }
  await fs.mkdir(dest, { recursive: true });
  await copyDirRecursive(src, dest);
  return true;
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function stageAgentWorkspace(
  agentId: string,
  workspaceDir: string,
  stagingDir: string,
): Promise<RedactStats> {
  const agentStagingDir = path.join(stagingDir, "agents", agentId, "workspace");
  await fs.mkdir(agentStagingDir, { recursive: true });

  // Copy core files
  for (const filename of WORKSPACE_CORE_FILES) {
    const src = path.join(workspaceDir, filename);
    const dest = path.join(agentStagingDir, filename);
    await copyFileIfExists(src, dest);
  }

  // Copy subdirs
  for (const subdir of WORKSPACE_SUBDIRS) {
    const src = path.join(workspaceDir, subdir);
    const dest = path.join(agentStagingDir, subdir);
    await copyDirIfExists(src, dest);
  }

  // Copy workspace state marker
  const stateSrc = path.join(workspaceDir, WORKSPACE_STATE_SUBPATH);
  const stateDest = path.join(agentStagingDir, WORKSPACE_STATE_SUBPATH);
  await copyFileIfExists(stateSrc, stateDest);

  // Redact all text files in the staged workspace
  return await redactDirectoryInPlace(agentStagingDir);
}

async function stageManagedSkills(stagingDir: string): Promise<RedactStats> {
  const src = path.join(CONFIG_DIR, "skills");
  const dest = path.join(stagingDir, "managed-skills");
  const copied = await copyDirIfExists(src, dest);
  if (!copied) {
    return { filesScanned: 0, filesChanged: 0, replacements: 0 };
  }
  return await redactDirectoryInPlace(dest);
}

async function stagePersonalSkills(stagingDir: string): Promise<RedactStats> {
  const src = path.join(os.homedir(), ".agents", "skills");
  const dest = path.join(stagingDir, "personal-skills");
  const copied = await copyDirIfExists(src, dest);
  if (!copied) {
    return { filesScanned: 0, filesChanged: 0, replacements: 0 };
  }
  return await redactDirectoryInPlace(dest);
}

async function dirHasContent(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function migrateExport(
  runtime: RuntimeEnv,
  opts: MigrateExportOptions,
): Promise<void> {
  const cfg = loadConfig();
  const outputPath = resolveUserPath(opts.output ?? defaultOutputPath());

  const agentIds = opts.agentId ? [opts.agentId] : listAgentIds(cfg);
  const defaultAgentId = resolveDefaultAgentId(cfg);

  runtime.log(`Exporting experience bundle for ${agentIds.length} agent(s)...`);

  // Create temp staging dir
  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), "qverisbot-export-"));
  try {
    const agentManifests: MigrateAgentManifest[] = [];
    const allRedactStats: RedactStats[] = [];
    const allSessionSummaries: Record<string, SessionSummaryEntry[]> = {};

    // Stage each agent's workspace
    for (const agentId of agentIds) {
      const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
      runtime.log(`  Agent ${agentId}: workspace ${workspaceDir}`);

      const stats = await stageAgentWorkspace(agentId, workspaceDir, stagingDir);
      allRedactStats.push(stats);

      agentManifests.push({
        agentId,
        name: resolveAgentDisplayName(cfg, agentId),
        model: resolveAgentDisplayModel(cfg, agentId),
        isDefault: agentId === defaultAgentId,
        workspacePath: path.join("agents", agentId, "workspace"),
      });
    }

    // Stage skills (unless --no-skills)
    let hasManagedSkills = false;
    let hasPersonalSkills = false;
    if (!opts.noSkills) {
      const managedStats = await stageManagedSkills(stagingDir);
      allRedactStats.push(managedStats);
      hasManagedSkills = await dirHasContent(path.join(stagingDir, "managed-skills"));

      const personalStats = await stagePersonalSkills(stagingDir);
      allRedactStats.push(personalStats);
      hasPersonalSkills = await dirHasContent(path.join(stagingDir, "personal-skills"));
    }

    // Build session summaries (unless --no-sessions)
    let hasSessions = false;
    if (!opts.noSessions) {
      const maxSessions = opts.maxSessions ?? 200;
      const targets = resolveSessionStoreTargets(cfg, { allAgents: true });
      // Filter to requested agents
      const filteredTargets = opts.agentId
        ? targets.filter((t) => t.agentId === opts.agentId)
        : targets;

      for (const target of filteredTargets) {
        const summaries = buildSessionSummaries(target, maxSessions);
        if (summaries.length > 0) {
          allSessionSummaries[target.agentId] = summaries;
          hasSessions = true;

          // Write sessions summary JSON
          const sessionsDir = path.join(stagingDir, "sessions", target.agentId);
          await fs.mkdir(sessionsDir, { recursive: true });
          await writeJsonFile(path.join(sessionsDir, "sessions-summary.json"), summaries);

          // Write sessions summary markdown
          const md = formatSessionSummariesMarkdown(summaries, target.agentId);
          await fs.writeFile(path.join(sessionsDir, "sessions-summary.md"), md, "utf-8");
        }
      }
    }

    // Build manifest
    const redactionStats = mergeRedactStats(...allRedactStats);
    const manifest = buildManifest({
      agents: agentManifests,
      hasManagedSkills,
      hasPersonalSkills,
      hasSessions,
      redaction: redactionStats,
    });

    // Write manifest + README
    await writeJsonFile(path.join(stagingDir, "manifest.json"), manifest);
    await fs.writeFile(path.join(stagingDir, "README.md"), buildBundleReadme(manifest), "utf-8");

    // Write agent.json files (sanitized metadata only)
    for (const agentManifest of agentManifests) {
      const agentJsonPath = path.join(stagingDir, "agents", agentManifest.agentId, "agent.json");
      await writeJsonFile(agentJsonPath, {
        agentId: agentManifest.agentId,
        name: agentManifest.name,
        model: agentManifest.model,
        isDefault: agentManifest.isDefault,
      });
    }

    // Create output directory if needed
    await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });

    // Pack to tarball
    runtime.log(`Packing bundle to ${outputPath}...`);
    await tar.c(
      {
        gzip: true,
        file: outputPath,
        cwd: stagingDir,
        portable: true,
      },
      ["."],
    );

    const stat = await fs.stat(outputPath);
    const sizeKb = Math.ceil(stat.size / 1024);
    runtime.log(`Done. Bundle: ${outputPath} (${sizeKb} KB)`);
    runtime.log(`  Agents: ${agentManifests.length}`);
    runtime.log(`  Managed skills: ${hasManagedSkills ? "yes" : "none"}`);
    runtime.log(`  Personal skills: ${hasPersonalSkills ? "yes" : "none"}`);
    runtime.log(
      `  Sessions: ${hasSessions ? Object.keys(allSessionSummaries).length + " agents" : "none"}`,
    );
    if (redactionStats.filesChanged > 0) {
      runtime.log(`  Redaction: ${redactionStats.filesChanged} file(s) sanitized`);
    }
    runtime.log(`\nTo import on the target machine:`);
    runtime.log(`  qverisbot migrate import ${outputPath}`);
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function resolveAgentDisplayName(cfg: OpenClawConfig, agentId: string): string | undefined {
  const list = cfg.agents?.list ?? [];
  const entry = list.find((e) => e?.id?.toLowerCase() === agentId.toLowerCase());
  const name = entry?.name?.trim();
  return name || undefined;
}

function resolveAgentDisplayModel(cfg: OpenClawConfig, agentId: string): string | undefined {
  const list = cfg.agents?.list ?? [];
  const entry = list.find((e) => e?.id?.toLowerCase() === agentId.toLowerCase());
  if (!entry?.model) {
    return undefined;
  }
  if (typeof entry.model === "string") {
    return entry.model.trim() || undefined;
  }
  if (typeof entry.model === "object") {
    const m = entry.model as { primary?: string };
    return m.primary?.trim() || undefined;
  }
  return undefined;
}
