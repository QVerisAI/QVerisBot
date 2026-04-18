import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  copyStaticExtensionAssets,
  listStaticExtensionAssetOutputs,
  rewriteBundledExtensionPackageSelfImports,
  rewritePackageSelfImportsInSource,
  writeStableRootRuntimeAliases,
} from "../../scripts/runtime-postbuild.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();

describe("runtime postbuild static assets", () => {
  it("tracks plugin-owned static assets that release packaging must ship", () => {
    expect(listStaticExtensionAssetOutputs()).toContain(
      "dist/extensions/diffs/assets/viewer-runtime.js",
    );
  });

  it("copies declared static assets into dist", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const src = "extensions/acpx/src/runtime-internals/mcp-proxy.mjs";
    const dest = "dist/extensions/acpx/mcp-proxy.mjs";
    const sourcePath = path.join(rootDir, src);
    const destPath = path.join(rootDir, dest);
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, "proxy-data\n", "utf8");

    copyStaticExtensionAssets({
      rootDir,
      assets: [{ src, dest }],
    });

    expect(await fs.readFile(destPath, "utf8")).toBe("proxy-data\n");
  });

  it("warns when a declared static asset is missing", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const warn = vi.fn();

    copyStaticExtensionAssets({
      rootDir,
      assets: [{ src: "missing/file.mjs", dest: "dist/file.mjs" }],
      warn,
    });

    expect(warn).toHaveBeenCalledWith(
      "[runtime-postbuild] static asset not found, skipping: missing/file.mjs",
    );
  });

  it("writes stable aliases for hashed root runtime modules", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const distDir = path.join(rootDir, "dist");
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(
      path.join(distDir, "runtime-model-auth.runtime-XyZ987.js"),
      "export const auth = true;\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(distDir, "runtime-tts.runtime-AbCd1234.js"),
      "export const tts = true;\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(distDir, "library-Other123.js"),
      "export const x = true;\n",
      "utf8",
    );

    writeStableRootRuntimeAliases({ rootDir });

    expect(await fs.readFile(path.join(distDir, "runtime-model-auth.runtime.js"), "utf8")).toBe(
      'export * from "./runtime-model-auth.runtime-XyZ987.js";\n',
    );
    expect(await fs.readFile(path.join(distDir, "runtime-tts.runtime.js"), "utf8")).toBe(
      'export * from "./runtime-tts.runtime-AbCd1234.js";\n',
    );
    await expect(fs.stat(path.join(distDir, "library.js"))).rejects.toThrow();
  });
});

describe("runtime postbuild package self imports", () => {
  it("rewrites bundled extension self imports to the published package name", () => {
    const source = [
      'import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";',
      'import "openclaw/plugin-sdk/runtime";',
      'const loadSetup = () => import("openclaw/plugin-sdk/setup-runtime");',
      'const compat = require("openclaw/plugin-sdk/compat");',
      'const docs = "https://github.com/openclaw/openclaw";',
    ].join("\n");

    expect(rewritePackageSelfImportsInSource(source, "@qverisai/qverisbot")).toBe(
      [
        'import { defineBundledChannelEntry } from "@qverisai/qverisbot/plugin-sdk/channel-entry-contract";',
        'import "@qverisai/qverisbot/plugin-sdk/runtime";',
        'const loadSetup = () => import("@qverisai/qverisbot/plugin-sdk/setup-runtime");',
        'const compat = require("@qverisai/qverisbot/plugin-sdk/compat");',
        'const docs = "https://github.com/openclaw/openclaw";',
      ].join("\n"),
    );
  });

  it("rewrites dist extension entry files in place", async () => {
    const rootDir = createTempDir("openclaw-runtime-postbuild-");
    const entryPath = path.join(rootDir, "dist", "extensions", "discord", "index.js");
    await fs.mkdir(path.dirname(entryPath), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ name: "@qverisai/qverisbot" }),
      "utf8",
    );
    await fs.writeFile(
      entryPath,
      'import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";\n',
      "utf8",
    );

    expect(rewriteBundledExtensionPackageSelfImports({ rootDir })).toBe(1);
    expect(await fs.readFile(entryPath, "utf8")).toBe(
      'import { defineBundledChannelEntry } from "@qverisai/qverisbot/plugin-sdk/channel-entry-contract";\n',
    );
  });
});
