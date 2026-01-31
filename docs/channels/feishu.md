---
summary: "Feishu（飞书/Lark）渠道配置与能力说明（含多媒体与图片双写发送）"
---

## 概览

OpenClaw 支持通过飞书机器人接收/发送消息，并支持图片、文件、音频、视频等多媒体能力。

- **推荐接收模式**：WebSocket（无需公网回调 URL）
- **多媒体**：支持入站下载到本地媒体缓存，并在出站时自动按媒体类型选择发送方式
- **图片双写发送**：可选将同一张图片同时以“图片消息 + 文件附件”发送，兼顾预览与可下载/保真

## 最小配置（单账号）

在 `clawdbot.json`（或你的配置文件）中：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "eventMode": "websocket"
    }
  }
}
```

## 多账号配置

```json
{
  "channels": {
    "feishu": {
      "accounts": {
        "default": {
          "appId": "cli_xxx",
          "appSecret": "xxx",
          "eventMode": "websocket"
        }
      }
    }
  }
}
```

## 入站（用户 → OpenClaw）

- **消息类型**：`text` 直接进入对话；`image/file/audio/media(video)` 会触发下载
- **媒体下载**：下载后落在本地 `~/.openclaw/media/inbound/`，并写入上下文：
  - `MediaPath`：本地文件路径
  - `MediaType`：推断出的 mime
  - `Body`：若原消息无文本，会用占位符（例如 `<media:image>`）触发 agent
- **大小限制**：`channels.feishu.mediaMaxMb`（默认 20MB）

## 出站（OpenClaw → 飞书）

当回复 payload 里包含 `mediaUrl/mediaUrls` 时：

- **图片**：默认发 `image`（可预览）
  - 可选开启 **图片双写发送**：先发 `image`，再发 `file` 附件（便于下载/保真）
    - 配置：`channels.feishu.imageDoubleSend: true`
- **音频**：OPUS/OGG 优先发 `audio`；否则按 `file` 附件发送
- **视频**：mp4 优先发 `media`；否则按 `file` 附件发送
- **其他文件**：按 `file` 附件发送

## 相关配置项（常用）

- **`channels.feishu.eventMode`**：`"websocket"`（推荐）或 `"webhook"`
- **`channels.feishu.mediaMaxMb`**：入站下载与出站抓取媒体的大小上限（MB）
- **`channels.feishu.imageDoubleSend`**：是否启用图片双写发送
- **`channels.feishu.groups.<chatId>.requireMention`**：群聊是否要求 @ 机器人（默认由通用 group policy 决定）

## 进一步阅读

- 渠道总览：`/channels`
- 配置总览：`/cli/config`

