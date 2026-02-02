/**
 * Tests for Feishu mention utilities.
 */
import { describe, it, expect } from "vitest";
import {
  extractMentionTargets,
  isMentionForwardRequest,
  extractMessageBody,
  formatMentionForText,
  formatMentionAllForText,
  formatMentionForCard,
  formatMentionAllForCard,
  buildMentionedMessage,
  buildMentionedCardContent,
  type FeishuMention,
} from "./mention.js";

const botOpenId = "ou_bot123";

const makeMention = (openId: string, name: string, key: string): FeishuMention => ({
  key,
  id: { open_id: openId },
  name,
});

describe("extractMentionTargets", () => {
  it("returns empty array when no mentions", () => {
    expect(extractMentionTargets(undefined, botOpenId)).toEqual([]);
    expect(extractMentionTargets([], botOpenId)).toEqual([]);
  });

  it("extracts non-bot mentions", () => {
    const mentions = [
      makeMention("ou_user1", "Alice", "@_user_1"),
      makeMention("ou_user2", "Bob", "@_user_2"),
    ];
    const targets = extractMentionTargets(mentions, botOpenId);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual({ openId: "ou_user1", name: "Alice", key: "@_user_1" });
    expect(targets[1]).toEqual({ openId: "ou_user2", name: "Bob", key: "@_user_2" });
  });

  it("excludes bot from targets", () => {
    const mentions = [
      makeMention(botOpenId, "Bot", "@_user_1"),
      makeMention("ou_user1", "Alice", "@_user_2"),
    ];
    const targets = extractMentionTargets(mentions, botOpenId);
    expect(targets).toHaveLength(1);
    expect(targets[0].openId).toBe("ou_user1");
  });

  it("excludes mentions without open_id", () => {
    const mentions: FeishuMention[] = [
      { key: "@_user_1", id: {}, name: "Unknown" },
      makeMention("ou_user1", "Alice", "@_user_2"),
    ];
    const targets = extractMentionTargets(mentions, botOpenId);
    expect(targets).toHaveLength(1);
  });
});

describe("isMentionForwardRequest", () => {
  it("returns false when no mentions", () => {
    expect(isMentionForwardRequest(undefined, "p2p", botOpenId)).toBe(false);
    expect(isMentionForwardRequest([], "group", botOpenId)).toBe(false);
  });

  describe("in DM (p2p)", () => {
    it("returns true when any non-bot user is mentioned", () => {
      const mentions = [makeMention("ou_user1", "Alice", "@_user_1")];
      expect(isMentionForwardRequest(mentions, "p2p", botOpenId)).toBe(true);
    });

    it("returns false when only bot is mentioned", () => {
      const mentions = [makeMention(botOpenId, "Bot", "@_user_1")];
      expect(isMentionForwardRequest(mentions, "p2p", botOpenId)).toBe(false);
    });
  });

  describe("in group", () => {
    it("returns true when bot AND other user are mentioned", () => {
      const mentions = [
        makeMention(botOpenId, "Bot", "@_user_1"),
        makeMention("ou_user1", "Alice", "@_user_2"),
      ];
      expect(isMentionForwardRequest(mentions, "group", botOpenId)).toBe(true);
    });

    it("returns false when only bot is mentioned", () => {
      const mentions = [makeMention(botOpenId, "Bot", "@_user_1")];
      expect(isMentionForwardRequest(mentions, "group", botOpenId)).toBe(false);
    });

    it("returns false when only other users are mentioned (no bot)", () => {
      const mentions = [makeMention("ou_user1", "Alice", "@_user_1")];
      expect(isMentionForwardRequest(mentions, "group", botOpenId)).toBe(false);
    });
  });
});

describe("extractMessageBody", () => {
  it("removes mention placeholders from text", () => {
    const text = "@_user_1 @_user_2 hello world";
    const result = extractMessageBody(text, ["@_user_1", "@_user_2"]);
    expect(result).toBe("hello world");
  });

  it("normalizes whitespace", () => {
    const text = "@_user_1   say   hello";
    const result = extractMessageBody(text, ["@_user_1"]);
    expect(result).toBe("say hello");
  });

  it("handles special regex characters in keys", () => {
    const text = "test@_user_[1] message";
    const result = extractMessageBody(text, ["@_user_[1]"]);
    expect(result).toBe("test message");
  });
});

describe("formatMentionForText", () => {
  it("formats mention for text message", () => {
    const target = { openId: "ou_user1", name: "Alice", key: "@_user_1" };
    expect(formatMentionForText(target)).toBe('<at user_id="ou_user1">Alice</at>');
  });
});

describe("formatMentionAllForText", () => {
  it("formats @all mention for text message", () => {
    expect(formatMentionAllForText()).toBe('<at user_id="all">Everyone</at>');
  });
});

describe("formatMentionForCard", () => {
  it("formats mention for card message", () => {
    const target = { openId: "ou_user1", name: "Alice", key: "@_user_1" };
    expect(formatMentionForCard(target)).toBe("<at id=ou_user1></at>");
  });
});

describe("formatMentionAllForCard", () => {
  it("formats @all mention for card message", () => {
    expect(formatMentionAllForCard()).toBe("<at id=all></at>");
  });
});

describe("buildMentionedMessage", () => {
  it("returns original message when no targets", () => {
    expect(buildMentionedMessage([], "hello")).toBe("hello");
  });

  it("prepends mentions to message", () => {
    const targets = [
      { openId: "ou_user1", name: "Alice", key: "@_user_1" },
      { openId: "ou_user2", name: "Bob", key: "@_user_2" },
    ];
    const result = buildMentionedMessage(targets, "hello");
    expect(result).toBe('<at user_id="ou_user1">Alice</at> <at user_id="ou_user2">Bob</at> hello');
  });
});

describe("buildMentionedCardContent", () => {
  it("returns original message when no targets", () => {
    expect(buildMentionedCardContent([], "hello")).toBe("hello");
  });

  it("prepends mentions to card content", () => {
    const targets = [
      { openId: "ou_user1", name: "Alice", key: "@_user_1" },
      { openId: "ou_user2", name: "Bob", key: "@_user_2" },
    ];
    const result = buildMentionedCardContent(targets, "hello");
    expect(result).toBe("<at id=ou_user1></at> <at id=ou_user2></at> hello");
  });
});
