import crypto from "node:crypto";
import os from "node:os";

export const MIGRATE_BUNDLE_VERSION = 1;

export type MigrateAgentManifest = {
  agentId: string;
  name?: string;
  model?: string;
  isDefault: boolean;
  /** Relative path inside the bundle tarball, e.g. "agents/main/workspace" */
  workspacePath: string;
};

export type MigrateRedactionStats = {
  filesScanned: number;
  filesChanged: number;
  replacements: number;
};

export type MigrateBundle = {
  version: number;
  bundleId: string;
  createdAt: string;
  sourceOS: string;
  sourceArch: string;
  /** Source home dir prefix for path-poison detection during import */
  sourceHomedir?: string;
  agents: MigrateAgentManifest[];
  hasManagedSkills: boolean;
  hasPersonalSkills: boolean;
  hasSessions: boolean;
  redaction: MigrateRedactionStats;
};

export function createBundleId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function buildManifest(params: {
  agents: MigrateAgentManifest[];
  hasManagedSkills: boolean;
  hasPersonalSkills: boolean;
  hasSessions: boolean;
  redaction: MigrateRedactionStats;
}): MigrateBundle {
  return {
    version: MIGRATE_BUNDLE_VERSION,
    bundleId: createBundleId(),
    createdAt: new Date().toISOString(),
    sourceOS: process.platform,
    sourceArch: process.arch,
    sourceHomedir: os.homedir(),
    ...params,
  };
}

export function validateManifest(raw: unknown): MigrateBundle {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid bundle: manifest.json is not an object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.version !== "number" || m.version < 1) {
    throw new Error("Invalid bundle: manifest.json missing valid version");
  }
  if (m.version > MIGRATE_BUNDLE_VERSION) {
    throw new Error(
      `Bundle version ${m.version} is newer than this tool supports (${MIGRATE_BUNDLE_VERSION}). Upgrade qverisbot and retry.`,
    );
  }
  if (!Array.isArray(m.agents)) {
    throw new Error("Invalid bundle: manifest.json missing agents array");
  }
  return raw as MigrateBundle;
}

export function buildBundleReadme(manifest: MigrateBundle): string {
  const agentLines = manifest.agents
    .map((a) => `  - ${a.agentId}${a.name ? ` (${a.name})` : ""}${a.isDefault ? " [default]" : ""}`)
    .join("\n");
  return `# qverisbot Experience Bundle

Bundle ID: ${manifest.bundleId}
Created:   ${manifest.createdAt}
Source OS: ${manifest.sourceOS} / ${manifest.sourceArch}
Agents:
${agentLines}

## Importing

Run the following on the target machine (after installing qverisbot):

  qverisbot migrate import ./path/to/this-bundle.tar.gz

Options:
  --yes                 Skip confirmation prompts
  --skip-sessions-reset Do NOT reset sessions for imported agents
  --skip-service-sync   Do NOT reinstall the gateway service

## What is included

- Agent workspace files (AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md,
  HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md, memory/, skills/, .agents/skills/)
- Managed skills (~/.openclaw/skills/)
- Personal skills (~/.agents/skills/)
- Session summaries (title + first/last message preview, no raw transcripts)

## What is NOT included

- API keys, tokens, or any credentials
- Channel configurations (Feishu, Telegram, etc.) — reconfigure on the target
- Raw session transcripts (JSONL files)
- Gateway service state

All exported text files were scanned for secrets and redacted before packaging.
`;
}
