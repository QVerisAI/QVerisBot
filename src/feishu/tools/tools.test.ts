/**
 * Tests for Feishu tools (doc, wiki, drive, perm).
 */
import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import {
  createFeishuDocTool,
  createFeishuWikiTool,
  createFeishuDriveTool,
  createFeishuPermTool,
  createFeishuTools,
} from "./index.js";

// Minimal config with Feishu credentials for testing tool creation
const minimalConfig: OpenClawConfig = {
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_test123",
      appSecret: "test_secret",
    },
  },
};

// Config without Feishu
const noFeishuConfig: OpenClawConfig = {};

// Config with tools disabled
const toolsDisabledConfig: OpenClawConfig = {
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_test123",
      appSecret: "test_secret",
      tools: {
        doc: false,
        wiki: false,
        drive: false,
        perm: false,
      },
    },
  },
};

// Config with perm tool enabled
const permEnabledConfig: OpenClawConfig = {
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_test123",
      appSecret: "test_secret",
      tools: {
        perm: true,
      },
    },
  },
};

describe("Feishu tools creation", () => {
  describe("createFeishuDocTool", () => {
    it("returns tool when Feishu is configured", () => {
      const tool = createFeishuDocTool(minimalConfig);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("feishu_doc");
      expect(tool?.label).toBe("Feishu Doc");
    });

    it("returns null when Feishu is not configured", () => {
      const tool = createFeishuDocTool(noFeishuConfig);
      expect(tool).toBeNull();
    });

    it("returns null when doc tool is disabled", () => {
      const tool = createFeishuDocTool(toolsDisabledConfig);
      expect(tool).toBeNull();
    });
  });

  describe("createFeishuWikiTool", () => {
    it("returns tool when Feishu is configured", () => {
      const tool = createFeishuWikiTool(minimalConfig);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("feishu_wiki");
      expect(tool?.label).toBe("Feishu Wiki");
    });

    it("returns null when Feishu is not configured", () => {
      const tool = createFeishuWikiTool(noFeishuConfig);
      expect(tool).toBeNull();
    });

    it("returns null when wiki tool is disabled", () => {
      const tool = createFeishuWikiTool(toolsDisabledConfig);
      expect(tool).toBeNull();
    });
  });

  describe("createFeishuDriveTool", () => {
    it("returns tool when Feishu is configured", () => {
      const tool = createFeishuDriveTool(minimalConfig);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("feishu_drive");
      expect(tool?.label).toBe("Feishu Drive");
    });

    it("returns null when Feishu is not configured", () => {
      const tool = createFeishuDriveTool(noFeishuConfig);
      expect(tool).toBeNull();
    });

    it("returns null when drive tool is disabled", () => {
      const tool = createFeishuDriveTool(toolsDisabledConfig);
      expect(tool).toBeNull();
    });
  });

  describe("createFeishuPermTool", () => {
    it("returns null by default (opt-in)", () => {
      const tool = createFeishuPermTool(minimalConfig);
      expect(tool).toBeNull();
    });

    it("returns tool when perm is explicitly enabled", () => {
      const tool = createFeishuPermTool(permEnabledConfig);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("feishu_perm");
      expect(tool?.label).toBe("Feishu Perm");
    });

    it("returns null when Feishu is not configured", () => {
      const tool = createFeishuPermTool(noFeishuConfig);
      expect(tool).toBeNull();
    });
  });

  describe("createFeishuTools", () => {
    it("returns all enabled tools when Feishu is configured", () => {
      const tools = createFeishuTools(minimalConfig);
      // By default: doc, wiki, drive enabled; perm disabled
      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toEqual(["feishu_doc", "feishu_wiki", "feishu_drive"]);
    });

    it("returns empty array when Feishu is not configured", () => {
      const tools = createFeishuTools(noFeishuConfig);
      expect(tools).toHaveLength(0);
    });

    it("returns empty array when all tools are disabled", () => {
      const tools = createFeishuTools(toolsDisabledConfig);
      expect(tools).toHaveLength(0);
    });

    it("includes perm tool when explicitly enabled", () => {
      const tools = createFeishuTools(permEnabledConfig);
      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toContain("feishu_perm");
    });
  });
});
