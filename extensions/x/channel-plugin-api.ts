// Keep bundled channel entry imports narrow so package discovery does not load
// the wider X runtime and onboarding graph just to read the entry contract.
export { xPlugin } from "./src/plugin.js";
