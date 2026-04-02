export {
  SEARCH_PROVIDER_OPTIONS,
  applySearchKey,
  applySearchProviderSelection,
  hasExistingKey,
  hasKeyInEnv,
  resolveExistingKey,
  resolveSearchProviderOptions,
  resolveSearchProviderSignupUrl,
  runSearchSetupFlow as setupSearch,
} from "../flows/search-setup.js";
export type { SearchProvider, SetupSearchOptions } from "../flows/search-setup.js";
