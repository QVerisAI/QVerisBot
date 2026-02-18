#!/usr/bin/env node

// PATH diagnostic for global installs.
// Runs automatically after `npm i -g @qverisai/qverisbot`.
// Local (non-global) installs exit immediately with no output.

if (process.env.npm_config_global !== "true") {
  process.exit(0);
}

import { execSync } from "node:child_process";
import { basename, delimiter, join } from "node:path";

try {
  const npmPrefix = execSync("npm config get prefix", {
    encoding: "utf-8",
    timeout: 5_000,
  }).trim();
  const binDir = join(npmPrefix, "bin");
  const pathDirs = (process.env.PATH || "").split(delimiter);

  // Normalise trailing slashes for comparison
  const norm = (p) => p.replace(/\/+$/, "");
  if (pathDirs.some((d) => norm(d) === norm(binDir))) {
    // PATH looks good — nothing to report
    process.exit(0);
  }

  const shell = basename(process.env.SHELL || "bash");
  let rcFile;
  let addCmd;

  if (shell === "zsh") {
    rcFile = "~/.zshrc";
    addCmd = `echo 'export PATH="${binDir}:$PATH"' >> ${rcFile} && source ${rcFile}`;
  } else if (shell === "fish") {
    rcFile = "~/.config/fish/config.fish";
    addCmd = `echo 'set -gx PATH "${binDir}" $PATH' >> ${rcFile} && source ${rcFile}`;
  } else {
    rcFile = "~/.bashrc";
    addCmd = `echo 'export PATH="${binDir}:$PATH"' >> ${rcFile} && source ${rcFile}`;
  }

  const line = "=".repeat(64);
  console.log("");
  console.log(line);
  console.log("  WARNING: npm global bin directory is NOT in your PATH");
  console.log(line);
  console.log("");
  console.log("  The 'qverisbot' command won't be found until you fix this.");
  console.log("");
  console.log("  Fix (one-time, recommended):");
  console.log("");
  console.log(`    ${addCmd}`);
  console.log("");
  console.log("  Or run directly with full path:");
  console.log("");
  console.log(`    ${binDir}/qverisbot onboard`);
  console.log("");
  console.log("  Or use npx (no PATH change needed):");
  console.log("");
  console.log("    npx @qverisai/qverisbot onboard");
  console.log("");
  console.log(line);
  console.log("");
} catch {
  // Silent — never block installation
}
