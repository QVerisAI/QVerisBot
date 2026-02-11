/**
 * End-to-end memory retention verification tests.
 *
 * Simulates the complete flow:
 *   1. Create session transcripts (conversations over multiple days)
 *   2. Fire /new command hooks (rolling-memory + smart-memory)
 *   3. Verify memory files are created with correct content
 *   4. Verify rolling file only retains 7 days
 *   5. Verify important conversations are persisted permanently
 *   6. Verify session-memory hook still works alongside new hooks
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../../test-helpers/workspace.js";
import { createHookEvent } from "../hooks.js";
import rollingHandler from "./rolling-memory/handler.js";
import sessionMemoryHandler from "./session-memory/handler.js";
import smartHandler from "./smart-memory/handler.js";

// -- helpers ----------------------------------------------------------------

function msgLine(role: string, content: string, timestamp?: number): string {
  const entry: Record<string, unknown> = {
    type: "message",
    message: { role, content },
  };
  if (timestamp) {
    entry.timestamp = timestamp;
  }
  return JSON.stringify(entry);
}

async function writeSessionsJson(dir: string, entries: Record<string, unknown>): Promise<string> {
  const storePath = path.join(dir, "sessions.json");
  await fs.writeFile(storePath, JSON.stringify(entries), "utf-8");
  return storePath;
}

// -- E2E tests --------------------------------------------------------------

describe("E2E: memory retention system", () => {
  it("full flow: conversation -> /new -> rolling + smart memory files created", async () => {
    const tempDir = await makeTempWorkspace("openclaw-e2e-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const now = new Date("2026-02-11T12:00:00Z");
    const day10 = new Date("2026-02-10T14:00:00Z").getTime();

    // Step 1: Create a research-type session transcript
    const researchContent = [
      msgLine("user", "Can you help me with my experiment on NLP methodology?", day10),
      msgLine("assistant", "Sure! Let me review the dataset and analysis approach.", day10 + 1000),
      msgLine(
        "user",
        "The hypothesis is that transformer models outperform RNNs on this task.",
        day10 + 2000,
      ),
      msgLine(
        "assistant",
        "Based on the findings in recent literature, that is a reasonable hypothesis.",
        day10 + 3000,
      ),
    ].join("\n");

    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "research-session.jsonl",
      content: researchContent,
    });

    // Step 2: Create sessions.json with this session
    const storePath = await writeSessionsJson(sessionsDir, {
      "agent:main:feishu:group:oc_research": {
        sessionId: "research-001",
        updatedAt: day10,
        sessionFile,
      },
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    // Step 3: Fire /new command (simulating all hooks)
    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
      previousSessionEntry: {
        sessionId: "research-001",
        sessionFile,
      },
    });
    (event as any).timestamp = now;

    // Run all three hooks
    await Promise.all([rollingHandler(event), smartHandler(event), sessionMemoryHandler(event)]);

    // Step 4: Verify rolling-7d.md was created with yesterday's content
    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const rollingContent = await fs.readFile(rollingFile, "utf-8");
    expect(rollingContent).toContain("# Rolling 7-Day Context");
    expect(rollingContent).toContain("## 2026-02-10");
    expect(rollingContent).toContain("experiment");
    expect(rollingContent).toContain("NLP methodology");

    // Step 5: Verify smart-memory created an important file
    const importantDir = path.join(tempDir, "memory", "important");
    const importantFiles = await fs.readdir(importantDir);
    expect(importantFiles.length).toBe(1);
    const importantContent = await fs.readFile(path.join(importantDir, importantFiles[0]), "utf-8");
    expect(importantContent).toContain("Category: research");
    expect(importantContent).toContain("experiment");

    // Step 6: Verify session-memory also created its own file
    const memoryDir = path.join(tempDir, "memory");
    const allFiles = await fs.readdir(memoryDir);
    // Should have: rolling-7d.md, important/ dir, and a session-memory YYYY-MM-DD-*.md
    const sessionMemoryFiles = allFiles.filter((f) => f.endsWith(".md") && f !== "rolling-7d.md");
    expect(sessionMemoryFiles.length).toBe(1);
  });

  it("7-day rolling retention: old content removed after window expires", async () => {
    const tempDir = await makeTempWorkspace("openclaw-e2e-retention-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    // Create sessions spanning 10 days (Feb 1-10)
    const storeEntries: Record<string, unknown> = {};
    for (let d = 1; d <= 10; d++) {
      const dateStr = `2026-02-${String(d).padStart(2, "0")}`;
      const ts = new Date(`${dateStr}T10:00:00Z`).getTime();
      const sessionId = `session-day-${d}`;
      const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
      await fs.writeFile(
        filePath,
        msgLine("user", `Important day ${d} conversation about research and analysis`, ts),
        "utf-8",
      );
      storeEntries[`session-key-${d}`] = {
        sessionId,
        updatedAt: ts,
        sessionFile: filePath,
      };
    }
    const storePath = await writeSessionsJson(sessionsDir, storeEntries);

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    // First /new on Feb 11: should have days 5-10
    const event1 = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    (event1 as any).timestamp = new Date("2026-02-11T12:00:00Z");
    await rollingHandler(event1);

    let rollingContent = await fs.readFile(path.join(tempDir, "memory", "rolling-7d.md"), "utf-8");
    expect(rollingContent).toContain("day 10 conversation");
    expect(rollingContent).toContain("day 5 conversation");
    expect(rollingContent).not.toContain("day 1 conversation");
    expect(rollingContent).not.toContain("day 3 conversation");

    // Simulate time passing: now it is Feb 20
    // Only days 14-20 would be in window, but our data only goes to day 10
    // So no sessions should be in window
    const event2 = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
    });
    (event2 as any).timestamp = new Date("2026-02-20T12:00:00Z");
    await rollingHandler(event2);

    rollingContent = await fs.readFile(path.join(tempDir, "memory", "rolling-7d.md"), "utf-8");
    expect(rollingContent).toContain("No conversations in the last 7 days.");
  });

  it("important files persist even after rolling file is overwritten", async () => {
    const tempDir = await makeTempWorkspace("openclaw-e2e-persist-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    // Create a research conversation
    const researchContent = [
      msgLine("user", "Lets discuss the experiment results and methodology", day10),
      msgLine("assistant", "The analysis shows the hypothesis was confirmed", day10 + 1000),
    ].join("\n");
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "research.jsonl",
      content: researchContent,
    });

    const storePath = await writeSessionsJson(sessionsDir, {
      "session-research": {
        sessionId: "research-001",
        updatedAt: day10,
        sessionFile,
      },
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    // First /new: creates important file + rolling file
    const event1 = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
      previousSessionEntry: {
        sessionId: "research-001",
        sessionFile,
      },
    });
    (event1 as any).timestamp = new Date("2026-02-11T12:00:00Z");
    await smartHandler(event1);
    await rollingHandler(event1);

    // Verify both exist
    const importantDir = path.join(tempDir, "memory", "important");
    let importantFiles = await fs.readdir(importantDir);
    expect(importantFiles.length).toBe(1);

    let rollingContent = await fs.readFile(path.join(tempDir, "memory", "rolling-7d.md"), "utf-8");
    expect(rollingContent).toContain("experiment");

    // Second /new weeks later: rolling file gets overwritten (empty), but important stays
    const event2 = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
      previousSessionEntry: {
        sessionId: "routine-002",
        // no sessionFile for routine
      },
    });
    (event2 as any).timestamp = new Date("2026-03-01T12:00:00Z");
    await smartHandler(event2);
    await rollingHandler(event2);

    // Rolling file should now show "no conversations" (nothing in last 7 days)
    rollingContent = await fs.readFile(path.join(tempDir, "memory", "rolling-7d.md"), "utf-8");
    expect(rollingContent).toContain("No conversations in the last 7 days.");

    // But important files are still there
    importantFiles = await fs.readdir(importantDir);
    expect(importantFiles.length).toBe(1);
    const persistedContent = await fs.readFile(path.join(importantDir, importantFiles[0]), "utf-8");
    expect(persistedContent).toContain("Category: research");
  });

  it("multiple hook invocations do not duplicate important files", async () => {
    const tempDir = await makeTempWorkspace("openclaw-e2e-dedup-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    const content = [
      msgLine("user", "Remember that the deadline for the grant is March 1", day10),
      msgLine("assistant", "Noted!", day10 + 1000),
    ].join("\n");
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "remember.jsonl",
      content,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "remember-001",
        sessionFile,
      },
    });

    // Run the hook twice (simulating duplicate triggers)
    await smartHandler(event);
    await smartHandler(event);

    const importantDir = path.join(tempDir, "memory", "important");
    const files = await fs.readdir(importantDir);
    // The file will be overwritten (same slug), not duplicated
    expect(files.length).toBe(1);
  });

  it("session:end triggers rolling-memory but not smart-memory", async () => {
    const tempDir = await makeTempWorkspace("openclaw-e2e-session-end-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    const content = [
      msgLine("user", "Discussing experiment methodology and analysis", day10),
      msgLine("assistant", "Good findings on the hypothesis testing", day10 + 1000),
    ].join("\n");
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "session.jsonl",
      content,
    });
    const storePath = await writeSessionsJson(sessionsDir, {
      "session-1": {
        sessionId: "sess-001",
        updatedAt: day10,
        sessionFile,
      },
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("session", "end", "agent:main:main", {
      cfg,
      storePath,
      previousSessionEntry: {
        sessionId: "sess-001",
        sessionFile,
      },
    });
    (event as any).timestamp = new Date("2026-02-11T12:00:00Z");

    await rollingHandler(event);
    await smartHandler(event);

    // Rolling-memory should have been created
    const rollingFile = path.join(tempDir, "memory", "rolling-7d.md");
    const rollingContent = await fs.readFile(rollingFile, "utf-8");
    expect(rollingContent).toContain("experiment");

    // Smart-memory should NOT have been created (only triggers on command:new)
    const importantDir = path.join(tempDir, "memory", "important");
    await expect(fs.access(importantDir)).rejects.toThrow();
  });

  it("memory files are searchable by content (string match simulation)", async () => {
    const tempDir = await makeTempWorkspace("openclaw-e2e-search-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const day10 = new Date("2026-02-10T10:00:00Z").getTime();

    // Create a specific conversation about RAG architecture
    const content = [
      msgLine("user", "Lets discuss the Auto-Coder RAG methodology paper", day10),
      msgLine(
        "assistant",
        "The experiment shows that chunking strategy matters for analysis",
        day10 + 1000,
      ),
    ].join("\n");
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "rag-session.jsonl",
      content,
    });
    const storePath = await writeSessionsJson(sessionsDir, {
      "rag-session": {
        sessionId: "rag-001",
        updatedAt: day10,
        sessionFile,
      },
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      storePath,
      previousSessionEntry: {
        sessionId: "rag-001",
        sessionFile,
      },
    });
    (event as any).timestamp = new Date("2026-02-11T12:00:00Z");

    await rollingHandler(event);
    await smartHandler(event);

    // Simulate a "search" by reading all memory files and checking content
    const memoryDir = path.join(tempDir, "memory");
    const searchQuery = "Auto-Coder RAG";

    // Check rolling file
    const rollingContent = await fs.readFile(path.join(memoryDir, "rolling-7d.md"), "utf-8");
    expect(rollingContent).toContain(searchQuery);

    // Check important files
    const importantDir = path.join(memoryDir, "important");
    const importantFiles = await fs.readdir(importantDir);
    let foundInImportant = false;
    for (const file of importantFiles) {
      const content = await fs.readFile(path.join(importantDir, file), "utf-8");
      if (content.includes(searchQuery)) {
        foundInImportant = true;
        break;
      }
    }
    expect(foundInImportant).toBe(true);
  });
});
