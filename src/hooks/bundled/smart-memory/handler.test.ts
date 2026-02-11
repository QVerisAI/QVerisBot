import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../../../test-helpers/workspace.js";
import { createHookEvent } from "../../hooks.js";
import handler from "./handler.js";
import { classifyConversation, generateSlug, buildImportantMemoryMarkdown } from "./handler.js";

// -- helpers ----------------------------------------------------------------

function createMockSessionContent(entries: Array<{ role: string; content: string }>): string {
  return entries
    .map((entry) =>
      JSON.stringify({
        type: "message",
        message: { role: entry.role, content: entry.content },
      }),
    )
    .join("\n");
}

// -- classification tests (20+ samples) -------------------------------------

describe("classifyConversation", () => {
  // -- research (should classify as research) --
  it("sample 1: RAG source code analysis", () => {
    const text = [
      "user: Can you help me analyse the Auto-Coder RAG paper and its methodology?",
      "assistant: Sure, the paper proposes a novel methodology for retrieval-augmented generation with improved experiment results.",
      "user: What about the dataset they used and their hypothesis?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("research");
  });

  it("sample 2: literature review discussion", () => {
    const text = [
      "user: I need to do a literature review on transformer architectures",
      "assistant: Here are the key references and citations you should include in your survey",
      "user: Can you help me compare findings from different papers?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("research");
  });

  it("sample 3: experiment design in Chinese", () => {
    const text = [
      "user: 我需要设计一个实验来验证这个假设",
      "assistant: 根据你的研究方向，建议采用以下方法论",
      "user: 数据集应该怎么选择？",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("research");
  });

  it("sample 4: thesis writing help", () => {
    const text = [
      "user: I'm working on my thesis about deep learning conclusions",
      "assistant: For your dissertation, the abstract should summarize key findings",
      "user: Can you help me structure the analysis section?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("research");
  });

  // -- paper (should classify as paper) --
  it("sample 5: manuscript revision", () => {
    const text = [
      "user: I got reviewer comments on my manuscript",
      "assistant: Let me help you address the revision points",
      "user: The reviewer wants me to update figure 3 and the abstract",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("paper");
  });

  it("sample 6: paper submission", () => {
    const text = [
      "user: I need to prepare the camera-ready version of my draft",
      "assistant: For the submission, make sure to update the figures",
      "user: Should I also address the rebuttal points?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("paper");
  });

  it("sample 7: Chinese paper writing", () => {
    const text = [
      "user: 帮我修改稿件的第三章",
      "assistant: 好的，我来看看这个section需要怎么修改",
      "user: 审稿人说图表不够清晰",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("paper");
  });

  // -- project (should classify as project) --
  it("sample 8: multi-step implementation project", () => {
    const text = [
      "user: What is the next step for our implementation? We finished phase 1",
      "assistant: Based on the roadmap, the next milestone is the deploy step",
      "user: Let me check the progress on the remaining tasks",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("project");
  });

  it("sample 9: sprint planning", () => {
    const text = [
      "user: We need to plan the next sprint with a deadline of March 1",
      "assistant: Here is the milestone breakdown for the release",
      "user: What about the deploy timeline?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("project");
  });

  it("sample 10: Chinese project management", () => {
    const text = [
      "user: 项目进度更新：第二阶段已完成",
      "assistant: 好的，下一步是部署测试环境",
      "user: 里程碑需要更新一下",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("project");
  });

  // -- decision (should classify as decision) --
  it("sample 11: technology choice", () => {
    const text = [
      "user: I need to make a decision between Redis and PostgreSQL for caching",
      "assistant: Let me compare the options. Here are the pros and cons",
      "user: What about the architecture implications?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("decision");
  });

  it("sample 12: design decision in Chinese", () => {
    const text = [
      "user: 我需要在两个方案之间做决策",
      "assistant: 让我对比一下这两个架构选择",
      "user: 哪个方案更适合我们的场景？",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("decision");
  });

  // -- remember (should classify as remember) --
  it("sample 13: explicit remember request", () => {
    const text = [
      "user: Please remember that my API key for service X is stored in vault",
      "assistant: Noted, I will keep that in mind",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("remember");
  });

  it("sample 14: do not forget instruction", () => {
    const text = [
      "user: Do not forget that the production server is at 10.0.0.1",
      "assistant: Got it, I will remember that",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("remember");
  });

  it("sample 15: save this context", () => {
    const text = [
      "user: Save this - the meeting with Prof. Li is scheduled for March 5",
      "assistant: Noted",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("remember");
  });

  it("sample 16: important marker", () => {
    const text = [
      "user: This is important: the deadline for the grant application is Feb 28",
      "assistant: I have noted this down",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("remember");
  });

  // -- routine (should be skipped) --
  it("sample 17: casual greeting", () => {
    const text = [
      "user: Hey, how are you?",
      "assistant: I am doing well, thanks for asking!",
      "user: That is good to hear",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 18: weather query", () => {
    const text = [
      "user: What is the weather like today in Beijing?",
      "assistant: Today in Beijing it is sunny with a high of 15C",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 19: stock price query", () => {
    const text = [
      "user: What is the current price of AAPL?",
      "assistant: Apple Inc (AAPL) is currently trading at $180.50",
      "user: Thanks, and what about TSLA?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 20: simple math question", () => {
    const text = ["user: What is 42 * 17?", "assistant: 42 * 17 = 714"].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 21: joke request", () => {
    const text = [
      "user: Tell me a joke",
      "assistant: Why did the programmer quit? Because they did not get arrays!",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 22: translation request (routine)", () => {
    const text = ["user: Translate hello world to French", "assistant: Bonjour le monde"].join(
      "\n",
    );
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 23: food recommendation (routine)", () => {
    const text = [
      "user: What should I have for lunch?",
      "assistant: How about some noodles or a salad?",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("routine");
  });

  it("sample 24: mixed conversation leans research", () => {
    const text = [
      "user: Hi, I want to discuss our experiment results",
      "assistant: Sure! The analysis shows interesting patterns",
      "user: The findings contradict the original hypothesis",
      "assistant: That is common in research. Let me help you update the conclusions.",
    ].join("\n");
    const result = classifyConversation(text);
    expect(result.category).toBe("research");
  });

  it("sample 25: single keyword is not enough for research (needs 2+)", () => {
    const text = [
      "user: I found an interesting paper about cooking",
      "assistant: What is it about?",
    ].join("\n");
    const result = classifyConversation(text);
    // "paper" alone = 1 hit, needs 2 for research
    expect(result.category).toBe("routine");
  });
});

// -- generateSlug tests -----------------------------------------------------

describe("generateSlug", () => {
  it("generates a slug from user messages", () => {
    const slug = generateSlug([{ role: "user", text: "Discussing RAG architecture patterns" }]);
    expect(slug).toContain("discussing");
    expect(slug).toContain("rag");
  });

  it("handles Chinese text", () => {
    const slug = generateSlug([{ role: "user", text: "讨论自然语言处理模型的优化方案" }]);
    expect(slug.length).toBeGreaterThan(0);
  });

  it("falls back to 'conversation' when no suitable message", () => {
    const slug = generateSlug([{ role: "assistant", text: "Hello!" }]);
    expect(slug).toBe("conversation");
  });

  it("truncates very long slugs", () => {
    const slug = generateSlug([{ role: "user", text: "A".repeat(200) + " test message here" }]);
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});

// -- buildImportantMemoryMarkdown tests -------------------------------------

describe("buildImportantMemoryMarkdown", () => {
  it("generates proper markdown structure", () => {
    const md = buildImportantMemoryMarkdown({
      category: "research",
      matchedKeywords: ["paper", "experiment"],
      messages: [
        { role: "user", text: "Let us discuss the paper" },
        { role: "assistant", text: "Sure, the experiment shows..." },
      ],
      date: "2026-02-11",
      sessionKey: "agent:main:main",
      sessionId: "test-123",
    });

    expect(md).toContain("# Important: research");
    expect(md).toContain("Date: 2026-02-11");
    expect(md).toContain("Category: research");
    expect(md).toContain("Tags: paper, experiment");
    expect(md).toContain("## Conversation");
    expect(md).toContain("Let us discuss the paper");
  });
});

// -- integration tests: full handler ----------------------------------------

describe("smart-memory handler (integration)", () => {
  it("skips non-command events", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const event = createHookEvent("session", "end", "agent:main:main", {
      workspaceDir: tempDir,
    });
    await handler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    await expect(fs.access(importantDir)).rejects.toThrow();
  });

  it("skips routine conversations", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionContent = createMockSessionContent([
      { role: "user", content: "Hi there" },
      { role: "assistant", content: "Hello! How can I help?" },
      { role: "user", content: "What time is it?" },
    ]);
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: sessionContent,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "test-123",
        sessionFile,
      },
    });

    await handler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    await expect(fs.access(importantDir)).rejects.toThrow();
  });

  it("saves research conversations to memory/important/", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionContent = createMockSessionContent([
      {
        role: "user",
        content: "Can you help me analyse the experiment results from my research?",
      },
      {
        role: "assistant",
        content: "Sure! The methodology used in the paper shows interesting findings.",
      },
      {
        role: "user",
        content: "The dataset has some outliers we need to address in our analysis.",
      },
    ]);
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: sessionContent,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "research-123",
        sessionFile,
      },
    });

    await handler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    const files = await fs.readdir(importantDir);
    expect(files.length).toBe(1);

    const content = await fs.readFile(path.join(importantDir, files[0]), "utf-8");
    expect(content).toContain("Category: research");
    expect(content).toContain("## Conversation");
  });

  it("saves paper discussions to memory/important/", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionContent = createMockSessionContent([
      {
        role: "user",
        content: "I need to revise the manuscript based on reviewer feedback",
      },
      {
        role: "assistant",
        content: "The draft needs updates to figure 4 and the abstract section",
      },
    ]);
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: sessionContent,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "paper-123",
        sessionFile,
      },
    });

    await handler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    const files = await fs.readdir(importantDir);
    expect(files.length).toBe(1);

    const content = await fs.readFile(path.join(importantDir, files[0]), "utf-8");
    expect(content).toContain("Category: paper");
  });

  it("saves remember requests to memory/important/", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionContent = createMockSessionContent([
      {
        role: "user",
        content: "Please remember that the server IP is 10.0.0.5",
      },
      { role: "assistant", content: "Got it, I will remember that." },
    ]);
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: sessionContent,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "remember-123",
        sessionFile,
      },
    });

    await handler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    const files = await fs.readdir(importantDir);
    expect(files.length).toBe(1);

    const content = await fs.readFile(path.join(importantDir, files[0]), "utf-8");
    expect(content).toContain("Category: remember");
  });

  it("handles empty session files gracefully", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: "",
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "empty-123",
        sessionFile,
      },
    });

    // Should not throw
    await handler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    await expect(fs.access(importantDir)).rejects.toThrow();
  });

  it("handles missing session file gracefully", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "missing-123",
        // no sessionFile
      },
    });

    // Should not throw
    await handler(event);
  });

  it("files in memory/important/ persist across /new resets", async () => {
    const tempDir = await makeTempWorkspace("openclaw-smart-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    // First /new with research conversation
    const sessionContent1 = createMockSessionContent([
      {
        role: "user",
        content: "Lets discuss the experiment results and methodology",
      },
      {
        role: "assistant",
        content: "The analysis shows the hypothesis was confirmed by the data",
      },
    ]);
    const sessionFile1 = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "session1.jsonl",
      content: sessionContent1,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event1 = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "session-1",
        sessionFile: sessionFile1,
      },
    });
    await handler(event1);

    // Second /new with a routine conversation
    const sessionContent2 = createMockSessionContent([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
    const sessionFile2 = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "session2.jsonl",
      content: sessionContent2,
    });

    const event2 = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "session-2",
        sessionFile: sessionFile2,
      },
    });
    await handler(event2);

    // The research file from session1 should still exist
    const importantDir = path.join(tempDir, "memory", "important");
    const files = await fs.readdir(importantDir);
    expect(files.length).toBe(1); // only one important file (from session 1)
  });
});
