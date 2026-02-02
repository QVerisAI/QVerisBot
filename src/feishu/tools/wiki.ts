/**
 * feishu_wiki tool for Feishu knowledge base operations.
 *
 * Actions:
 * - spaces: List accessible wiki spaces
 * - nodes: List nodes in a space
 * - get: Get node details by token
 * - create: Create a new wiki node
 * - move: Move a wiki node
 * - rename: Rename a wiki node
 */

import type { AnyAgentTool } from "../../agents/tools/common.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { FeishuToolsConfig } from "../../config/types.feishu.js";
import { jsonResult } from "../../agents/tools/common.js";
import { resolveFeishuAccount } from "../accounts.js";
import { createFeishuClient, type FeishuWikiObjType } from "../client.js";
import { FeishuWikiSchema, type FeishuWikiParams } from "./schemas.js";

const WIKI_ACCESS_HINT =
  "To grant wiki access: Open wiki space → Settings → Members → Add the bot. " +
  "See: https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa#a40ad4ca";

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
 * Create the feishu_wiki tool.
 */
export function createFeishuWikiTool(config?: OpenClawConfig): AnyAgentTool | null {
  const feishuCfg = config?.channels?.feishu;
  if (!feishuCfg) return null;

  const account = resolveFeishuAccount({ cfg: config });
  if (account.credentials.source === "none") return null;

  const toolsCfg = resolveToolsConfig(feishuCfg.tools);
  if (!toolsCfg.wiki) return null;

  const client = createFeishuClient(account.credentials, {
    timeoutMs: (account.config.timeoutSeconds ?? 30) * 1000,
  });

  return {
    name: "feishu_wiki",
    label: "Feishu Wiki",
    description:
      "Feishu knowledge base operations. Actions: spaces (list), nodes (list in space), get (node details), create, move, rename.",
    parameters: FeishuWikiSchema,
    execute: async (_toolCallId, params) => {
      const p = params as FeishuWikiParams;

      try {
        switch (p.action) {
          case "spaces": {
            const result = await client.listWikiSpaces();
            const spaces = result.items.map((s) => ({
              space_id: s.space_id,
              name: s.name,
              description: s.description,
              visibility: s.visibility,
            }));

            return jsonResult({
              spaces,
              ...(spaces.length === 0 && { hint: WIKI_ACCESS_HINT }),
            });
          }

          case "nodes": {
            if (!p.space_id) {
              return jsonResult({ error: "space_id required for nodes action" });
            }
            const result = await client.listWikiNodes(p.space_id, {
              parentNodeToken: p.parent_node_token,
            });
            const nodes = result.items.map((n) => ({
              node_token: n.node_token,
              obj_token: n.obj_token,
              obj_type: n.obj_type,
              title: n.title,
              has_child: n.has_child,
            }));

            return jsonResult({ nodes });
          }

          case "get": {
            if (!p.token) {
              return jsonResult({ error: "token required for get action" });
            }
            const node = await client.getWikiNode(p.token);
            return jsonResult({
              node_token: node.node_token,
              space_id: node.space_id,
              obj_token: node.obj_token,
              obj_type: node.obj_type,
              title: node.title,
              parent_node_token: node.parent_node_token,
              has_child: node.has_child,
              creator: node.creator,
              create_time: node.node_create_time,
            });
          }

          case "create": {
            if (!p.space_id) {
              return jsonResult({ error: "space_id required for create action" });
            }
            if (!p.title) {
              return jsonResult({ error: "title required for create action" });
            }
            const node = await client.createWikiNode(p.space_id, {
              title: p.title,
              objType: (p.obj_type as FeishuWikiObjType) ?? "docx",
              parentNodeToken: p.parent_node_token,
            });
            return jsonResult({
              node_token: node.node_token,
              obj_token: node.obj_token,
              obj_type: node.obj_type,
              title: node.title,
            });
          }

          case "move": {
            if (!p.space_id) {
              return jsonResult({ error: "space_id required for move action" });
            }
            if (!p.node_token) {
              return jsonResult({ error: "node_token required for move action" });
            }
            const node = await client.moveWikiNode(p.space_id, p.node_token, {
              targetSpaceId: p.target_space_id,
              targetParentToken: p.target_parent_token,
            });
            return jsonResult({
              success: true,
              node_token: node.node_token,
            });
          }

          case "rename": {
            if (!p.space_id) {
              return jsonResult({ error: "space_id required for rename action" });
            }
            if (!p.node_token) {
              return jsonResult({ error: "node_token required for rename action" });
            }
            if (!p.title) {
              return jsonResult({ error: "title required for rename action" });
            }
            await client.renameWikiNode(p.space_id, p.node_token, p.title);
            return jsonResult({
              success: true,
              node_token: p.node_token,
              title: p.title,
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
