import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export function createAcpVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(["src/acp/**/*.test.ts", "src/commands/agent.acp.test.ts"], {
    dir: "src",
    env,
    name: "acp",
  });
}

export default createAcpVitestConfig();
