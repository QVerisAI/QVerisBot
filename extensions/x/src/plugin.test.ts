/**
 * Tests for X channel plugin.
 */

import { describe, it, expect } from "vitest";
import { xPlugin } from "./plugin.js";

describe("X plugin", () => {
  describe("messaging.targetResolver.looksLikeId", () => {
    const looksLikeId = xPlugin.messaging?.targetResolver?.looksLikeId;

    it("should exist", () => {
      expect(looksLikeId).toBeTypeOf("function");
    });

    it("should recognize x:user: format", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("x:user:1566488849252958208")).toBe(true);
      expect(looksLikeId("x:user:123456789")).toBe(true);
    });

    it("should recognize x:tweet: format", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("x:tweet:1566488849252958208")).toBe(true);
      expect(looksLikeId("x:tweet:987654321")).toBe(true);
    });

    it("should recognize user: format without x prefix", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("user:1566488849252958208")).toBe(true);
      expect(looksLikeId("user:123456789")).toBe(true);
    });

    it("should recognize bare numeric IDs (10+ digits)", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("1566488849252958208")).toBe(true);
      expect(looksLikeId("1234567890")).toBe(true);
    });

    it("should recognize @username format", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("@wanglinfang2")).toBe(true);
      expect(looksLikeId("@elonmusk")).toBe(true);
      expect(looksLikeId("@a")).toBe(true);
      expect(looksLikeId("@user_name")).toBe(true);
    });

    it("should reject invalid @username formats", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("@")).toBe(false);
      expect(looksLikeId("@user_name_too_long_for_twitter")).toBe(false);
    });

    it("should recognize X/Twitter URLs", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("https://x.com/elonmusk")).toBe(true);
      expect(looksLikeId("https://x.com/user/status/1234567890123456789")).toBe(true);
      expect(looksLikeId("https://twitter.com/user/status/1234567890123456789")).toBe(true);
      expect(looksLikeId("http://x.com/foo")).toBe(true);
      expect(looksLikeId("https://www.x.com/bar")).toBe(true);
    });

    it("should reject invalid formats", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("")).toBe(false);
      expect(looksLikeId("   ")).toBe(false);
      expect(looksLikeId("not-a-user-id")).toBe(false);
      expect(looksLikeId("123")).toBe(false);
      expect(looksLikeId("x:invalid:123")).toBe(false);
      expect(looksLikeId("wanglinfang2")).toBe(false);
      expect(looksLikeId("search")).toBe(false);
      expect(looksLikeId("x-timeline:wanglinfang2")).toBe(false);
    });

    it("should handle whitespace", () => {
      if (!looksLikeId) return;
      expect(looksLikeId("  x:user:1566488849252958208  ")).toBe(true);
      expect(looksLikeId("  1234567890  ")).toBe(true);
      expect(looksLikeId("  @elonmusk  ")).toBe(true);
    });
  });
});
