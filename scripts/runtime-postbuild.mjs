import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyBundledPluginMetadata } from "./copy-bundled-plugin-metadata.mjs";
import { copyPluginSdkRootAlias } from "./copy-plugin-sdk-root-alias.mjs";
import { writeTextFileIfChanged } from "./runtime-postbuild-shared.mjs";
import { stageBundledPluginRuntimeDeps } from "./stage-bundled-plugin-runtime-deps.mjs";
import { stageBundledPluginRuntime } from "./stage-bundled-plugin-runtime.mjs";
import { writeOfficialChannelCatalog } from "./write-official-channel-catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_RUNTIME_ALIAS_PATTERN = /^(?<base>.+\.(?:runtime|contract))-[A-Za-z0-9_-]+\.js$/u;
const PACKAGE_SELF_IMPORT_PATTERNS = [
  /(from\s*["'])openclaw(?=(?:\/|["']))/gu,
  /(import\s*["'])openclaw(?=(?:\/|["']))/gu,
  /(import\s*\(\s*["'])openclaw(?=(?:\/|["']))/gu,
  /(require\s*\(\s*["'])openclaw(?=(?:\/|["']))/gu,
];

/**
 * Copy static (non-transpiled) runtime assets that are referenced by their
 * source-relative path inside bundled extension code.
 *
 * Each entry: { src: repo-root-relative source, dest: dist-relative dest }
 */
export const STATIC_EXTENSION_ASSETS = [
  // acpx MCP proxy — co-deployed alongside the acpx index bundle so that
  // `path.resolve(dirname(import.meta.url), "mcp-proxy.mjs")` resolves correctly
  // at runtime from the built ACPX extension directory.
  {
    src: "extensions/acpx/src/runtime-internals/mcp-proxy.mjs",
    dest: "dist/extensions/acpx/mcp-proxy.mjs",
  },
  // diffs viewer runtime bundle — co-deployed inside the plugin package so the
  // built bundle can resolve `./assets/viewer-runtime.js` from dist.
  {
    src: "extensions/diffs/assets/viewer-runtime.js",
    dest: "dist/extensions/diffs/assets/viewer-runtime.js",
  },
];

export function listStaticExtensionAssetOutputs(params = {}) {
  const assets = params.assets ?? STATIC_EXTENSION_ASSETS;
  return assets
    .map(({ dest }) => dest.replace(/\\/g, "/"))
    .toSorted((left, right) => left.localeCompare(right));
}

export function copyStaticExtensionAssets(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const assets = params.assets ?? STATIC_EXTENSION_ASSETS;
  const fsImpl = params.fs ?? fs;
  const warn = params.warn ?? console.warn;
  for (const { src, dest } of assets) {
    const srcPath = path.join(rootDir, src);
    const destPath = path.join(rootDir, dest);
    if (fsImpl.existsSync(srcPath)) {
      fsImpl.mkdirSync(path.dirname(destPath), { recursive: true });
      fsImpl.copyFileSync(srcPath, destPath);
    } else {
      warn(`[runtime-postbuild] static asset not found, skipping: ${src}`);
    }
  }
}

function listFilesRecursive(dirPath, fsImpl) {
  let entries = [];
  try {
    entries = fsImpl.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(absolutePath, fsImpl);
    }
    return [absolutePath];
  });
}

export function rewritePackageSelfImportsInSource(sourceText, packageName) {
  if (!packageName || packageName === "openclaw") {
    return sourceText;
  }
  return PACKAGE_SELF_IMPORT_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, `$1${packageName}`),
    sourceText,
  );
}

export function rewriteBundledExtensionPackageSelfImports(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const fsImpl = params.fs ?? fs;
  const packageName =
    params.packageName ??
    JSON.parse(fsImpl.readFileSync(path.join(rootDir, "package.json"), "utf8")).name;
  const extensionsDir = path.join(rootDir, "dist", "extensions");
  let rewrittenFiles = 0;

  for (const filePath of listFilesRecursive(extensionsDir, fsImpl)) {
    if (!filePath.endsWith(".js")) {
      continue;
    }
    const current = fsImpl.readFileSync(filePath, "utf8");
    const next = rewritePackageSelfImportsInSource(current, packageName);
    if (next === current) {
      continue;
    }
    fsImpl.writeFileSync(filePath, next, "utf8");
    rewrittenFiles += 1;
  }

  return rewrittenFiles;
}

export function writeStableRootRuntimeAliases(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const distDir = path.join(rootDir, "dist");
  const fsImpl = params.fs ?? fs;
  let entries = [];
  try {
    entries = fsImpl.readdirSync(distDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(ROOT_RUNTIME_ALIAS_PATTERN);
    if (!match?.groups?.base) {
      continue;
    }
    const aliasPath = path.join(distDir, `${match.groups.base}.js`);
    writeTextFileIfChanged(aliasPath, `export * from "./${entry.name}";\n`);
  }
}

export function runRuntimePostBuild(params = {}) {
  copyPluginSdkRootAlias(params);
  copyBundledPluginMetadata(params);
  writeOfficialChannelCatalog(params);
  stageBundledPluginRuntimeDeps(params);
  stageBundledPluginRuntime(params);
  writeStableRootRuntimeAliases(params);
  copyStaticExtensionAssets(params);
  rewriteBundledExtensionPackageSelfImports(params);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runRuntimePostBuild();
}
