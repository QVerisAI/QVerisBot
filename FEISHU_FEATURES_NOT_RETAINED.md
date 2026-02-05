# Feishu功能对比与未保留功能

本文档记录了在合并incoming代码时，我们之前实现的Feishu功能中哪些未能保留，将来需要完善。

## 合并时间

2026年2月5日

## 代码来源对比

### 我们的实现 (HEAD)

- 基于原生Fetch API实现的完整Feishu客户端
- 自定义的Bot类，包含完整的消息处理逻辑
- 丰富的Feishu API工具集成

### Incoming实现 (54ddbc4)

- 基于官方SDK `@larksuiteoapi/node-sdk`
- 简化的Bot实现，使用SDK的事件分发器
- 专注于核心聊天功能

## 未能保留的功能清单

### 1. Feishu工具集 (Tools)

**我们的实现包含了完整的Feishu工具集，但incoming版本中未包含：**

#### 1.1 文档工具 (feishu_doc)

- **文件位置**: `src/feishu/tools/doc.ts`
- **功能**:
  - `get`: 获取文档元数据
  - `raw`: 获取文档原始内容（纯文本）
  - `create`: 创建新文档
  - `write`: 用Markdown替换文档内容
  - `append`: 向文档追加Markdown内容
- **API覆盖**:
  - `/docx/v1/documents/:document_id` (获取文档)
  - `/docx/v1/documents/:document_id/raw_content` (获取内容)
  - `/docx/v1/documents` (创建文档)
  - `/docx/v1/documents/:document_id/blocks` (操作块)
  - `/docx/v1/documents/:document_id/blocks/batch_create_by_markdown` (Markdown转换)

#### 1.2 知识库工具 (feishu_wiki)

- **文件位置**: `src/feishu/tools/wiki.ts`
- **功能**:
  - `spaces`: 列出可访问的知识库空间
  - `nodes`: 列出空间中的节点
  - `get`: 通过token获取节点详情
  - `create`: 创建新知识库节点
  - `move`: 移动知识库节点
  - `rename`: 重命名知识库节点
- **API覆盖**:
  - `/wiki/v2/spaces` (列出空间)
  - `/wiki/v2/spaces/:space_id/nodes` (列出节点)
  - `/wiki/v2/spaces/get_node` (获取节点)
  - `/wiki/v2/spaces/:space_id/nodes` (创建节点)
  - `/wiki/v2/spaces/:space_id/nodes/:node_token/move` (移动节点)
  - `/wiki/v2/spaces/:space_id/nodes/:node_token/update_title` (重命名)

#### 1.3 云盘工具 (feishu_drive)

- **文件位置**: `src/feishu/tools/drive.ts`
- **功能**:
  - `list`: 列出文件夹中的文件
  - `meta`: 获取文件元数据
  - `create_folder`: 创建文件夹
  - `move`: 移动文件/文件夹
  - `delete`: 删除文件/文件夹
- **API覆盖**:
  - `/drive/v1/files` (列出文件)
  - `/drive/v1/metas/batch_query` (批量查询元数据)
  - `/drive/v1/files/create_folder` (创建文件夹)
  - `/drive/v1/files/:file_token/move` (移动)
  - `/drive/v1/files/:file_token` (删除)

#### 1.4 权限工具 (feishu_perm)

- **文件位置**: `src/feishu/tools/perm.ts`
- **功能**:
  - `list`: 列出文件/文档的权限成员
  - `add`: 添加权限成员
  - `remove`: 移除权限成员
- **API覆盖**:
  - `/drive/v1/permissions/:token/members` (列出/添加)
  - `/drive/v1/permissions/:token/members/:member_id` (移除)
- **注意**: 此工具默认关闭（需要显式启用），因为涉及敏感权限操作

### 2. 自定义FeishuClient实现

**我们的实现 (`src/feishu/client.ts`) 包含了完整的Feishu API客户端：**

#### 2.1 核心功能

- 完整的TypeScript类型定义
- Token缓存机制
- 超时控制
- 详细的错误处理
- 支持所有主要Feishu API端点

#### 2.2 支持的API类别

1. **消息API** (Messages)
   - 发送各种类型消息（文本、富文本、图片、文件、音频、视频）
   - 交互式卡片消息（支持Markdown）
   - 消息回复
   - 消息删除/更新
   - 标记已读

2. **文件上传API**
   - 图片上传 (`uploadImage`)
   - 文件上传 (`uploadFile`)
   - 消息资源下载 (`getMessageResource`)

3. **聊天管理API**
   - 列出聊天 (`listChats`)
   - 获取聊天信息 (`getChatInfo`)
   - 获取聊天成员 (`getChatMembers`)

4. **文档API** (Documents)
   - 获取/创建文档
   - 获取原始内容
   - 操作文档块
   - Markdown转换

5. **知识库API** (Wiki)
   - 列出/创建空间
   - 列出/获取/创建/移动/重命名节点

6. **云盘API** (Drive)
   - 列出/创建/移动/删除文件和文件夹
   - 获取文件元数据

7. **权限API** (Permissions)
   - 列出/添加/移除权限成员

**Incoming版本使用官方SDK包装，功能相对简化。**

### 3. 复杂的Bot消息处理逻辑

**我们的实现 (`src/feishu/bot.ts`) 包含FeishuBot类：**

#### 3.1 核心功能

- 完整的消息上下文处理
- 群组历史记录管理
- Mention检查和验证
- Allowlist验证（DM和群组）
- 群组策略集成
- 消息应答决策逻辑

#### 3.2 关键方法

- `init()`: 初始化Bot并获取Bot信息
- `shouldRespond()`: 判断是否应该响应消息
- `isAllowed()`: 检查发送者是否在allowlist中
- `requiresMention()`: 判断是否需要@提及
- `recordHistory()`: 记录群组消息历史
- `getHistory()`: 获取群组消息历史
- `handleMessage()`: 处理入站消息

**Incoming版本使用SDK的事件分发器，逻辑相对简化。**

### 4. 其他辅助功能

#### 4.1 会话密钥构建

- `buildFeishuSessionKey()`: 构建Feishu聊天的会话密钥
- `buildFeishuPeerId()`: 构建对等方ID

#### 4.2 启动消息

- 我们的实现支持在Gateway启动时向配置的群组发送启动消息
- 配置: `startupChatId` (支持单个或多个chat ID)

#### 4.3 丰富的配置选项

```typescript
// 我们实现中的配置选项
{
  requireMention?: boolean;
  allowFrom?: string[];
  groupAllowFrom?: string[];
  historyLimit?: number;
  timeoutSeconds?: number;
  mediaMaxMb?: number;
  startupChatId?: string | string[];
  // ... 更多选项
}
```

### 5. 完整的TypeScript类型系统

**我们的实现包含详细的类型定义：**

- `FeishuApiResponse<T>`
- `FeishuMessageContent`
- `FeishuPostContent` / `FeishuPostElement`
- `FeishuSendMessageParams` / `FeishuSendMessageResult`
- `FeishuChatInfo` / `FeishuUser`
- `FeishuDocumentMeta` / `FeishuBlock`
- `FeishuWikiSpace` / `FeishuWikiNode`
- `FeishuDriveFile` / `FeishuDriveFileMeta`
- `FeishuPermMember`
- ... 等等

**Incoming版本依赖SDK的类型定义。**

## 功能对比总结

| 功能类别      | 我们的实现 | Incoming实现 | 状态     |
| ------------- | ---------- | ------------ | -------- |
| 基础聊天功能  | ✅         | ✅           | 保留     |
| 官方SDK集成   | ❌         | ✅           | 新增     |
| Feishu工具集  | ✅         | ❌           | 未保留   |
| 完整API客户端 | ✅         | 部分         | 部分保留 |
| 复杂Bot逻辑   | ✅         | 简化         | 部分保留 |
| 群组历史管理  | ✅         | ❌           | 未保留   |
| 启动消息      | ✅         | ❌           | 未保留   |
| Markdown支持  | ✅         | ✅           | 保留     |
| 媒体支持      | ✅         | ✅           | 保留     |

## 后续完善计划

### 第一阶段：核心工具集

1. **重新实现Feishu工具集**
   - 基于新的SDK架构重写doc/wiki/drive/perm工具
   - 集成到plugin系统
   - 编写测试用例

### 第二阶段：增强功能

2. **增强消息处理逻辑**
   - 重新实现群组历史管理
   - 完善mention检查机制
   - 增强allowlist验证

3. **恢复启动消息功能**
   - 支持Gateway启动时发送通知
   - 支持多个目标群组

### 第三阶段：高级功能

4. **扩展API覆盖**
   - 补充文档/知识库/云盘相关API
   - 实现权限管理功能（可选）
   - 添加更多交互式卡片支持

5. **优化和测试**
   - 完善类型定义
   - 增加E2E测试
   - 性能优化

## 技术债务

1. **依赖问题**
   - 我们的实现依赖原生fetch，incoming使用SDK
   - 需要评估是否继续维护自定义客户端或完全迁移到SDK

2. **代码重复**
   - 某些功能在两个版本中有重复实现
   - 需要统一和清理

3. **文档更新**
   - 需要更新用户文档，说明当前支持的功能
   - 需要添加工具使用示例

## 参考资料

- Feishu开放平台文档: https://open.feishu.cn/document/
- @larksuiteoapi/node-sdk: https://github.com/larksuite/node-sdk
- 我们之前的实现提交: b9a325c73, 558b109f0, a58d2b342

## 附注

本次合并选择incoming版本的原因：

1. 使用官方SDK更稳定、更容易维护
2. SDK会持续更新，跟进Feishu API变化
3. 减少自定义代码维护负担

未保留功能的价值：

1. **工具集**是高价值功能，AI agent可以直接操作文档/知识库
2. **复杂Bot逻辑**提供了更好的群组管理和上下文理解
3. **完整API覆盖**为future扩展提供了基础

建议优先级：

1. 高优先级：重新实现工具集（doc, wiki, drive）
2. 中优先级：增强消息处理逻辑和历史管理
3. 低优先级：权限工具（敏感，需要谨慎使用）
