import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";
import { XConfigSchema } from "./src/config-schema.js";

export default defineBundledChannelEntry({
  id: "x",
  name: "X (Twitter)",
  description: "X (Twitter) channel plugin",
  importMetaUrl: import.meta.url,
  configSchema: buildChannelConfigSchema(XConfigSchema),
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "xPlugin",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setXRuntime",
  },
});
