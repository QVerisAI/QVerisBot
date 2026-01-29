/**
 * Feishu Event Types
 *
 * Handles event parsing and decryption for Feishu webhook/websocket events.
 */

import crypto from "node:crypto";

/**
 * Base event structure from Feishu
 */
export type FeishuEventBase = {
  schema: string;
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
};

/**
 * Message receive event (im.message.receive_v1)
 */
export type FeishuMessageReceiveEvent = FeishuEventBase & {
  header: FeishuEventBase["header"] & {
    event_type: "im.message.receive_v1";
  };
  event: {
    sender: {
      sender_id: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      sender_type: string;
      tenant_key?: string;
    };
    message: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      thread_id?: string;
      create_time: string;
      update_time?: string;
      chat_id: string;
      chat_type: "p2p" | "group";
      message_type: string;
      content: string; // JSON stringified
      mentions?: Array<{
        key: string;
        id: {
          open_id?: string;
          user_id?: string;
          union_id?: string;
        };
        name: string;
        tenant_key?: string;
      }>;
    };
  };
};

/**
 * Message read event (im.message.message_read_v1)
 */
export type FeishuMessageReadEvent = FeishuEventBase & {
  header: FeishuEventBase["header"] & {
    event_type: "im.message.message_read_v1";
  };
  event: {
    reader: {
      reader_id: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      read_time: string;
      tenant_key?: string;
    };
    message_id_list: string[];
  };
};

/**
 * Chat member added event (im.chat.member.user.added_v1)
 */
export type FeishuChatMemberAddedEvent = FeishuEventBase & {
  header: FeishuEventBase["header"] & {
    event_type: "im.chat.member.user.added_v1";
  };
  event: {
    chat_id: string;
    operator_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    users: Array<{
      user_id: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      tenant_key?: string;
      name?: string;
    }>;
    name?: string;
    i18n_names?: {
      zh_cn?: string;
      en_us?: string;
      ja_jp?: string;
    };
  };
};

/**
 * Bot added to chat event (im.chat.member.bot.added_v1)
 */
export type FeishuBotAddedEvent = FeishuEventBase & {
  header: FeishuEventBase["header"] & {
    event_type: "im.chat.member.bot.added_v1";
  };
  event: {
    chat_id: string;
    operator_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    name?: string;
    i18n_names?: {
      zh_cn?: string;
      en_us?: string;
      ja_jp?: string;
    };
  };
};

/**
 * Message reaction event (im.message.reaction.created_v1)
 */
export type FeishuMessageReactionCreatedEvent = FeishuEventBase & {
  header: FeishuEventBase["header"] & {
    event_type: "im.message.reaction.created_v1";
  };
  event: {
    message_id: string;
    reaction_type: {
      emoji_type: string;
    };
    operator_type: string;
    user_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    action_time: string;
  };
};

/**
 * Message recalled event (im.message.recalled_v1)
 * Triggered when a user recalls (withdraws) a message
 */
export type FeishuMessageRecalledEvent = FeishuEventBase & {
  header: FeishuEventBase["header"] & {
    event_type: "im.message.recalled_v1";
  };
  event: {
    /** The ID of the recalled message */
    message_id: string;
    /** The chat ID where the message was recalled */
    chat_id: string;
    /** Time when the message was recalled (unix timestamp in ms) */
    recall_time: string;
    /** Type of recall: user_recall or admin_recall */
    recall_type?: string;
  };
};

/**
 * URL verification challenge (webhook setup)
 */
export type FeishuUrlVerificationEvent = {
  type: "url_verification";
  token: string;
  challenge: string;
};

/**
 * Union type for all supported events
 */
export type FeishuEvent =
  | FeishuMessageReceiveEvent
  | FeishuMessageReadEvent
  | FeishuChatMemberAddedEvent
  | FeishuBotAddedEvent
  | FeishuMessageReactionCreatedEvent
  | FeishuMessageRecalledEvent;

/**
 * Raw event payload (may be encrypted)
 */
export type FeishuRawEventPayload = FeishuUrlVerificationEvent | FeishuEvent | { encrypt: string };

/**
 * Decrypt Feishu event payload
 */
export function decryptFeishuEvent(encrypted: string, encryptKey: string): unknown {
  // Feishu uses AES-256-CBC with the encryptKey as the key
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const encryptedBuffer = Buffer.from(encrypted, "base64");

  // First 16 bytes are the IV
  const iv = encryptedBuffer.subarray(0, 16);
  const data = encryptedBuffer.subarray(16);

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString("utf-8"));
}

/**
 * Verify event signature
 */
export function verifyFeishuEventSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string,
  signature: string,
): boolean {
  const content = timestamp + nonce + encryptKey + body;
  const computedSignature = crypto.createHash("sha256").update(content).digest("hex");
  return computedSignature === signature;
}

/**
 * Parse and optionally decrypt an event payload
 */
export function parseFeishuEvent(
  payload: unknown,
  encryptKey?: string,
): FeishuRawEventPayload | null {
  if (!payload || typeof payload !== "object") return null;

  const raw = payload as Record<string, unknown>;

  // Check if encrypted
  if (typeof raw.encrypt === "string" && encryptKey) {
    try {
      const decrypted = decryptFeishuEvent(raw.encrypt, encryptKey);
      return decrypted as FeishuRawEventPayload;
    } catch {
      return null;
    }
  }

  return payload as FeishuRawEventPayload;
}

/**
 * Check if event is URL verification challenge
 */
export function isUrlVerificationEvent(
  event: FeishuRawEventPayload,
): event is FeishuUrlVerificationEvent {
  return "type" in event && event.type === "url_verification";
}

/**
 * Check if event is a message receive event
 */
export function isMessageReceiveEvent(
  event: FeishuRawEventPayload,
): event is FeishuMessageReceiveEvent {
  return "header" in event && event.header?.event_type === "im.message.receive_v1";
}

/**
 * Check if event is a reaction event
 */
export function isReactionCreatedEvent(
  event: FeishuRawEventPayload,
): event is FeishuMessageReactionCreatedEvent {
  return "header" in event && event.header?.event_type === "im.message.reaction.created_v1";
}

/**
 * Check if event is a bot added event
 */
export function isBotAddedEvent(event: FeishuRawEventPayload): event is FeishuBotAddedEvent {
  return "header" in event && event.header?.event_type === "im.chat.member.bot.added_v1";
}

/**
 * Check if event is a message recalled event
 */
export function isMessageRecalledEvent(
  event: FeishuRawEventPayload,
): event is FeishuMessageRecalledEvent {
  return "header" in event && event.header?.event_type === "im.message.recalled_v1";
}

/**
 * Parse message content from event
 */
export function parseMessageContent(contentJson: string): {
  text?: string;
  imageKey?: string;
  fileKey?: string;
  raw: unknown;
} {
  try {
    const content = JSON.parse(contentJson) as Record<string, unknown>;
    return {
      text: typeof content.text === "string" ? content.text : undefined,
      imageKey: typeof content.image_key === "string" ? content.image_key : undefined,
      fileKey: typeof content.file_key === "string" ? content.file_key : undefined,
      raw: content,
    };
  } catch {
    return { raw: contentJson };
  }
}

/**
 * Extract mention from message text
 */
export function extractMentionedText(
  text: string,
  mentions?: FeishuMessageReceiveEvent["event"]["message"]["mentions"],
): { strippedText: string; wasMentioned: boolean; mentionedBotId?: string } {
  if (!mentions || mentions.length === 0) {
    return { strippedText: text, wasMentioned: false };
  }

  let strippedText = text;
  let wasMentioned = false;
  let mentionedBotId: string | undefined;

  for (const mention of mentions) {
    // Feishu mentions appear as @_user_<number> in text
    const mentionPattern = new RegExp(`@_user_\\d+`, "g");
    if (mentionPattern.test(strippedText)) {
      wasMentioned = true;
      mentionedBotId = mention.id.open_id;
      strippedText = strippedText.replace(mentionPattern, "").trim();
    }
  }

  return { strippedText, wasMentioned, mentionedBotId };
}
