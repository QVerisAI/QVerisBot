/**
 * feishu_perm tool for Feishu permission management.
 *
 * Actions:
 * - list: List permission members of a file/document
 * - add: Add a permission member
 * - remove: Remove a permission member
 *
 * Note: This tool is opt-in (disabled by default) due to sensitivity.
 * Enable via channels.feishu.tools.perm: true
 */

import type { AnyAgentTool } from "../../agents/tools/common.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { FeishuToolsConfig } from "../../config/types.feishu.js";
import { jsonResult } from "../../agents/tools/common.js";
import { resolveFeishuAccount } from "../accounts.js";
import {
  createFeishuClient,
  type FeishuPermTokenType,
  type FeishuPermCreateTokenType,
  type FeishuPermMemberType,
  type FeishuPermLevel,
} from "../client.js";
import { FeishuPermSchema, type FeishuPermParams } from "./schemas.js";

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
 * Create the feishu_perm tool.
 */
export function createFeishuPermTool(config?: OpenClawConfig): AnyAgentTool | null {
  const feishuCfg = config?.channels?.feishu;
  if (!feishuCfg) return null;

  const account = resolveFeishuAccount({ cfg: config });
  if (account.credentials.source === "none") return null;

  const toolsCfg = resolveToolsConfig(feishuCfg.tools);
  if (!toolsCfg.perm) return null;

  const client = createFeishuClient(account.credentials, {
    timeoutMs: (account.config.timeoutSeconds ?? 30) * 1000,
  });

  return {
    name: "feishu_perm",
    label: "Feishu Perm",
    description:
      "Feishu permission management. Actions: list (members), add (member), remove (member). Requires channels.feishu.tools.perm: true",
    parameters: FeishuPermSchema,
    execute: async (_toolCallId, params) => {
      const p = params as FeishuPermParams;

      try {
        switch (p.action) {
          case "list": {
            const members = await client.listPermissionMembers(
              p.token,
              p.type as FeishuPermTokenType,
            );
            return jsonResult({
              members: members.map((m) => ({
                member_type: m.member_type,
                member_id: m.member_id,
                perm: m.perm,
                name: m.name,
              })),
            });
          }

          case "add": {
            if (!p.member_type) {
              return jsonResult({ error: "member_type required for add action" });
            }
            if (!p.member_id) {
              return jsonResult({ error: "member_id required for add action" });
            }
            if (!p.perm) {
              return jsonResult({ error: "perm required for add action" });
            }
            const member = await client.addPermissionMember(
              p.token,
              p.type as FeishuPermCreateTokenType,
              {
                memberType: p.member_type as FeishuPermMemberType,
                memberId: p.member_id,
                perm: p.perm as FeishuPermLevel,
              },
            );
            return jsonResult({
              success: true,
              member: {
                member_type: member.member_type,
                member_id: member.member_id,
                perm: member.perm,
                name: member.name,
              },
            });
          }

          case "remove": {
            if (!p.member_type) {
              return jsonResult({ error: "member_type required for remove action" });
            }
            if (!p.member_id) {
              return jsonResult({ error: "member_id required for remove action" });
            }
            await client.removePermissionMember(
              p.token,
              p.type as FeishuPermCreateTokenType,
              p.member_type as FeishuPermMemberType,
              p.member_id,
            );
            return jsonResult({
              success: true,
              removed: {
                member_type: p.member_type,
                member_id: p.member_id,
              },
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
