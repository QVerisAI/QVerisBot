import path from "node:path";
import { resolveConfigDir, resolveUserPath } from "../utils.js";
import { resolveBundledPluginsDir } from "./bundled-dir.js";

export type PluginSourceRoots = {
  stock?: string;
  global: string;
  workspace?: string;
};

export type PluginCacheInputs = {
  roots: PluginSourceRoots;
  loadPaths: string[];
};

function resolvePluginHostEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env || env === process.env) {
    return process.env;
  }
  const resolved = {
    ...process.env,
    ...env,
  };
  if (process.env.VITEST !== undefined) {
    resolved.VITEST = process.env.VITEST;
  }
  return resolved;
}

export function resolvePluginSourceRoots(params: {
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): PluginSourceRoots {
  const env = resolvePluginHostEnv(params.env);
  const workspaceRoot = params.workspaceDir ? resolveUserPath(params.workspaceDir, env) : undefined;
  const stock = resolveBundledPluginsDir(env);
  const global = path.join(resolveConfigDir(env), "extensions");
  const workspace = workspaceRoot ? path.join(workspaceRoot, ".openclaw", "extensions") : undefined;
  return { stock, global, workspace };
}

// Shared env-aware cache inputs for discovery, manifest, and loader caches.
export function resolvePluginCacheInputs(params: {
  workspaceDir?: string;
  loadPaths?: string[];
  env?: NodeJS.ProcessEnv;
}): PluginCacheInputs {
  const env = resolvePluginHostEnv(params.env);
  const roots = resolvePluginSourceRoots({
    workspaceDir: params.workspaceDir,
    env,
  });
  // Preserve caller order because load-path precedence follows input order.
  const loadPaths = (params.loadPaths ?? [])
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolveUserPath(entry, env));
  return { roots, loadPaths };
}
