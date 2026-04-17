import { commandsLightTestFiles } from "./vitest.commands-light-paths.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createCommandsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(["src/commands/**/*.test.ts"], {
    dir: "src/commands",
    env,
    exclude: [...commandsLightTestFiles, "src/commands/agent.acp.test.ts"],
    name: "commands",
  });
}

export default createCommandsVitestConfig();
