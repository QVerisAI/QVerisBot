---
name: x-actions
description: Perform X (Twitter) actions like posting tweets, replying, quoting tweets, following users, liking tweets, reposting, sending DMs, searching tweets, viewing timelines, and getting tweet/user details. Use when the user wants to interact with X/Twitter in any way.
---

# X (Twitter) Actions

All X operations use the `message` tool with x-\* actions. The X plugin handles authentication and API calls using configured OAuth credentials.

> **IMPORTANT**: ALWAYS use the `message` tool with the X-specific actions listed below. Do NOT use the `browser` tool or external API tools for X operations.

## Write Actions (require actionsAllowFrom permission)

| Action       | Description                        | Example                                                                                        |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `x-post`     | Post a new standalone tweet        | `message({ action: "x-post", message: "Hello world!" })`                                       |
| `x-reply`    | Reply to / comment on a tweet      | `message({ action: "x-reply", target: "https://x.com/user/status/123", message: "Great!" })`   |
| `x-quote`    | Quote tweet (retweet with comment) | `message({ action: "x-quote", target: "https://x.com/user/status/123", message: "So true!" })` |
| `x-follow`   | Follow a user                      | `message({ action: "x-follow", target: "@elonmusk" })`                                         |
| `x-unfollow` | Unfollow a user                    | `message({ action: "x-unfollow", target: "@elonmusk" })`                                       |
| `x-like`     | Like a tweet                       | `message({ action: "x-like", target: "https://x.com/user/status/123" })`                       |
| `x-unlike`   | Unlike a tweet                     | `message({ action: "x-unlike", target: "1234567890" })`                                        |
| `x-repost`   | Repost (retweet)                   | `message({ action: "x-repost", target: "https://x.com/user/status/123" })`                     |
| `x-unrepost` | Undo repost (unretweet)            | `message({ action: "x-unrepost", target: "1234567890" })`                                      |
| `x-dm`       | Send direct message                | `message({ action: "x-dm", target: "@user", message: "Hello!" })`                              |

## Read Actions (no actionsAllowFrom permission needed)

| Action         | Description                     | Example                                                     |
| -------------- | ------------------------------- | ----------------------------------------------------------- |
| `x-search`     | Search recent tweets by keyword | `message({ action: "x-search", query: "AI agents" })`       |
| `x-timeline`   | Get a user's recent tweets      | `message({ action: "x-timeline", target: "@openai" })`      |
| `x-tweet-info` | Get tweet details with metrics  | `message({ action: "x-tweet-info", target: "1234567890" })` |
| `x-user-info`  | Look up user profile            | `message({ action: "x-user-info", target: "@elonmusk" })`   |
| `x-me`         | Get current account info        | `message({ action: "x-me" })`                               |

## Combined Workflow Examples

### Example: Find and comment on a user's hottest tweet

User: "查看 elonmusk 今天发布的推文，找一条最热的，根据内容进行评论"

```typescript
// Step 1: Get user timeline
message({ action: "x-timeline", target: "@elonmusk", maxResults: 10 });

// Step 2: Get details for each tweet to compare metrics
message({ action: "x-tweet-info", target: "<tweet_id>" });

// Step 3: Reply to the hottest tweet
message({
  action: "x-reply",
  target: "<hottest_tweet_id>",
  message: "Your thoughtful comment here (max 280 chars)",
});
```

### Example: Search topic, like and quote the best tweet

User: "搜索关于 AI 的热门推文，点赞最火的一条，并引用转推加评论"

```typescript
// Step 1: Search
message({ action: "x-search", query: "AI", maxResults: 10 });

// Step 2: Like the top tweet
message({ action: "x-like", target: "<top_tweet_id>" });

// Step 3: Quote tweet with comment
message({
  action: "x-quote",
  target: "<top_tweet_id>",
  message: "AI is reshaping every industry. This nails it!",
});
```

### Example: Monitor and follow key users

User: "查一下 @vitalikbuterin 和 @punk6529 的信息，然后关注他们"

```typescript
// Step 1: Look up users
message({ action: "x-user-info", target: "@vitalikbuterin" });
message({ action: "x-user-info", target: "@punk6529" });

// Step 2: Follow them
message({ action: "x-follow", target: "@vitalikbuterin" });
message({ action: "x-follow", target: "@punk6529" });
```

## Write Action Usage Details

### Post a New Standalone Tweet

```typescript
message({ action: "x-post", message: "Your tweet content here (max 280 chars)" });
```

### Quote Tweet (Retweet with Comment)

```typescript
// By URL
message({
  action: "x-quote",
  target: "https://x.com/user/status/1234567890",
  message: "Your comment on this tweet (max 280 chars)",
});

// By tweet ID
message({ action: "x-quote", target: "1234567890", message: "Great point!" });
```

### Reply to / Comment on a Tweet

```typescript
message({
  action: "x-reply",
  target: "https://x.com/user/status/1234567890",
  message: "Your reply text here (max 280 chars)",
});
```

### Follow a User

```typescript
message({ action: "x-follow", target: "@elonmusk" });
message({ action: "x-follow", target: "44196397" }); // by user ID
```

### Like a Tweet

```typescript
message({ action: "x-like", target: "https://x.com/elonmusk/status/1234567890" });
message({ action: "x-like", target: "1234567890" }); // by tweet ID
```

### Send Direct Message

```typescript
message({ action: "x-dm", target: "@username", message: "Your message here" });
```

## Read Action Usage Details

### Search Recent Tweets

```typescript
message({ action: "x-search", query: "AI agents", maxResults: 10 });
// Returns: tweets[] with text, authorId, authorUsername, authorName, createdAt, metrics
```

### Get User Timeline

```typescript
message({ action: "x-timeline", target: "@openai", maxResults: 5 });
// Returns: tweets[] with id, text, authorId, createdAt
```

### Get Tweet Details with Metrics

```typescript
message({ action: "x-tweet-info", target: "https://x.com/user/status/1234567890" });
// Returns: text, author, createdAt, metrics (likeCount, retweetCount, replyCount, quoteCount, impressionCount)
```

### Look Up User Profile

```typescript
message({ action: "x-user-info", target: "@elonmusk" });
// Returns: id, username, name
```

### Get Current Account Info

```typescript
message({ action: "x-me" });
// Returns: id, username, name of the authenticated account
```

## Natural Language Mapping

| User Request (Chinese)              | Action         |
| ----------------------------------- | -------------- |
| 发推文 / 发一条推 / 发 tweet        | `x-post`       |
| 评论这条推 / 回复这条推文           | `x-reply`      |
| 引用转推 / 带评论转推 / quote tweet | `x-quote`      |
| 关注 @xxx / 帮我关注 xxx            | `x-follow`     |
| 取关 @xxx                           | `x-unfollow`   |
| 点赞这条推文                        | `x-like`       |
| 取消点赞                            | `x-unlike`     |
| 转推 / 转发这条推文                 | `x-repost`     |
| 取消转推                            | `x-unrepost`   |
| 发私信给 @xxx                       | `x-dm`         |
| 搜索推文 / 找 xxx 相关的推          | `x-search`     |
| 看看 xxx 的推文 / xxx 最近发了什么  | `x-timeline`   |
| 这条推的数据 / 推文详情             | `x-tweet-info` |
| 查用户信息                          | `x-user-info`  |
| 我的账号 / 当前 X 账号              | `x-me`         |

| User Request (English)                    | Action         |
| ----------------------------------------- | -------------- |
| Post a tweet / Tweet something            | `x-post`       |
| Reply to / Comment on this tweet          | `x-reply`      |
| Quote this tweet / Retweet with comment   | `x-quote`      |
| Follow @xxx                               | `x-follow`     |
| Unfollow @xxx                             | `x-unfollow`   |
| Like this tweet                           | `x-like`       |
| Unlike this tweet                         | `x-unlike`     |
| Repost / Retweet this                     | `x-repost`     |
| Undo repost / Unretweet                   | `x-unrepost`   |
| DM @xxx                                   | `x-dm`         |
| Search tweets about xxx                   | `x-search`     |
| Show @xxx's tweets / What did xxx post    | `x-timeline`   |
| Tweet details / How popular is this tweet | `x-tweet-info` |
| Look up user / User info                  | `x-user-info`  |
| My account / Who am I on X                | `x-me`         |

## Parameters

### Target Formats

- **Username**: `@elonmusk` or `elonmusk`
- **User ID**: `44196397`
- **Tweet URL**: `https://x.com/user/status/123` or `https://twitter.com/user/status/123`
- **Tweet ID**: `1234567890123456789`

### Optional Parameters

- `accountId`: Specify which X account to use (if multiple configured)
- `maxResults`: For `x-search` and `x-timeline` (default: 10)

## Error Handling

```typescript
const result = message({ action: "x-follow", target: "@user" });
// result.ok: boolean
// result.error: string (if failed)
// Write actions: result.following / result.liked / result.retweeted / result.tweetId / result.dmId
// Read actions: result.tweets[] / result.tweet / result.user
```

## Requirements

X account must be configured in `channels.x` with:

- `consumerKey`, `consumerSecret`, `accessToken`, `accessTokenSecret`

## Permission Control

- **Read actions** (`x-search`, `x-timeline`, `x-tweet-info`, `x-user-info`, `x-me`): always allowed, no permission check.
- **Write actions**: if `channels.x.actionsAllowFrom` is configured during onboarding, cross-channel write actions (from Feishu, Telegram, CLI, etc.) work automatically. No extra per-channel config needed.
- **Reply restriction from X**: When triggered from X mention, `x-reply` only to that user's tweets.
