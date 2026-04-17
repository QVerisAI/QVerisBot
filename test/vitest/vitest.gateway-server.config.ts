import { canListenOnLoopbackForTests } from "../../src/test-utils/ports.ts";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

const gatewayServerBackedHttpTests = [
  "src/gateway/embeddings-http.test.ts",
  "src/gateway/models-http.test.ts",
  "src/gateway/openai-http.test.ts",
  "src/gateway/openresponses-http.test.ts",
  "src/gateway/probe.auth.integration.test.ts",
];
const LOOPBACK_LISTEN_AVAILABLE = canListenOnLoopbackForTests();

export function createGatewayServerVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(
    LOOPBACK_LISTEN_AVAILABLE
      ? ["src/gateway/**/*server*.test.ts", ...gatewayServerBackedHttpTests]
      : [],
    {
      dir: "src/gateway",
      env,
      exclude: [
        "src/gateway/server-methods/**/*.test.ts",
        "src/gateway/gateway.test.ts",
        "src/gateway/server.startup-matrix-migration.integration.test.ts",
        "src/gateway/sessions-history-http.test.ts",
      ],
      name: "gateway-server",
      passWithNoTests: !LOOPBACK_LISTEN_AVAILABLE,
    },
  );
}

export default createGatewayServerVitestConfig();
