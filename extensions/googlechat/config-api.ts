// Keep the config-schema entry on a package-local barrel so bundled extension
// metadata flows stay within the extension boundary while avoiding the broader
// googlechat plugin facade.
export { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-primitives";
export { GoogleChatConfigSchema } from "openclaw/plugin-sdk/googlechat-runtime-shared";
