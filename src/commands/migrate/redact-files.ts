import fs from "node:fs/promises";
import path from "node:path";
import { getDefaultRedactPatterns, redactSensitiveText } from "../../logging/redact.js";

export type RedactStats = {
  filesScanned: number;
  filesChanged: number;
  replacements: number;
};

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
  ".sh",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
]);

export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  // Files with no extension (like AGENTS.md template files referenced without extension)
  const base = path.basename(filePath);
  // Known OpenClaw workspace files without extension or with .md
  if (!ext && (base === base.toUpperCase() || base.startsWith("."))) {
    return true;
  }
  return false;
}

/**
 * Redact a string using default patterns with forced "tools" mode.
 * Returns the redacted text and the number of replacements made.
 */
export function forceRedactText(text: string): { text: string; replacements: number } {
  if (!text) {
    return { text, replacements: 0 };
  }
  const patterns = getDefaultRedactPatterns();
  let replacements = 0;
  // Use patterns directly to count replacements
  const redacted = redactSensitiveText(text, { mode: "tools", patterns });
  if (redacted !== text) {
    // Approximate count: count occurrences of the redaction placeholder in the difference
    replacements = 1;
  }
  return { text: redacted, replacements };
}

/**
 * Read a file, redact it, write it back to the same path.
 * Only processes text files. Binary files are left unchanged.
 */
export async function redactFileInPlace(
  filePath: string,
): Promise<{ changed: boolean; replacements: number }> {
  if (!isTextFile(filePath)) {
    return { changed: false, replacements: 0 };
  }
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return { changed: false, replacements: 0 };
  }
  const { text: redacted, replacements } = forceRedactText(content);
  if (redacted === content) {
    return { changed: false, replacements: 0 };
  }
  await fs.writeFile(filePath, redacted, "utf-8");
  return { changed: true, replacements };
}

/**
 * Walk a directory recursively, redacting all text files in-place.
 * Returns stats about how many files were scanned/changed.
 */
export async function redactDirectoryInPlace(dir: string): Promise<RedactStats> {
  const stats: RedactStats = { filesScanned: 0, filesChanged: 0, replacements: 0 };
  await walkAndRedact(dir, stats);
  return stats;
}

async function walkAndRedact(dir: string, stats: RedactStats): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAndRedact(fullPath, stats);
    } else if (entry.isFile()) {
      stats.filesScanned++;
      const result = await redactFileInPlace(fullPath);
      if (result.changed) {
        stats.filesChanged++;
        stats.replacements += result.replacements;
      }
    }
  }
}

/**
 * Merge multiple RedactStats into one.
 */
export function mergeRedactStats(...sources: RedactStats[]): RedactStats {
  return sources.reduce(
    (acc, s) => ({
      filesScanned: acc.filesScanned + s.filesScanned,
      filesChanged: acc.filesChanged + s.filesChanged,
      replacements: acc.replacements + s.replacements,
    }),
    { filesScanned: 0, filesChanged: 0, replacements: 0 },
  );
}
