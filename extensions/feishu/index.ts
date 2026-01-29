import type { MoltbotPluginApi } from "../../src/plugin-sdk/index.js";
import { emptyPluginConfigSchema } from "../../src/plugin-sdk/index.js";

import { feishuPlugin } from "./src/channel.js";

const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Feishu/Lark channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    api.registerChannel({ plugin: feishuPlugin });
  },
};

export default plugin;
