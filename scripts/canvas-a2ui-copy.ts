import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function getA2uiPaths(env = process.env) {
  const srcDir = env.OPENCLAW_A2UI_SRC_DIR ?? path.join(repoRoot, "src", "canvas-host", "a2ui");
  const outDir = env.OPENCLAW_A2UI_OUT_DIR ?? path.join(repoRoot, "dist", "canvas-host", "a2ui");
  return { srcDir, outDir };
}

export function shouldSkipMissingA2uiAssets(env = process.env): boolean {
  return env.OPENCLAW_A2UI_SKIP_MISSING === "1" || Boolean(env.OPENCLAW_SPARSE_PROFILE);
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function assertSafeRequiredAsset(srcDir: string, entryName: string) {
  const entryPath = path.join(srcDir, entryName);
  const stats = await fs.lstat(entryPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Invalid A2UI asset path: ${normalizeRelativePath(entryPath)}`);
  }
}

async function copyDirectoryContentsSafe(params: {
  srcDir: string;
  outDir: string;
  rootDir: string;
  warn: (message: string) => void;
}) {
  const entries = await fs.readdir(params.srcDir, { withFileTypes: true });
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const sourcePath = path.join(params.srcDir, entry.name);
    const destinationPath = path.join(params.outDir, entry.name);

    if (entry.isSymbolicLink()) {
      const relativePath = normalizeRelativePath(path.relative(params.rootDir, sourcePath));
      params.warn(`[canvas-a2ui-copy] skipping symlinked asset: ${relativePath}`);
      continue;
    }
    if (entry.isDirectory()) {
      await fs.mkdir(destinationPath, { recursive: true });
      await copyDirectoryContentsSafe({
        srcDir: sourcePath,
        outDir: destinationPath,
        rootDir: params.rootDir,
        warn: params.warn,
      });
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

export async function copyA2uiAssets(
  {
    srcDir,
    outDir,
  }: {
    srcDir: string;
    outDir: string;
  },
  params: { warn?: (message: string) => void } = {},
) {
  const skipMissing = shouldSkipMissingA2uiAssets(process.env);
  const warn = params.warn ?? console.warn;
  try {
    await assertSafeRequiredAsset(srcDir, "index.html");
    await assertSafeRequiredAsset(srcDir, "a2ui.bundle.js");
  } catch (err) {
    const message = 'Missing A2UI bundle assets. Run "pnpm canvas:a2ui:bundle" and retry.';
    if (skipMissing) {
      warn(
        `${message} Skipping copy because OPENCLAW_A2UI_SKIP_MISSING=1 or OPENCLAW_SPARSE_PROFILE is set.`,
      );
      return;
    }
    throw new Error(message, { cause: err });
  }
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await copyDirectoryContentsSafe({ srcDir, outDir, rootDir: srcDir, warn });
}

async function main() {
  const { srcDir, outDir } = getA2uiPaths();
  await copyA2uiAssets({ srcDir, outDir });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
