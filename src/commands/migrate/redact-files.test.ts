import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  forceRedactText,
  isTextFile,
  redactDirectoryInPlace,
  redactFileInPlace,
} from "./redact-files.js";

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qvb-redact-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("forceRedactText", () => {
  it("redacts known secret patterns regardless of config mode", () => {
    const input = 'apiKey: "sk-abcdef1234567890abcdef12"';
    const { text: output } = forceRedactText(input);
    // The value should be redacted (not equal to input)
    expect(output).not.toBe(input);
    expect(output).not.toContain("sk-abcdef1234567890abcdef12");
  });

  it("leaves non-secret text unchanged", () => {
    const input = "Hello, this is a normal message with no secrets.";
    const { text: output, replacements } = forceRedactText(input);
    expect(output).toBe(input);
    expect(replacements).toBe(0);
  });

  it("redacts telegram bot tokens", () => {
    const input = "TOKEN=123456789:AABBccddEEffGGHHiijj-KKLLmmnnOO";
    const { text: output } = forceRedactText(input);
    expect(output).not.toContain("123456789:AABBccddEEffGGHHiijj-KKLLmmnnOO");
  });

  it("forces redaction even when content would normally pass config 'off' mode", () => {
    // forceRedactText always uses mode:"tools", never skips redaction
    const input = 'password: "super-secure-password-value-123"';
    const { text: output } = forceRedactText(input);
    expect(output).not.toContain("super-secure-password-value-123");
  });
});

describe("isTextFile", () => {
  it("recognizes .md files as text", () => {
    expect(isTextFile("/path/to/AGENTS.md")).toBe(true);
  });

  it("recognizes .json files as text", () => {
    expect(isTextFile("/path/to/config.json")).toBe(true);
  });

  it("does not classify .png as text", () => {
    expect(isTextFile("/path/to/image.png")).toBe(false);
  });

  it("does not classify .zip as text", () => {
    expect(isTextFile("/path/to/archive.zip")).toBe(false);
  });
});

describe("redactFileInPlace", () => {
  it("redacts secrets in a text file and updates it on disk", async () => {
    const filePath = path.join(tempDir, "AGENTS.md");
    await fs.writeFile(filePath, 'My agent config.\napiKey: "sk-abcdef1234567890abcdef12"\n');
    const result = await redactFileInPlace(filePath);
    expect(result.changed).toBe(true);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).not.toContain("sk-abcdef1234567890abcdef12");
  });

  it("leaves files without secrets unchanged", async () => {
    const filePath = path.join(tempDir, "README.md");
    const original = "# Hello\nThis file has no secrets.\n";
    await fs.writeFile(filePath, original);
    const result = await redactFileInPlace(filePath);
    expect(result.changed).toBe(false);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe(original);
  });

  it("skips non-text files", async () => {
    const filePath = path.join(tempDir, "image.png");
    await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = await redactFileInPlace(filePath);
    expect(result.changed).toBe(false);
  });
});

describe("redactDirectoryInPlace", () => {
  it("redacts all text files in a directory recursively", async () => {
    const subDir = path.join(tempDir, "workspace");
    await fs.mkdir(subDir);
    await fs.writeFile(
      path.join(subDir, "AGENTS.md"),
      'Agent config\ntoken: "ghp_abcdefghijklmnopqrstu12345"\n',
    );
    await fs.writeFile(path.join(subDir, "SOUL.md"), "I am an agent with no secrets.\n");

    const stats = await redactDirectoryInPlace(subDir);
    expect(stats.filesScanned).toBeGreaterThanOrEqual(2);
    expect(stats.filesChanged).toBeGreaterThanOrEqual(1);

    const agentsContent = await fs.readFile(path.join(subDir, "AGENTS.md"), "utf-8");
    expect(agentsContent).not.toContain("ghp_abcdefghijklmnopqrstu12345");
  });
});
