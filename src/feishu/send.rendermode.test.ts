/**
 * Tests for Feishu renderMode and markdown detection.
 */
import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { hasMarkdown, hasRichMarkdown, resolveUseInteractiveCard } from "./send.js";

describe("hasMarkdown", () => {
  it("detects bold text", () => {
    expect(hasMarkdown("**bold**")).toBe(true);
  });

  it("detects italic text", () => {
    expect(hasMarkdown("*italic*")).toBe(true);
  });

  it("detects strikethrough", () => {
    expect(hasMarkdown("~~strikethrough~~")).toBe(true);
  });

  it("detects inline code", () => {
    expect(hasMarkdown("`code`")).toBe(true);
  });

  it("detects links", () => {
    expect(hasMarkdown("[link](https://example.com)")).toBe(true);
  });

  it("detects headings", () => {
    expect(hasMarkdown("# H1")).toBe(true);
    expect(hasMarkdown("## H2")).toBe(true);
    expect(hasMarkdown("### H3")).toBe(true);
  });

  it("detects unordered lists", () => {
    expect(hasMarkdown("- item")).toBe(true);
    expect(hasMarkdown("* item")).toBe(true);
  });

  it("detects ordered lists", () => {
    expect(hasMarkdown("1. item")).toBe(true);
  });

  it("detects code blocks", () => {
    expect(hasMarkdown("```js\ncode\n```")).toBe(true);
  });

  it("detects tables", () => {
    expect(hasMarkdown("| col1 | col2 |")).toBe(true);
    expect(hasMarkdown("|---|---|")).toBe(true);
  });

  it("detects horizontal rules", () => {
    expect(hasMarkdown("---")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(hasMarkdown("hello world")).toBe(false);
  });
});

describe("hasRichMarkdown", () => {
  it("detects code blocks", () => {
    expect(hasRichMarkdown("```js\ncode\n```")).toBe(true);
  });

  it("detects tables", () => {
    expect(hasRichMarkdown("| col1 | col2 |")).toBe(true);
  });

  it("detects H1/H2 headings", () => {
    expect(hasRichMarkdown("# H1")).toBe(true);
    expect(hasRichMarkdown("## H2")).toBe(true);
  });

  it("does not trigger for H3+ headings", () => {
    expect(hasRichMarkdown("### H3")).toBe(false);
  });

  it("does not trigger for simple markdown", () => {
    expect(hasRichMarkdown("**bold**")).toBe(false);
    expect(hasRichMarkdown("*italic*")).toBe(false);
    expect(hasRichMarkdown("`code`")).toBe(false);
    expect(hasRichMarkdown("[link](url)")).toBe(false);
    expect(hasRichMarkdown("- item")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(hasRichMarkdown("hello world")).toBe(false);
  });
});

describe("resolveUseInteractiveCard", () => {
  const makeConfig = (renderMode?: "auto" | "raw" | "card"): OpenClawConfig => ({
    channels: {
      feishu: {
        renderMode,
      },
    },
  });

  describe("with autoRichText override", () => {
    it("returns true when autoRichText is true", () => {
      expect(resolveUseInteractiveCard(undefined, "plain text", true)).toBe(true);
    });
  });

  describe("with renderMode = raw", () => {
    it("always returns false", () => {
      const config = makeConfig("raw");
      expect(resolveUseInteractiveCard(config, "```code```")).toBe(false);
      expect(resolveUseInteractiveCard(config, "# heading")).toBe(false);
      expect(resolveUseInteractiveCard(config, "| table |")).toBe(false);
    });
  });

  describe("with renderMode = card", () => {
    it("always returns true", () => {
      const config = makeConfig("card");
      expect(resolveUseInteractiveCard(config, "plain text")).toBe(true);
      expect(resolveUseInteractiveCard(config, "hello world")).toBe(true);
    });
  });

  describe("with renderMode = auto (default)", () => {
    const config = makeConfig("auto");

    it("returns true for rich markdown (code blocks)", () => {
      expect(resolveUseInteractiveCard(config, "```js\ncode\n```")).toBe(true);
    });

    it("returns true for rich markdown (tables)", () => {
      expect(resolveUseInteractiveCard(config, "| col1 | col2 |")).toBe(true);
    });

    it("returns true for rich markdown (H1/H2)", () => {
      expect(resolveUseInteractiveCard(config, "# Heading")).toBe(true);
      expect(resolveUseInteractiveCard(config, "## Heading")).toBe(true);
    });

    it("returns false for simple markdown", () => {
      expect(resolveUseInteractiveCard(config, "**bold**")).toBe(false);
      expect(resolveUseInteractiveCard(config, "- item")).toBe(false);
    });

    it("returns false for plain text", () => {
      expect(resolveUseInteractiveCard(config, "hello world")).toBe(false);
    });
  });

  describe("with no config", () => {
    it("uses auto mode by default", () => {
      expect(resolveUseInteractiveCard(undefined, "```code```")).toBe(true);
      expect(resolveUseInteractiveCard(undefined, "plain text")).toBe(false);
    });
  });
});
