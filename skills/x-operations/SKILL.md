---
name: x-operations
description: "Cross-channel X (Twitter) operations using the configured X plugin: post tweets, reply, quote, like, repost, follow, unfollow, DM, search, timeline, tweet details, user info — from any channel (Feishu, X, Telegram, CLI, Web, webchat, etc. ). Use when the user mentions any X/Twitter action regardless of which channel the conversation is on."
---

# Cross-Channel X (Twitter) Operations

QVerisBot has a built-in **X (Twitter) plugin** already configured with OAuth credentials. All X operations go through this plugin via the `message` tool's x-\* actions. You do not need to call any external API, use browser automation, or search for third-party tools.

## Critical: Understand How This Works

The X plugin is a **platform-level service**, not a channel-bound feature. It uses pre-configured OAuth credentials to execute X operations on behalf of the user.

**Your current conversation channel is just where you receive instructions.** X operations always execute through the X plugin regardless of whether you are talking to the user on Feishu, Telegram, CLI, Web UI, or X itself.

| Conversation channel | User says             | What you do                                            |
| -------------------- | --------------------- | ------------------------------------------------------ |
| Feishu               | "帮我发一条推文"      | `message({ action: "x-post", message: "..." })`        |
| Feishu               | "搜索 AI 相关推文"    | `message({ action: "x-search", query: "AI" })`         |
| Telegram             | "Follow @elonmusk"    | `message({ action: "x-follow", target: "@elonmusk" })` |
| CLI                  | "看看 @openai 的推文" | `message({ action: "x-timeline", target: "@openai" })` |
| Web UI               | "转发这条推"          | `message({ action: "x-repost", target: "<tweet>" })`   |
| X (mention)          | "@bot 关注 @xxx"      | `message({ action: "x-follow", target: "@xxx" })`      |

**There is no restriction preventing X operations from non-X channels.** The X plugin handles everything internally.

## Available Actions (15 total)

### Write Actions (require actionsAllowFrom permission)

| Action       | Description                        | Required params                                       |
| ------------ | ---------------------------------- | ----------------------------------------------------- |
| `x-post`     | Post a new standalone tweet        | `message` (text, max 280 chars)                       |
| `x-reply`    | Reply to / comment on a tweet      | `target` (tweet URL or ID), `message` (max 280 chars) |
| `x-quote`    | Quote tweet (retweet with comment) | `target` (tweet URL or ID), `message` (max 280 chars) |
| `x-like`     | Like a tweet                       | `target` (tweet URL or tweet ID)                      |
| `x-unlike`   | Unlike a tweet                     | `target` (tweet URL or tweet ID)                      |
| `x-repost`   | Repost (retweet)                   | `target` (tweet URL or tweet ID)                      |
| `x-unrepost` | Undo repost (unretweet)            | `target` (tweet URL or tweet ID)                      |
| `x-follow`   | Follow a user                      | `target` (username or user ID)                        |
| `x-unfollow` | Unfollow a user                    | `target` (username or user ID)                        |
| `x-dm`       | Send a direct message              | `target` (username or user ID), `message` (text)      |

### Read Actions (no actionsAllowFrom permission needed)

| Action         | Description                       | Required params                                       |
| -------------- | --------------------------------- | ----------------------------------------------------- |
| `x-search`     | Search recent tweets by keyword   | `query` (search string), optional `maxResults`        |
| `x-timeline`   | Get a user's recent tweets        | `target` (username or user ID), optional `maxResults` |
| `x-tweet-info` | Get tweet details with metrics    | `target` (tweet URL or tweet ID)                      |
| `x-user-info`  | Look up a user's profile          | `target` (username)                                   |
| `x-me`         | Get current authenticated account | (no params needed)                                    |

### Target formats

- **Username**: `@elonmusk` or `elonmusk`
- **User ID**: `44196397`
- **Tweet URL**: `https://x.com/user/status/123456789` or `https://twitter.com/user/status/123456789`
- **Tweet ID**: `123456789`

### Optional parameter

- `accountId`: specify which X account to use (only for multi-account setups)

## Usage Examples

### Post a new tweet

```
message({ action: "x-post", message: "Hello world!" })
```

### Reply to a tweet

```
message({
  action: "x-reply",
  target: "https://x.com/user/status/1234567890",
  message: "Great insight!"
})
```

### Quote tweet (retweet with comment)

```
message({
  action: "x-quote",
  target: "https://x.com/user/status/1234567890",
  message: "This is spot on! Highly recommended read."
})
```

### Search tweets

```
message({ action: "x-search", query: "AI agents", maxResults: 10 })
```

Returns a list of tweets with text, author info, and engagement metrics (likes, retweets, replies, etc.).

### Get user timeline

```
message({ action: "x-timeline", target: "@openai", maxResults: 5 })
```

### Get tweet details with metrics

```
message({ action: "x-tweet-info", target: "https://x.com/user/status/1234567890" })
```

Returns: text, author, creation time, like count, retweet count, reply count, quote count, impression count.

### Look up user profile

```
message({ action: "x-user-info", target: "@elonmusk" })
```

### Get current account info

```
message({ action: "x-me" })
```

### Like + Repost a tweet

```
message({ action: "x-like", target: "https://x.com/user/status/1234567890" })
message({ action: "x-repost", target: "https://x.com/user/status/1234567890" })
```

### Follow users

```
message({ action: "x-follow", target: "@openai" })
message({ action: "x-follow", target: "@anthropic" })
```

### Send a direct message

```
message({ action: "x-dm", target: "@username", message: "Hey!" })
```

## Cross-Channel Workflow Examples

### From Feishu: "搜索 AI 热门推文，点赞前 3 条"

```
// 1. Search
message({ action: "x-search", query: "AI", maxResults: 10 })
// 2. Analyze results — pick top 3 by metrics.likeCount + metrics.retweetCount
// 3. Like top 3
message({ action: "x-like", target: "<tweet_id_1>" })
message({ action: "x-like", target: "<tweet_id_2>" })
message({ action: "x-like", target: "<tweet_id_3>" })
```

### From Feishu: "看看 @elonmusk 最近发了什么，找一条最火的，帮我评论"

```
// 1. Get timeline
message({ action: "x-timeline", target: "@elonmusk", maxResults: 10 })
// 2. For each tweet, get details to see engagement metrics
message({ action: "x-tweet-info", target: "<tweet_id>" })
// 3. Pick the hottest one, compose a relevant reply
message({
  action: "x-reply",
  target: "<hottest_tweet_id>",
  message: "Your thoughtful comment (max 280 chars)"
})
```

### From Telegram: "Quote this tweet with my thoughts"

```
message({
  action: "x-quote",
  target: "https://x.com/user/status/123",
  message: "Fascinating perspective on the future of AI!"
})
```

### From CLI: "帮我查一下我的 X 账号信息"

```
message({ action: "x-me" })
```

## Natural Language Mapping

| User says (Chinese)                 | Action         |
| ----------------------------------- | -------------- |
| 发推文 / 发一条推 / 发 tweet        | `x-post`       |
| 回复推文 / 评论这条推               | `x-reply`      |
| 引用转推 / 带评论转推 / quote tweet | `x-quote`      |
| 点赞 / 给这条推点个赞               | `x-like`       |
| 取消点赞                            | `x-unlike`     |
| 转推 / 转发                         | `x-repost`     |
| 取消转推                            | `x-unrepost`   |
| 关注 / follow                       | `x-follow`     |
| 取关 / unfollow                     | `x-unfollow`   |
| 私信 / DM                           | `x-dm`         |
| 搜索推文 / 找推文 / search tweets   | `x-search`     |
| 看看 xxx 的推文 / 时间线 / timeline | `x-timeline`   |
| 这条推的数据 / 推文详情 / 互动数据  | `x-tweet-info` |
| 查用户 / 用户信息 / user info       | `x-user-info`  |
| 我的账号 / 当前账号                 | `x-me`         |

## X Content Rules

- **280-character limit** per tweet / reply / quote comment
- **Plain text only** — X does not render markdown. Never use `**bold**`, `*italic*`, `` `code` ``.

## Permission Model

Write actions require allowlist permission. Read actions do not.

**Read actions** (`x-search`, `x-timeline`, `x-tweet-info`, `x-user-info`, `x-me`) — always allowed, no permission check needed.

**Write actions** permission cascade (checked in order):

1. **From X**: sender must be in `channels.x.actionsAllowFrom`.
2. **From other channels** (Feishu, Telegram, etc.): if `channels.<channel>.xActionsAllowFrom` is set, sender must be in it. Otherwise, if `channels.<channel>.allowFrom` is set, sender must be in it. Otherwise, if `channels.x.actionsAllowFrom` is configured (any value), the action is **allowed** (the owner explicitly enabled X actions and the sender is authenticated by the originating channel).
3. **From CLI/unattended**: allowed if `channels.x.actionsAllowFrom` is configured.

**In practice**: if `channels.x.actionsAllowFrom` is configured during onboarding, cross-channel X write actions work from any channel without extra configuration. You do NOT need to set `channels.feishu.xActionsAllowFrom` separately.

## Do NOT Do These

1. **Do NOT use the browser tool** for X operations. The X plugin is already configured.
2. **Do NOT search for X/Twitter tools or external APIs.** The `message` tool's x-\* actions are the correct and only interface.
3. **Do NOT confuse the conversation channel with the action target.** "回复这条推文" in Feishu means `x-reply` on X, NOT a Feishu reply.
4. **Do NOT say "I can't do X operations from this channel."** You can — the X plugin works from any channel.
5. **Do NOT send tweet content as a regular message** in the user's conversation when they ask to post/reply on X.
6. **Do NOT use markdown in X content.** X renders plain text only.
