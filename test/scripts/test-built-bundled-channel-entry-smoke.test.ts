import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  collectBundledChannelEntryFiles,
  createBundledChannelSmokeInstallView,
} from "../../scripts/test-built-bundled-channel-entry-smoke.mjs";
import { createScriptTestHarness } from "./test-helpers.ts";

const { createTempDir } = createScriptTestHarness();

describe("test-built-bundled-channel-entry-smoke", () => {
  it("imports packaged channel entries through a temporary installed-package view", async () => {
    const packageRoot = createTempDir("openclaw-bundled-channel-smoke-");
    const rootPackageJson = {
      name: "@qverisai/qverisbot",
      type: "module",
      exports: {
        "./plugin-sdk/channel-entry-contract": "./dist/plugin-sdk/channel-entry-contract.js",
      },
    };
    await fs.writeFile(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify(rootPackageJson, null, 2)}\n`,
      "utf8",
    );
    await fs.mkdir(path.join(packageRoot, "dist", "plugin-sdk"), { recursive: true });
    await fs.writeFile(
      path.join(packageRoot, "dist", "plugin-sdk", "channel-entry-contract.js"),
      "export function defineBundledChannelEntry(entry) { return entry; }\n",
      "utf8",
    );

    const extensionRoot = path.join(packageRoot, "dist", "extensions", "discord");
    await fs.mkdir(extensionRoot, { recursive: true });
    await fs.writeFile(
      path.join(extensionRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "@openclaw/discord",
          type: "module",
          openclaw: {
            extensions: ["./index.js"],
            channel: {
              id: "discord",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(extensionRoot, "index.js"),
      [
        'import { defineBundledChannelEntry } from "@qverisai/qverisbot/plugin-sdk/channel-entry-contract";',
        "export default defineBundledChannelEntry({",
        "  kind: 'bundled-channel-entry',",
        "  loadChannelPlugin() {",
        "    return { id: 'discord' };",
        "  },",
        "});",
      ].join("\n"),
      "utf8",
    );

    const smokeInstallView = createBundledChannelSmokeInstallView({ packageRoot });
    try {
      const [entry] = collectBundledChannelEntryFiles(packageRoot);
      const imported = await import(pathToFileURL(entry.path).href);
      expect(imported.default.kind).toBe("bundled-channel-entry");
      expect(imported.default.loadChannelPlugin().id).toBe("discord");
      expect(smokeInstallView.installedPackageRoot).toBe(
        path.join(packageRoot, "node_modules", "@qverisai", "qverisbot"),
      );
      await expect(
        import(
          pathToFileURL(
            path.join(
              packageRoot,
              "node_modules",
              "openclaw",
              "dist",
              "extensions",
              "discord",
              "index.js",
            ),
          ).href
        ),
      ).resolves.toMatchObject({
        default: expect.objectContaining({
          kind: "bundled-channel-entry",
        }),
      });
    } finally {
      smokeInstallView.cleanup();
    }
  });

  it("cleans up partially created fallback paths when setup fails", () => {
    const packageRoot = "/tmp/openclaw-bundled-channel-smoke-fixture";
    const installedPackageRoot = path.join(packageRoot, "node_modules", "@qverisai", "qverisbot");
    const distLinkPath = path.join(installedPackageRoot, "dist");
    const mkdirSync = vi.fn();
    const rmSync = vi.fn();
    const fsMock = {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue('{"name":"@qverisai/qverisbot"}\n'),
      mkdirSync,
      writeFileSync: vi.fn(),
      rmSync,
      symlinkSync: vi
        .fn()
        .mockImplementationOnce(() => {
          const error = new Error("sandbox");
          Object.assign(error, { code: "EPERM" });
          throw error;
        })
        .mockImplementationOnce(() => {
          throw new Error("dist link failed");
        }),
    };

    expect(() =>
      createBundledChannelSmokeInstallView({
        packageRoot,
        fs: fsMock,
      }),
    ).toThrow("dist link failed");

    expect(mkdirSync).toHaveBeenNthCalledWith(1, path.dirname(installedPackageRoot), {
      recursive: true,
    });
    expect(mkdirSync).toHaveBeenNthCalledWith(2, installedPackageRoot, { recursive: true });
    expect(rmSync).toHaveBeenCalledTimes(1);
    expect(rmSync).toHaveBeenCalledWith(installedPackageRoot, { recursive: true, force: true });
    expect(rmSync).not.toHaveBeenCalledWith(distLinkPath, { recursive: true, force: true });
  });
});
