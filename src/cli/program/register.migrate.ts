import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerMigrateCommands(program: Command) {
  const migrate = program
    .command("migrate")
    .description("Export, import, and diagnose bot experience bundles");

  migrate
    .command("export")
    .description("Export bot experience (workspace, skills, session summaries) to a bundle")
    .option(
      "--output <path>",
      "Output file path (default: ./qverisbot-experience-<timestamp>.tar.gz)",
    )
    .option("--agent <id>", "Export a single agent only (default: all agents)")
    .option("--max-sessions <n>", "Maximum sessions to include per agent (default: 200)", parseInt)
    .option("--no-sessions", "Skip session summary export")
    .option("--no-skills", "Skip managed and personal skills")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { migrateExport } = await import("../../commands/migrate/export.js");
        await migrateExport(defaultRuntime, {
          output: opts.output,
          agentId: opts.agent,
          maxSessions: opts.maxSessions,
          noSessions: opts.sessions === false,
          noSkills: opts.skills === false,
        });
      });
    });

  migrate
    .command("import <bundle>")
    .description("Import a bot experience bundle (local file path or http/https URL)")
    .option("--workspace <path>", "Target workspace base directory for imported agents")
    .option(
      "--overwrite",
      "Overwrite existing workspace files (default: merge, skip existing)",
      false,
    )
    .option("--skip-sessions-reset", "Do NOT reset sessions for imported agents", false)
    .option("--skip-service-sync", "Do NOT reinstall the gateway service after import", false)
    .option("--yes", "Skip interactive confirmations", false)
    .option("--json", "Machine-readable JSON output", false)
    .action(async (bundle: string, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { migrateImport } = await import("../../commands/migrate/import.js");
        await migrateImport(defaultRuntime, bundle, {
          workspace: opts.workspace,
          overwrite: Boolean(opts.overwrite),
          skipSessionsReset: Boolean(opts.skipSessionsReset),
          skipServiceSync: Boolean(opts.skipServiceSync),
          yes: Boolean(opts.yes),
          json: Boolean(opts.json),
        });
      });
    });

  migrate
    .command("doctor")
    .description("Diagnose migration-related issues: path poison, token drift, session problems")
    .option("--bundle <path>", "Validate a bundle file and show what would be imported")
    .option("--json", "Machine-readable JSON output", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { migrateDoctor } = await import("../../commands/migrate/doctor.js");
        await migrateDoctor(defaultRuntime, {
          bundle: opts.bundle,
          json: Boolean(opts.json),
        });
      });
    });
}
