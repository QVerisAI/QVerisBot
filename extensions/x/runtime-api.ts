// Keep runtime activation narrow so the bundled channel entry only imports the
// X runtime setter when the host actually initializes the plugin.
export { setXRuntime } from "./src/runtime.js";
