import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { xPlugin } from "./src/plugin.js";
import { setXRuntime } from "./src/runtime.js";

const plugin = {
  id: "x",
  name: "X (Twitter)",
  description: "X (Twitter) channel plugin - monitor mentions and reply to tweets",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    setXRuntime(api.runtime);
    api.registerChannel({ plugin: xPlugin as any });
  },
};

export default plugin;
