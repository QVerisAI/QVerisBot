/**
 * feishu_drive tool for Feishu drive operations.
 *
 * Actions:
 * - list: List files in a folder
 * - meta: Get file metadata
 * - create_folder: Create a new folder
 * - move: Move a file/folder
 * - delete: Delete a file/folder
 *
 * Note: Bots don't have their own "My Space" (root folder).
 * Bots can only access files/folders that have been shared with them.
 */

import type { AnyAgentTool } from "../../agents/tools/common.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { FeishuToolsConfig } from "../../config/types.feishu.js";
import { jsonResult } from "../../agents/tools/common.js";
import { resolveFeishuAccount } from "../accounts.js";
import { createFeishuClient, type FeishuDriveFileType } from "../client.js";
import { FeishuDriveSchema, type FeishuDriveParams } from "./schemas.js";

const DRIVE_ACCESS_HINT =
  "Bots don't have their own root folder. To let the bot manage files: " +
  "1) Create a folder in your Feishu Drive, " +
  "2) Right-click the folder → Share → search for your bot name, " +
  "3) Grant appropriate permission (view/edit).";

/**
 * Resolve tools config with defaults
 */
function resolveToolsConfig(tools?: FeishuToolsConfig): Required<FeishuToolsConfig> {
  return {
    doc: tools?.doc !== false,
    wiki: tools?.wiki !== false,
    drive: tools?.drive !== false,
    perm: tools?.perm === true,
  };
}

/**
 * Create the feishu_drive tool.
 */
export function createFeishuDriveTool(config?: OpenClawConfig): AnyAgentTool | null {
  const feishuCfg = config?.channels?.feishu;
  if (!feishuCfg) return null;

  const account = resolveFeishuAccount({ cfg: config });
  if (account.credentials.source === "none") return null;

  const toolsCfg = resolveToolsConfig(feishuCfg.tools);
  if (!toolsCfg.drive) return null;

  const client = createFeishuClient(account.credentials, {
    timeoutMs: (account.config.timeoutSeconds ?? 30) * 1000,
  });

  return {
    name: "feishu_drive",
    label: "Feishu Drive",
    description:
      "Feishu drive operations. Actions: list (files in folder), meta (file info), create_folder, move, delete. Note: Bot can only access shared files/folders.",
    parameters: FeishuDriveSchema,
    execute: async (_toolCallId, params) => {
      const p = params as FeishuDriveParams;

      try {
        switch (p.action) {
          case "list": {
            const result = await client.listDriveFiles({
              folderToken: p.folder_token,
            });
            const files = result.files.map((f) => ({
              token: f.token,
              name: f.name,
              type: f.type,
              parent_token: f.parent_token,
              url: f.url,
              created_time: f.created_time,
              modified_time: f.modified_time,
            }));

            return jsonResult({
              files,
              has_more: result.has_more,
              ...(files.length === 0 && !p.folder_token && { hint: DRIVE_ACCESS_HINT }),
            });
          }

          case "meta": {
            if (!p.file_token) {
              return jsonResult({ error: "file_token required for meta action" });
            }
            if (!p.file_type) {
              return jsonResult({ error: "file_type required for meta action" });
            }
            const meta = await client.getDriveFileMeta(
              p.file_token,
              p.file_type as FeishuDriveFileType,
            );
            return jsonResult({
              doc_token: meta.doc_token,
              doc_type: meta.doc_type,
              title: meta.title,
              owner_id: meta.owner_id,
              create_time: meta.create_time,
              latest_modify_user: meta.latest_modify_user,
              latest_modify_time: meta.latest_modify_time,
            });
          }

          case "create_folder": {
            if (!p.name) {
              return jsonResult({ error: "name required for create_folder action" });
            }
            if (!p.folder_token) {
              return jsonResult({
                error: "folder_token required for create_folder action",
                hint: DRIVE_ACCESS_HINT,
              });
            }
            const result = await client.createDriveFolder(p.name, p.folder_token);
            return jsonResult({
              success: true,
              token: result.token,
              url: result.url,
            });
          }

          case "move": {
            if (!p.file_token) {
              return jsonResult({ error: "file_token required for move action" });
            }
            if (!p.file_type) {
              return jsonResult({ error: "file_type required for move action" });
            }
            if (!p.folder_token) {
              return jsonResult({ error: "folder_token (target folder) required for move action" });
            }
            await client.moveDriveFile(
              p.file_token,
              p.file_type as FeishuDriveFileType,
              p.folder_token,
            );
            return jsonResult({
              success: true,
              file_token: p.file_token,
              moved_to: p.folder_token,
            });
          }

          case "delete": {
            if (!p.file_token) {
              return jsonResult({ error: "file_token required for delete action" });
            }
            if (!p.file_type) {
              return jsonResult({ error: "file_type required for delete action" });
            }
            await client.deleteDriveFile(p.file_token, p.file_type as FeishuDriveFileType);
            return jsonResult({
              success: true,
              deleted: p.file_token,
            });
          }

          default:
            return jsonResult({ error: `Unknown action: ${(p as { action: string }).action}` });
        }
      } catch (err) {
        return jsonResult({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
