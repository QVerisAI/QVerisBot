import { createRequire } from "node:module";

type DotenvModule = {
  parse(src: string): Record<string, string>;
};

const require = createRequire(import.meta.url);

let dotenvModule: DotenvModule | null = null;

function loadDotenvModule(): DotenvModule {
  dotenvModule ??= require("dotenv") as DotenvModule;
  return dotenvModule;
}

export function parseDotEnv(content: string): Record<string, string> {
  return loadDotenvModule().parse(content);
}
