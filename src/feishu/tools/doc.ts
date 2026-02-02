/**
 * feishu_doc tool for Feishu document operations.
 *
 * Actions:
 * - get: Get document metadata
 * - raw: Get document raw content (plain text)
 * - create: Create a new document
 * - write: Replace document content with markdown (clears existing content)
 * - append: Append markdown content to document
 */

import type { AnyAgentTool } from "../../agents/tools/common.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { FeishuToolsConfig } from "../../config/types.feishu.js";
import { jsonResult } from "../../agents/tools/common.js";
import { resolveFeishuAccount } from "../accounts.js";
import { createFeishuClient, type FeishuBlock } from "../client.js";
import { FeishuDocSchema, type FeishuDocParams } from "./schemas.js";

/**
 * Resolve tools config with defaults
 */
function resolveToolsConfig(tools?: FeishuToolsConfig): Required<FeishuToolsConfig> {
  return {
    doc: tools?.doc !== false,
    wiki: tools?.wiki !== false,
    drive: tools?.drive !== false,
    perm: tools?.perm === true, // Off by default (sensitive)
  };
}

/**
 * Create the feishu_doc tool.
 */
export function createFeishuDocTool(config?: OpenClawConfig): AnyAgentTool | null {
  const feishuCfg = config?.channels?.feishu;
  if (!feishuCfg) return null;

  const account = resolveFeishuAccount({ cfg: config });
  if (account.credentials.source === "none") return null;

  const toolsCfg = resolveToolsConfig(feishuCfg.tools);
  if (!toolsCfg.doc) return null;

  const client = createFeishuClient(account.credentials, {
    timeoutMs: (account.config.timeoutSeconds ?? 30) * 1000,
  });

  return {
    name: "feishu_doc",
    label: "Feishu Doc",
    description:
      "Feishu document operations. Actions: get (metadata), raw (plain text), create, write (replace), append. Note: Tables are not supported due to Feishu API limitations.",
    parameters: FeishuDocSchema,
    execute: async (_toolCallId, params) => {
      const p = params as FeishuDocParams;

      try {
        switch (p.action) {
          case "get": {
            if (!p.document_id) {
              return jsonResult({ error: "document_id required for get action" });
            }
            const doc = await client.getDocument(p.document_id);
            return jsonResult({
              document_id: doc.document_id,
              title: doc.title,
              revision_id: doc.revision_id,
              create_time: doc.create_time,
              update_time: doc.update_time,
            });
          }

          case "raw": {
            if (!p.document_id) {
              return jsonResult({ error: "document_id required for raw action" });
            }
            const content = await client.getDocumentRawContent(p.document_id);
            return jsonResult({ content });
          }

          case "create": {
            const doc = await client.createDocument({
              folderToken: p.folder_token,
              title: p.title,
            });
            return jsonResult({
              document_id: doc.document_id,
              title: doc.title,
              revision_id: doc.revision_id,
            });
          }

          case "write": {
            if (!p.document_id) {
              return jsonResult({ error: "document_id required for write action" });
            }
            if (!p.markdown) {
              return jsonResult({ error: "markdown content required for write action" });
            }

            // Get document blocks to find existing children of the page block
            const blocksResult = await client.getDocumentBlocks(p.document_id);
            const pageBlock = blocksResult.items.find((b) => b.block_type === 1);
            if (!pageBlock) {
              return jsonResult({ error: "Document has no page block" });
            }

            // Delete existing children (to replace content)
            const childIds = pageBlock.children ?? [];
            for (const childId of childIds) {
              try {
                await client.deleteDocumentBlock(p.document_id, childId);
              } catch {
                // Ignore deletion errors
              }
            }

            // Convert markdown to blocks and add to document
            const result = await client.markdownToBlocks(
              p.document_id,
              pageBlock.block_id,
              p.markdown,
            );

            return jsonResult({
              success: true,
              document_id: p.document_id,
              blocks_created: result.children?.length ?? 0,
            });
          }

          case "append": {
            if (!p.document_id) {
              return jsonResult({ error: "document_id required for append action" });
            }
            if (!p.markdown) {
              return jsonResult({ error: "markdown content required for append action" });
            }

            // Get document blocks to find the page block
            const blocksResult = await client.getDocumentBlocks(p.document_id);
            const pageBlock = blocksResult.items.find((b) => b.block_type === 1);
            if (!pageBlock) {
              return jsonResult({ error: "Document has no page block" });
            }

            // Convert markdown to blocks and append
            const result = await client.markdownToBlocks(
              p.document_id,
              pageBlock.block_id,
              p.markdown,
            );

            return jsonResult({
              success: true,
              document_id: p.document_id,
              blocks_created: result.children?.length ?? 0,
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
