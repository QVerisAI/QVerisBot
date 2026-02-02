/**
 * TypeBox schemas for Feishu tool parameters.
 */
import { Type, type Static } from "@sinclair/typebox";

// ============ feishu_doc tool schema ============

export const FeishuDocSchema = Type.Object({
  action: Type.Union([
    Type.Literal("get"),
    Type.Literal("raw"),
    Type.Literal("create"),
    Type.Literal("write"),
    Type.Literal("append"),
  ]),
  document_id: Type.Optional(
    Type.String({ description: "Document ID (required for get/raw/write/append)" }),
  ),
  folder_token: Type.Optional(Type.String({ description: "Folder token for create action" })),
  title: Type.Optional(Type.String({ description: "Document title (for create action)" })),
  markdown: Type.Optional(Type.String({ description: "Markdown content to write/append" })),
});

export type FeishuDocParams = Static<typeof FeishuDocSchema>;

// ============ feishu_wiki tool schema ============

export const FeishuWikiSchema = Type.Object({
  action: Type.Union([
    Type.Literal("spaces"),
    Type.Literal("nodes"),
    Type.Literal("get"),
    Type.Literal("create"),
    Type.Literal("move"),
    Type.Literal("rename"),
  ]),
  space_id: Type.Optional(
    Type.String({ description: "Space ID (required for nodes/create/move/rename)" }),
  ),
  parent_node_token: Type.Optional(
    Type.String({ description: "Parent node token for listing or creating" }),
  ),
  token: Type.Optional(Type.String({ description: "Node token (for get action)" })),
  node_token: Type.Optional(Type.String({ description: "Node token (for move/rename actions)" })),
  title: Type.Optional(Type.String({ description: "Node title (for create/rename)" })),
  obj_type: Type.Optional(
    Type.String({
      description: "Object type for create: doc, sheet, mindnote, bitable, file, docx, slides",
    }),
  ),
  target_space_id: Type.Optional(Type.String({ description: "Target space ID for move" })),
  target_parent_token: Type.Optional(Type.String({ description: "Target parent token for move" })),
});

export type FeishuWikiParams = Static<typeof FeishuWikiSchema>;

// ============ feishu_drive tool schema ============

export const FeishuDriveSchema = Type.Object({
  action: Type.Union([
    Type.Literal("list"),
    Type.Literal("meta"),
    Type.Literal("create_folder"),
    Type.Literal("move"),
    Type.Literal("delete"),
  ]),
  folder_token: Type.Optional(
    Type.String({ description: "Folder token (for list/create_folder/move target)" }),
  ),
  file_token: Type.Optional(
    Type.String({ description: "File/folder token (for meta/move/delete)" }),
  ),
  file_type: Type.Optional(
    Type.String({
      description:
        "File type: doc, sheet, file, wiki, bitable, docx, mindnote, minutes, slides, folder",
    }),
  ),
  name: Type.Optional(Type.String({ description: "Folder name (for create_folder)" })),
});

export type FeishuDriveParams = Static<typeof FeishuDriveSchema>;

// ============ feishu_perm tool schema ============

export const FeishuPermSchema = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("add"), Type.Literal("remove")]),
  token: Type.String({ description: "File/document token" }),
  type: Type.String({
    description:
      "Token type: doc, sheet, file, wiki, bitable, docx, folder, mindnote, minutes, slides",
  }),
  member_type: Type.Optional(
    Type.String({
      description:
        "Member type: email, openid, unionid, openchat, opendepartmentid, userid, groupid, wikispaceid",
    }),
  ),
  member_id: Type.Optional(Type.String({ description: "Member ID" })),
  perm: Type.Optional(Type.String({ description: "Permission level: view, edit, full_access" })),
});

export type FeishuPermParams = Static<typeof FeishuPermSchema>;
