/**
 * Feishu tools for document, wiki, drive, and permission operations.
 *
 * These tools integrate with Feishu's Open Platform APIs to provide
 * AI agents with the ability to read/write documents, navigate knowledge bases,
 * manage files, and control permissions.
 */

export { createFeishuDocTool } from "./doc.js";
export { createFeishuWikiTool } from "./wiki.js";
export { createFeishuDriveTool } from "./drive.js";
export { createFeishuPermTool } from "./perm.js";
export type {
  FeishuDocParams,
  FeishuWikiParams,
  FeishuDriveParams,
  FeishuPermParams,
} from "./schemas.js";

import type { AnyAgentTool } from "../../agents/tools/common.js";
import type { OpenClawConfig } from "../../config/config.js";
import { createFeishuDocTool } from "./doc.js";
import { createFeishuDriveTool } from "./drive.js";
import { createFeishuPermTool } from "./perm.js";
import { createFeishuWikiTool } from "./wiki.js";

/**
 * Create all Feishu tools based on configuration.
 * Returns only tools that are enabled and properly configured.
 */
export function createFeishuTools(config?: OpenClawConfig): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [];

  const docTool = createFeishuDocTool(config);
  if (docTool) tools.push(docTool);

  const wikiTool = createFeishuWikiTool(config);
  if (wikiTool) tools.push(wikiTool);

  const driveTool = createFeishuDriveTool(config);
  if (driveTool) tools.push(driveTool);

  const permTool = createFeishuPermTool(config);
  if (permTool) tools.push(permTool);

  return tools;
}
