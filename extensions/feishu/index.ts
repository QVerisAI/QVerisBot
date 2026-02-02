import type { OpenClawPluginApi } from "../../src/plugin-sdk/index.js";
import { emptyPluginConfigSchema } from "../../src/plugin-sdk/index.js";

import { feishuPlugin } from "./src/channel.js";
import { createFeishuTools } from "../../src/feishu/tools/index.js";

const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Feishu/Lark channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Register the channel
    api.registerChannel({ plugin: feishuPlugin });

    // Register Feishu document/wiki/drive/perm tools
    // Tools are conditionally created based on config (tools.doc, tools.wiki, etc.)
    const tools = createFeishuTools(api.config);
    for (const tool of tools) {
      api.registerTool(tool, { name: tool.name });
    }
    if (tools.length > 0) {
      api.logger.info(`Registered ${tools.length} Feishu tools: ${tools.map((t) => t.name).join(", ")}`);
    }
  },
};

export default plugin;
