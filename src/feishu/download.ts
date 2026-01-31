import { detectMime } from "../media/mime.js";
import { saveMediaBuffer, type SavedMedia } from "../media/store.js";
import type { FeishuClient } from "./client.js";

export type FeishuInboundMedia = {
  saved: SavedMedia;
  placeholder: string;
};

type FeishuMessageResourceType = "image" | "file" | "audio" | "video";

function placeholderForType(type: FeishuMessageResourceType): string {
  switch (type) {
    case "image":
      return "<media:image>";
    case "audio":
      return "<media:audio>";
    case "video":
      return "<media:video>";
    case "file":
      return "<media:document>";
  }
}

/**
 * Download a Feishu message resource (image/file/audio/video) to the local media store.
 *
 * Feishu "message resource" download is keyed by (messageId, fileKey, type).
 * For images, `fileKey` is the `image_key` from the message content.
 * For other media, `fileKey` is typically the `file_key`.
 */
export async function downloadFeishuInboundMedia(params: {
  client: FeishuClient;
  messageId: string;
  fileKey: string;
  type: FeishuMessageResourceType;
  maxBytes: number;
  originalFilename?: string;
}): Promise<FeishuInboundMedia> {
  const { buffer, contentType, fileName } = await params.client.getMessageResource(
    params.messageId,
    params.fileKey,
    params.type,
  );

  const mime = await detectMime({
    buffer,
    headerMime: contentType,
    filePath: params.originalFilename ?? fileName,
  });

  const saved = await saveMediaBuffer(
    buffer,
    mime ?? contentType ?? undefined,
    "inbound",
    params.maxBytes,
    params.originalFilename ?? fileName,
  );

  return {
    saved,
    placeholder: placeholderForType(params.type),
  };
}
