export {
  applySearchKey,
  applySearchProviderSelection,
  hasExistingKey,
  hasKeyInEnv,
  listSearchProviderOptions,
  resolveExistingKey,
  resolveSearchProviderOptions,
  resolveSearchProviderSignupUrl,
  runSearchSetupFlow as setupSearch,
} from "../flows/search-setup.js";
export type { SearchProvider, SetupSearchOptions } from "../flows/search-setup.js";
