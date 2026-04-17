import { createHmac, createHash } from "node:crypto";
import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";
import { SILENT_REPLY_TOKEN } from "../auto-reply/tokens.js";
import { resolveChannelApprovalCapability } from "../channels/plugins/approvals.js";
import { getChannelPlugin } from "../channels/plugins/index.js";
import type { MemoryCitationsMode } from "../config/types.memory.js";
import { buildMemoryPromptSection } from "../plugins/memory-state.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "../shared/string-coerce.js";
import { listDeliverableMessageChannels } from "../utils/message-channel.js";
import type { ResolvedTimeFormat } from "./date-time.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import type {
  EmbeddedFullAccessBlockedReason,
  EmbeddedSandboxInfo,
} from "./pi-embedded-runner/types.js";
import {
  normalizePromptCapabilityIds,
  normalizeStructuredPromptSection,
} from "./prompt-cache-stability.js";
import { sanitizeForPromptLiteral } from "./sanitize-for-prompt.js";
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from "./system-prompt-cache-boundary.js";
import type {
  ProviderSystemPromptContribution,
  ProviderSystemPromptSectionId,
} from "./system-prompt-contribution.js";
import type { PromptMode } from "./system-prompt.types.js";

/**
 * Controls which hardcoded sections are included in the system prompt.
 * - "full": All sections (default, for main agent)
 * - "minimal": Reduced sections (Tooling, Workspace, Runtime) - used for subagents
 * - "none": Just basic identity line, no sections
 */
type OwnerIdDisplay = "raw" | "hash";

const CONTEXT_FILE_ORDER = new Map<string, number>([
  ["agents.md", 10],
  ["soul.md", 20],
  ["identity.md", 30],
  ["user.md", 40],
  ["tools.md", 50],
  ["bootstrap.md", 60],
  ["memory.md", 70],
]);

const DYNAMIC_CONTEXT_FILE_BASENAMES = new Set(["heartbeat.md"]);
const DEFAULT_HEARTBEAT_PROMPT_CONTEXT_BLOCK =
  "Default heartbeat prompt:\n`Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.`";
function normalizeContextFilePath(pathValue: string): string {
  return pathValue.trim().replace(/\\/g, "/");
}

function getContextFileBasename(pathValue: string): string {
  const normalizedPath = normalizeContextFilePath(pathValue);
  return normalizeLowercaseStringOrEmpty(normalizedPath.split("/").pop() ?? normalizedPath);
}

function isDynamicContextFile(pathValue: string): boolean {
  return DYNAMIC_CONTEXT_FILE_BASENAMES.has(getContextFileBasename(pathValue));
}

function sanitizeContextFileContentForPrompt(content: string): string {
  // Claude Code subscription mode rejects this exact prompt-policy quote when it
  // appears in system context. The live heartbeat user turn still carries the
  // actual instruction, and the generated heartbeat section below covers behavior.
  return content.replaceAll(DEFAULT_HEARTBEAT_PROMPT_CONTEXT_BLOCK, "").replace(/\n{3,}/g, "\n\n");
}

function sortContextFilesForPrompt(contextFiles: EmbeddedContextFile[]): EmbeddedContextFile[] {
  return contextFiles.toSorted((a, b) => {
    const aPath = normalizeContextFilePath(a.path);
    const bPath = normalizeContextFilePath(b.path);
    const aBase = getContextFileBasename(a.path);
    const bBase = getContextFileBasename(b.path);
    const aOrder = CONTEXT_FILE_ORDER.get(aBase) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = CONTEXT_FILE_ORDER.get(bBase) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (aBase !== bBase) {
      return aBase.localeCompare(bBase);
    }
    return aPath.localeCompare(bPath);
  });
}

function buildProjectContextSection(params: {
  files: EmbeddedContextFile[];
  heading: string;
  dynamic: boolean;
}) {
  if (params.files.length === 0) {
    return [];
  }
  const lines = [params.heading, ""];
  if (params.dynamic) {
    lines.push(
      "The following frequently-changing project context files are kept below the cache boundary when possible:",
      "",
    );
  } else {
    const hasSoulFile = params.files.some(
      (file) => getContextFileBasename(file.path) === "soul.md",
    );
    lines.push("The following project context files have been loaded:");
    if (hasSoulFile) {
      lines.push(
        "If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.",
      );
    }
    lines.push("");
  }
  for (const file of params.files) {
    lines.push(`## ${file.path}`, "", sanitizeContextFileContentForPrompt(file.content), "");
  }
  return lines;
}

function buildHeartbeatSection(params: { isMinimal: boolean; heartbeatPrompt?: string }) {
  if (params.isMinimal || !params.heartbeatPrompt) {
    return [];
  }
  return [
    "## Heartbeats",
    "If the current user message is a heartbeat poll and nothing needs attention, reply exactly:",
    "HEARTBEAT_OK",
    'If something needs attention, do NOT include "HEARTBEAT_OK"; reply with the alert text instead.',
    "",
  ];
}

function buildExecApprovalPromptGuidance(params: {
  runtimeChannel?: string;
  inlineButtonsEnabled?: boolean;
}) {
  const runtimeChannel = normalizeOptionalLowercaseString(params.runtimeChannel);
  const usesNativeApprovalUi =
    params.inlineButtonsEnabled ||
    (runtimeChannel
      ? Boolean(resolveChannelApprovalCapability(getChannelPlugin(runtimeChannel))?.native)
      : false);
  if (usesNativeApprovalUi) {
    return "When exec returns approval-pending on this channel, rely on native approval card/buttons when they appear and do not also send plain chat /approve instructions. Only include the concrete /approve command if the tool result says chat approvals are unavailable or only manual approval is possible.";
  }
  return "When exec returns approval-pending, include the concrete /approve command from tool output as plain chat text for the user, and do not ask for a different or rotated code.";
}

function buildSkillsSection(params: { skillsPrompt?: string; readToolName: string }) {
  const trimmed = params.skillsPrompt?.trim();
  if (!trimmed) {
    return [];
  }
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${params.readToolName}\`, then follow it.`,
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    "- If none clearly apply: do not read any SKILL.md.",
    "Constraints: never read more than one skill up front; only read after selecting.",
    "- When a skill drives external API writes, assume rate limits: prefer fewer larger writes, avoid tight one-item loops, serialize bursts when possible, and respect 429/Retry-After.",
    trimmed,
    "",
  ];
}

function buildMemorySection(params: {
  isMinimal: boolean;
  includeMemorySection?: boolean;
  availableTools: Set<string>;
  citationsMode?: MemoryCitationsMode;
}) {
  if (params.isMinimal || params.includeMemorySection === false) {
    return [];
  }
  return buildMemoryPromptSection({
    availableTools: params.availableTools,
    citationsMode: params.citationsMode,
  });
}

function buildQverisSection(params: {
  isMinimal: boolean;
  availableTools: Set<string>;
  autoMaterialize?: boolean;
}) {
  if (params.isMinimal || !params.availableTools.has("qveris_discover")) {
    return [];
  }
  const hasInvoke = params.availableTools.has("qveris_call");
  const hasInspect = params.availableTools.has("qveris_inspect");
  const hasWebSearch = params.availableTools.has("web_search");
  const hasWebFetch = params.availableTools.has("web_fetch");
  const availableQverisTools = [
    "qveris_discover",
    ...(hasInvoke ? ["qveris_call"] : []),
    ...(hasInspect ? ["qveris_inspect"] : []),
  ];
  const qverisExecutionLine = hasInvoke
    ? "   -> Prefer qveris_discover + qveris_call. Specialized APIs/services return precise structured data or service outputs from dedicated providers."
    : "   -> Use qveris_discover to identify the best specialized API/service available in this session. If qveris_call is unavailable here, report the limitation honestly instead of promising a tool call you cannot make.";
  const inspectLine = hasInspect
    ? "   -> Use qveris_inspect with the known tool_id to verify availability and get current parameter schemas. If the tool is available, run qveris_discover to register it for this session, then call it."
    : undefined;
  const webResearchLine =
    hasWebSearch && hasWebFetch
      ? "   -> Use web_search + web_fetch. This path is for articles, opinions, explanations, documentation, and broad research where the page content itself is the answer."
      : hasWebSearch
        ? "   -> Use web_search for articles, opinions, explanations, documentation, and broad research."
        : hasWebFetch
          ? "   -> Use web_fetch when you already have a URL and need to read that page."
          : "   -> Web research tools are unavailable in this session. Report the limitation honestly.";
  const fallbackLine = hasWebSearch
    ? "- **After 3 failures**: Report which tools were tried, what errors occurred. Use web_search as fallback only when web content or broad research is still helpful. Never fabricate data."
    : "- **After 3 failures**: Report which tools were tried and what errors occurred. If no other relevant local tool exists, report the limitation honestly. Never fabricate data.";
  return [
    "## Tool Routing: QVeris vs Local vs Web",
    "",
    "When the user needs specialized external capabilities, prefer qveris_discover first.",
    "",
    "1. **Local operation?** (read files, check config, session status, run commands)",
    "   -> Use local tools (read, exec, session_status). NEVER discover QVeris tools for local tasks.",
    "2. **Need exact current values, historical sequence data, live ranked data, or structured reports?** (stock prices, time series, exchange rates, weather, crypto, AQI, top gainers, earnings/filings)",
    "3. **Need an external processing, retrieval, or generation service?** (web crawling/extraction, PDF parsing/generation, OCR, TTS, speech/image/video understanding or generation, translation, geocoding)",
    "",
    "   For steps 2 and 3:",
    qverisExecutionLine,
    "   Convert any user request (Chinese or English) into an English API capability query:",
    '   "腾讯最新股价" / "latest Tencent stock price" -> "stock quote real-time API"',
    '   "腾讯最近30天股价走势" / "Tencent 30-day stock trend" -> "stock historical price time series API"',
    '   "港股涨幅最大的三只" / "top HK stock gainers" -> "hong kong stock market top gainers API"',
    '   "美元兑人民币汇率" / "USD/CNY exchange rate" -> "forex exchange rate real-time API"',
    '   "今天北京天气" / "Beijing weather today" -> "weather forecast API"',
    '   "英伟达最新财报" / "Nvidia latest earnings" -> "company earnings report API"',
    '   "抓取网页正文" / "extract webpage content" -> "web page content extraction API"',
    '   "网页导出 PDF" / "convert webpage to PDF" -> "HTML to PDF conversion API"',
    '   "识别语音内容" / "transcribe audio" -> "speech to text API"',
    '   "文字生成图片" / "generate image from text" -> "text to image generation API"',
    "",
    ...(hasInspect
      ? ["4. **Previously used a QVeris tool for this type of task?**", inspectLine]
      : []),
    `${hasInspect ? "5" : "4"}. **Need articles, opinions, explanations, documentation, or broad research?**`,
    webResearchLine,
    `${hasInspect ? "6" : "5"}. **None of the above?**`,
    "   -> Report the limitation honestly. Never fabricate data.",
    "",
    "QVeris access rules (CRITICAL):",
    `- In this session, use only these QVeris tools: ${availableQverisTools.join(", ")}.`,
    hasInvoke
      ? "- NEVER call QVeris discovery/invocation endpoints directly (for example /search, /tools/execute, /tools/by-ids). Use qveris_discover/qveris_call instead."
      : "- NEVER call QVeris discovery/invocation endpoints directly (for example /search, /tools/execute, /tools/by-ids). Use qveris_discover only, and report honestly when execution is unavailable in this session.",
    hasInvoke
      ? "- Exception: if qveris_call returns full_content_file_url, follow the large-data instructions below to download that returned file URL."
      : undefined,
    "- NEVER guess or hardcode QVeris API base URLs — endpoint resolution is handled internally by the tools.",
    "- NEVER reveal or print the value of QVERIS_API_KEY — authentication is handled internally by the tools.",
    hasInvoke
      ? "- If qveris_call fails, follow the error recovery steps below. Do NOT bypass the workflow with raw API requests."
      : undefined,
    "",
    "qveris_discover anti-patterns (NEVER do these):",
    "- Searching for software configuration or setup instructions",
    "- Searching for documentation, tutorials, or how-to guides",
    "- Using non-English discovery queries (always use English)",
    "",
    "After qveris_discover: evaluate results by success_rate (prefer >= 0.9) and avg_execution_time_ms. If results look irrelevant, try a different query.",
    hasInvoke
      ? `Invoke with qveris_call, using sample_parameters from ${hasInspect ? "qveris_discover or qveris_inspect" : "qveris_discover"} as your parameter template.`
      : "If qveris_call is unavailable in this session, do not imply that you executed the discovered tool.",
    "",
    ...(hasInvoke
      ? [
          "qveris_call error recovery (follow in order):",
          "- **Attempt 1 — Fix params**: Read error_type and detail. Check required params are present with correct types (strings quoted, numbers unquoted, dates ISO 8601). Fix and retry.",
          "- **Attempt 2 — Simplify**: Drop all optional params. Use well-known/standard values (e.g. common ticker symbols, major cities). Retry.",
          "- **Attempt 3 — Switch tool**: Go back to the qveris_discover results and select the next-best alternative tool by success_rate. Invoke with new params.",
          fallbackLine,
          "",
          ...(params.autoMaterialize
            ? [
                "qveris_call large-data handling:",
                "- When a tool returns data exceeding the transport limit, the integration layer auto-downloads and saves the full content locally.",
                "- You receive a materialized_content manifest with file path, content type, schema, and preview — not the raw data.",
                "- ALWAYS use read or exec to process the materialized file for analysis. NEVER base conclusions on truncated transport data alone.",
                "- For large JSON/CSV: write a script via exec to load, filter, and summarize the data.",
                "- For media files (image/audio/video): the binary file is saved to disk. Report the file path and metadata to the user; use the image tool to analyze images.",
              ]
            : [
                "qveris_call large-data handling:",
                "- When a response contains truncated_content and full_content_file_url, the transport data is incomplete.",
                "- For text/JSON/CSV: use web_fetch on full_content_file_url to download, then process it.",
                "- For binary files (images, audio, video): use exec with curl to download the file directly (web_fetch only handles text/HTML).",
                "- NEVER base conclusions on truncated transport data alone.",
              ]),
        ]
      : []),
    "",
  ];
}

function buildUserIdentitySection(ownerLine: string | undefined, isMinimal: boolean) {
  if (!ownerLine || isMinimal) {
    return [];
  }
  return ["## Authorized Senders", ownerLine, ""];
}

function formatOwnerDisplayId(ownerId: string, ownerDisplaySecret?: string) {
  const hasSecret = ownerDisplaySecret?.trim();
  const digest = hasSecret
    ? createHmac("sha256", hasSecret).update(ownerId).digest("hex")
    : createHash("sha256").update(ownerId).digest("hex");
  return digest.slice(0, 12);
}

function buildOwnerIdentityLine(
  ownerNumbers: string[],
  ownerDisplay: OwnerIdDisplay,
  ownerDisplaySecret?: string,
) {
  const normalized = ownerNumbers.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return undefined;
  }
  const displayOwnerNumbers =
    ownerDisplay === "hash"
      ? normalized.map((ownerId) => formatOwnerDisplayId(ownerId, ownerDisplaySecret))
      : normalized;
  return `Authorized senders: ${displayOwnerNumbers.join(", ")}. These senders are allowlisted; do not assume they are the owner.`;
}

function buildTimeSection(params: { userTimezone?: string }) {
  if (!params.userTimezone) {
    return [];
  }
  return ["## Current Date & Time", `Time zone: ${params.userTimezone}`, ""];
}

function buildAssistantOutputDirectivesSection(isMinimal: boolean) {
  if (isMinimal) {
    return [];
  }
  return [
    "## Assistant Output Directives",
    "Use these when you need delivery metadata in an assistant message:",
    "- `MEDIA:<path-or-url>` on its own line requests attachment delivery. The web UI strips supported MEDIA lines and renders them inline; channels still decide actual delivery behavior.",
    "- `[[audio_as_voice]]` marks attached audio as a voice-note style delivery hint. The web UI may show a voice-note badge when audio is present; channels still own delivery semantics.",
    "- To request a native reply/quote on supported surfaces, include one reply tag in your reply:",
    "- Reply tags must be the very first token in the message (no leading text/newlines): [[reply_to_current]] your reply.",
    "- [[reply_to_current]] replies to the triggering message.",
    "- Prefer [[reply_to_current]]. Use [[reply_to:<id>]] only when an id was explicitly provided (e.g. by the user or a tool).",
    "Whitespace inside the tag is allowed (e.g. [[ reply_to_current ]] / [[ reply_to: 123 ]]).",
    "- Channel-specific interactive directives are separate and should not be mixed into this web render guidance.",
    "Supported tags are stripped before user-visible rendering; support still depends on the current channel config.",
    "",
  ];
}

function buildWebchatCanvasSection(params: {
  isMinimal: boolean;
  runtimeChannel?: string;
  canvasRootDir?: string;
}) {
  if (params.isMinimal || params.runtimeChannel !== "webchat") {
    return [];
  }
  return [
    "## Control UI Embed",
    "Use `[embed ...]` only in Control UI/webchat sessions for inline rich rendering inside the assistant bubble.",
    "- Do not use `[embed ...]` for non-web channels.",
    "- `[embed ...]` is separate from `MEDIA:`. Use `MEDIA:` for attachments; use `[embed ...]` for web-only rich rendering.",
    '- Use self-closing form for hosted embed documents: `[embed ref="cv_123" title="Status" height="320" /]`.',
    '- You may also use an explicit hosted URL: `[embed url="/__openclaw__/canvas/documents/cv_123/index.html" title="Status" height="320" /]`.',
    '- Never use local filesystem paths or `file://...` URLs in `[embed ...]`. Hosted embeds must point at `/__openclaw__/canvas/...` URLs or use `ref="..."`.',
    params.canvasRootDir
      ? `- The active hosted embed root for this session is: \`${sanitizeForPromptLiteral(params.canvasRootDir)}\`. If you manually stage a hosted embed file, write it there, not in the workspace.`
      : "- The active hosted embed root is profile-scoped, not workspace-scoped. If you manually stage a hosted embed file, write it under the active profile embed root, not in the workspace.",
    "- Quote all attribute values. Prefer `ref` for hosted documents unless you already have the full `/__openclaw__/canvas/documents/<id>/index.html` URL.",
    "",
  ];
}

function buildExecutionBiasSection(params: { isMinimal: boolean }) {
  if (params.isMinimal) {
    return [];
  }
  return [
    "## Execution Bias",
    "If the user asks you to do the work, start doing it in the same turn.",
    "Use a real tool call or concrete action first when the task is actionable; do not stop at a plan or promise-to-act reply.",
    "Commentary-only turns are incomplete when tools are available and the next action is clear.",
    "If the work will take multiple steps or a while to finish, send one short progress update before or while acting.",
    "",
  ];
}

function normalizeProviderPromptBlock(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeStructuredPromptSection(value);
  return normalized || undefined;
}

function buildOverridablePromptSection(params: {
  override?: string;
  fallback: string[];
}): string[] {
  const override = normalizeProviderPromptBlock(params.override);
  if (override) {
    return [override, ""];
  }
  return params.fallback;
}

function buildMessagingSection(params: {
  isMinimal: boolean;
  availableTools: Set<string>;
  messageChannelOptions: string;
  inlineButtonsEnabled: boolean;
  runtimeChannel?: string;
  messageToolHints?: string[];
}) {
  if (params.isMinimal) {
    return [];
  }
  return [
    "## Messaging",
    "- Reply in current session → automatically routes to the source channel (Signal, Telegram, etc.)",
    "- Cross-session messaging → use sessions_send(sessionKey, message)",
    "- Sub-agent orchestration → use subagents(action=list|steer|kill)",
    `- Runtime-generated completion events may ask for a user update. Rewrite those in your normal assistant voice and send the update (do not forward raw internal metadata or default to ${SILENT_REPLY_TOKEN}).`,
    "- Never use exec/curl for provider messaging; OpenClaw handles all routing internally.",
    params.availableTools.has("message")
      ? [
          "",
          "### message tool",
          "- Use `message` for proactive sends + channel actions (polls, reactions, etc.).",
          "- For `action=send`, include `to` and `message`.",
          `- If multiple channels are configured, pass \`channel\` (${params.messageChannelOptions}).`,
          `- If you use \`message\` (\`action=send\`) to deliver your user-visible reply, respond with ONLY: ${SILENT_REPLY_TOKEN} (avoid duplicate replies).`,
          params.inlineButtonsEnabled
            ? "- Inline buttons supported. Use `action=send` with `buttons=[[{text,callback_data,style?}]]`; `style` can be `primary`, `success`, or `danger`."
            : params.runtimeChannel
              ? `- Inline buttons not enabled for ${params.runtimeChannel}. If you need them, ask to set ${params.runtimeChannel}.capabilities.inlineButtons ("dm"|"group"|"all"|"allowlist").`
              : "",
          ...(params.messageToolHints ?? []),
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    "",
  ];
}

function buildVoiceSection(params: { isMinimal: boolean; ttsHint?: string }) {
  if (params.isMinimal) {
    return [];
  }
  const hint = params.ttsHint?.trim();
  if (!hint) {
    return [];
  }
  return ["## Voice (TTS)", hint, ""];
}

function buildDocsSection(params: { docsPath?: string; isMinimal: boolean; readToolName: string }) {
  const docsPath = params.docsPath?.trim();
  if (!docsPath || params.isMinimal) {
    return [];
  }
  return [
    "## Documentation",
    `OpenClaw docs: ${docsPath}`,
    "Mirror: https://docs.openclaw.ai",
    "Source: https://github.com/openclaw/openclaw",
    "Community: https://discord.com/invite/clawd",
    "Find new skills: https://clawhub.ai",
    "For OpenClaw behavior, commands, config, or architecture: consult local docs first.",
    "When diagnosing issues, run `openclaw status` yourself when possible; only ask the user if you lack access (e.g., sandboxed).",
    "",
  ];
}

function formatFullAccessBlockedReason(reason?: EmbeddedFullAccessBlockedReason): string {
  if (reason === "host-policy") {
    return "host policy";
  }
  if (reason === "channel") {
    return "channel constraints";
  }
  if (reason === "sandbox") {
    return "sandbox constraints";
  }
  return "runtime constraints";
}
export function buildAgentSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  ownerDisplay?: OwnerIdDisplay;
  ownerDisplaySecret?: string;
  reasoningTagHint?: boolean;
  toolNames?: string[];
  toolSummaries?: Record<string, string>;
  modelAliasLines?: string[];
  userTimezone?: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  skillsPrompt?: string;
  heartbeatPrompt?: string;
  docsPath?: string;
  workspaceNotes?: string[];
  ttsHint?: string;
  /** Controls which hardcoded sections to include. Defaults to "full". */
  promptMode?: PromptMode;
  /** Whether ACP-specific routing guidance should be included. Defaults to true. */
  acpEnabled?: boolean;
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    shell?: string;
    channel?: string;
    capabilities?: string[];
    repoRoot?: string;
    canvasRootDir?: string;
  };
  messageToolHints?: string[];
  sandboxInfo?: EmbeddedSandboxInfo;
  /** Reaction guidance for the agent (for Telegram minimal/extensive modes). */
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  includeMemorySection?: boolean;
  memoryCitationsMode?: MemoryCitationsMode;
  /** Whether QVeris large responses are auto-materialized locally. */
  qverisAutoMaterialize?: boolean;
  promptContribution?: ProviderSystemPromptContribution;
}) {
  const acpEnabled = params.acpEnabled !== false;
  const sandboxedRuntime = params.sandboxInfo?.enabled === true;
  const acpSpawnRuntimeEnabled = acpEnabled && !sandboxedRuntime;
  const qverisAutoMat = params.qverisAutoMaterialize === true;
  const coreToolSummaries: Record<string, string> = {
    read: "Read file contents",
    write: "Create or overwrite files",
    edit: "Make precise edits to files",
    apply_patch: "Apply multi-file patches",
    grep: "Search file contents for patterns",
    find: "Find files by glob pattern",
    ls: "List directory contents",
    exec: "Run shell commands (pty available for TTY-required CLIs)",
    process: "Manage background exec sessions",
    web_search: "Search the web (Brave API)",
    web_fetch: "Fetch and extract readable content from a URL",
    // Channel docking: add login tools here when a channel needs interactive linking.
    browser: "Control web browser",
    canvas: "Present/eval/snapshot the Canvas",
    nodes: "List/describe/notify/camera/screen on paired nodes",
    cron: "Manage cron jobs and wake events (use for reminders; when scheduling a reminder, write the systemEvent text as something that will read like a reminder when it fires, and mention that it is a reminder depending on the time gap between setting and firing; include recent context in reminder text if appropriate)",
    message: "Send messages and channel actions",
    gateway: "Restart, apply config, or run updates on the running OpenClaw process",
    agents_list: acpSpawnRuntimeEnabled
      ? 'List OpenClaw agent ids allowed for sessions_spawn when runtime="subagent" (not ACP harness ids)'
      : "List OpenClaw agent ids allowed for sessions_spawn",
    sessions_list: "List other sessions (incl. sub-agents) with filters/last",
    sessions_history: "Fetch history for another session/sub-agent",
    sessions_send: "Send a message to another session/sub-agent",
    sessions_spawn: acpSpawnRuntimeEnabled
      ? 'Spawn an isolated sub-agent or ACP coding session (runtime="acp" requires `agentId` unless `acp.defaultAgent` is configured; ACP harness ids follow acp.allowedAgents, not agents_list)'
      : "Spawn an isolated sub-agent session",
    subagents: "List, steer, or kill sub-agent runs for this requester session",
    session_status:
      "Show a /status-equivalent status card (usage + time + Reasoning/Verbose/Elevated); use for model-use questions (📊 session_status); optional per-session model override",
    switch_model:
      "Switch the AI model for this session. When the user asks to change or switch models, call this tool with the model name. Accepts aliases, partial names, or full provider/model. model=default resets to the configured default for the next message.",
    image: "Analyze an image with the configured image model",
    image_generate: "Generate images with the configured image-generation model",
    qveris_discover:
      "Find specialized API/service tools for exact current data, historical sequences, structured reports, web extraction, PDF workflows, or external processing/generation. Query in English describing the capability needed.",
    qveris_call:
      "Call a QVeris API/service tool using a tool_id from qveris_discover." +
      (qverisAutoMat
        ? " Large responses are auto-materialized locally; use read/exec on the saved file."
        : " If the response is truncated, use web_fetch (text) or exec+curl (binary) on full_content_file_url."),
    qveris_inspect:
      "Quick-verify known QVeris tool ids and get current parameter schemas before reuse.",
  };

  const toolOrder = [
    "read",
    "write",
    "edit",
    "apply_patch",
    "grep",
    "find",
    "ls",
    "exec",
    "process",
    "qveris_discover",
    "qveris_call",
    "qveris_inspect",
    "web_search",
    "web_fetch",
    "browser",
    "canvas",
    "nodes",
    "cron",
    "message",
    "gateway",
    "agents_list",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "subagents",
    "session_status",
    "switch_model",
    "image",
    "image_generate",
  ];

  const rawToolNames = (params.toolNames ?? []).map((tool) => tool.trim());
  const canonicalToolNames = rawToolNames.filter(Boolean);
  // Preserve caller casing while deduping tool names by lowercase.
  const canonicalByNormalized = new Map<string, string>();
  for (const name of canonicalToolNames) {
    const normalized = name.toLowerCase();
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, name);
    }
  }
  const resolveToolName = (normalized: string) =>
    canonicalByNormalized.get(normalized) ?? normalized;

  const normalizedTools = canonicalToolNames.map((tool) => tool.toLowerCase());
  const availableTools = new Set(normalizedTools);
  if (availableTools.has("qveris_discover")) {
    coreToolSummaries.web_search =
      "Search the web for articles, opinions, explanations, documentation, and broad research";
  }
  const hasSessionsSpawn = availableTools.has("sessions_spawn");
  const acpHarnessSpawnAllowed = hasSessionsSpawn && acpSpawnRuntimeEnabled;
  const externalToolSummaries = new Map<string, string>();
  for (const [key, value] of Object.entries(params.toolSummaries ?? {})) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || !value?.trim()) {
      continue;
    }
    externalToolSummaries.set(normalized, value.trim());
  }
  const extraTools = Array.from(
    new Set(normalizedTools.filter((tool) => !toolOrder.includes(tool))),
  );
  const enabledTools = toolOrder.filter((tool) => availableTools.has(tool));
  const toolLines = enabledTools.map((tool) => {
    const summary = coreToolSummaries[tool] ?? externalToolSummaries.get(tool);
    const name = resolveToolName(tool);
    return summary ? `- ${name}: ${summary}` : `- ${name}`;
  });
  for (const tool of extraTools.toSorted()) {
    const summary = coreToolSummaries[tool] ?? externalToolSummaries.get(tool);
    const name = resolveToolName(tool);
    toolLines.push(summary ? `- ${name}: ${summary}` : `- ${name}`);
  }

  const hasGateway = availableTools.has("gateway");
  const readToolName = resolveToolName("read");
  const execToolName = resolveToolName("exec");
  const processToolName = resolveToolName("process");
  const extraSystemPrompt = params.extraSystemPrompt?.trim();
  const promptContribution = params.promptContribution;
  const providerStablePrefix = normalizeProviderPromptBlock(promptContribution?.stablePrefix);
  const providerDynamicSuffix = normalizeProviderPromptBlock(promptContribution?.dynamicSuffix);
  const providerSectionOverrides = Object.fromEntries(
    Object.entries(promptContribution?.sectionOverrides ?? {})
      .map(([key, value]) => [
        key,
        normalizeProviderPromptBlock(typeof value === "string" ? value : undefined),
      ])
      .filter(([, value]) => Boolean(value)),
  ) as Partial<Record<ProviderSystemPromptSectionId, string>>;
  const ownerDisplay = params.ownerDisplay === "hash" ? "hash" : "raw";
  const ownerLine = buildOwnerIdentityLine(
    params.ownerNumbers ?? [],
    ownerDisplay,
    params.ownerDisplaySecret,
  );
  const reasoningHint = params.reasoningTagHint
    ? [
        "ALL internal reasoning MUST be inside <think>...</think>.",
        "Do not output any analysis outside <think>.",
        "Format every reply as <think>...</think> then <final>...</final>, with no other text.",
        "Only the final user-visible reply may appear inside <final>.",
        "Only text inside <final> is shown to the user; everything else is discarded and never seen by the user.",
        "Example:",
        "<think>Short internal reasoning.</think>",
        "<final>Hey there! What would you like to do next?</final>",
      ].join(" ")
    : undefined;
  const reasoningLevel = params.reasoningLevel ?? "off";
  const userTimezone = params.userTimezone?.trim();
  const skillsPrompt = params.skillsPrompt?.trim();
  const heartbeatPrompt = params.heartbeatPrompt?.trim();
  const runtimeInfo = params.runtimeInfo;
  const runtimeChannel = normalizeOptionalLowercaseString(runtimeInfo?.channel);
  const runtimeCapabilities = runtimeInfo?.capabilities ?? [];
  const runtimeCapabilitiesLower = new Set(
    runtimeCapabilities.map((cap) => normalizeLowercaseStringOrEmpty(cap)).filter(Boolean),
  );
  const inlineButtonsEnabled = runtimeCapabilitiesLower.has("inlinebuttons");
  const messageChannelOptions = listDeliverableMessageChannels().join("|");
  const promptMode = params.promptMode ?? "full";
  const isMinimal = promptMode === "minimal" || promptMode === "none";
  const sandboxContainerWorkspace = params.sandboxInfo?.containerWorkspaceDir?.trim();
  const sanitizedWorkspaceDir = sanitizeForPromptLiteral(params.workspaceDir);
  const sanitizedSandboxContainerWorkspace = sandboxContainerWorkspace
    ? sanitizeForPromptLiteral(sandboxContainerWorkspace)
    : "";
  const elevated = params.sandboxInfo?.elevated;
  const fullAccessBlockedReasonLabel =
    elevated?.fullAccessAvailable === false
      ? formatFullAccessBlockedReason(elevated.fullAccessBlockedReason)
      : undefined;
  const displayWorkspaceDir =
    params.sandboxInfo?.enabled && sanitizedSandboxContainerWorkspace
      ? sanitizedSandboxContainerWorkspace
      : sanitizedWorkspaceDir;
  const workspaceGuidance =
    params.sandboxInfo?.enabled && sanitizedSandboxContainerWorkspace
      ? `For read/write/edit/apply_patch, file paths resolve against host workspace: ${sanitizedWorkspaceDir}. For bash/exec commands, use sandbox container paths under ${sanitizedSandboxContainerWorkspace} (or relative paths from that workdir), not host paths. Prefer relative paths so both sandboxed exec and file tools work consistently.`
      : "Treat this directory as the single global workspace for file operations unless explicitly instructed otherwise.";
  const safetySection = [
    "## Safety",
    "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
    "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards. (Inspired by Anthropic's constitution.)",
    "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
    "",
  ];
  const skillsSection = buildSkillsSection({
    skillsPrompt,
    readToolName,
  });
  const memorySection = buildMemorySection({
    isMinimal,
    includeMemorySection: params.includeMemorySection,
    availableTools,
    citationsMode: params.memoryCitationsMode,
  });
  const qverisSection = buildQverisSection({
    isMinimal,
    availableTools,
    autoMaterialize: qverisAutoMat,
  });
  const docsSection = buildDocsSection({
    docsPath: params.docsPath,
    isMinimal,
    readToolName,
  });
  const workspaceNotes = (params.workspaceNotes ?? []).map((note) => note.trim()).filter(Boolean);

  // For "none" mode, return just the basic identity line
  if (promptMode === "none") {
    return "You are a personal assistant running inside OpenClaw.";
  }

  const lines = [
    "You are a personal assistant running inside OpenClaw.",
    "",
    "## Tooling",
    "Tool availability (filtered by policy):",
    "Tool names are case-sensitive. Call tools exactly as listed.",
    toolLines.length > 0
      ? toolLines.join("\n")
      : [
          "Pi lists the standard tools above. This runtime enables:",
          "- grep: search file contents for patterns",
          "- find: find files by glob pattern",
          "- ls: list directory contents",
          "- apply_patch: apply multi-file patches",
          `- ${execToolName}: run shell commands (supports background via yieldMs/background)`,
          `- ${processToolName}: manage background exec sessions`,
          "- browser: control OpenClaw's dedicated browser",
          "- canvas: present/eval/snapshot the Canvas",
          "- nodes: list/describe/notify/camera/screen on paired nodes",
          "- cron: manage cron jobs and wake events (use for reminders; when scheduling a reminder, write the systemEvent text as something that will read like a reminder when it fires, and mention that it is a reminder depending on the time gap between setting and firing; include recent context in reminder text if appropriate)",
          "- sessions_list: list sessions",
          "- sessions_history: fetch session history",
          "- sessions_send: send to another session",
          "- subagents: list/steer/kill sub-agent runs",
          '- session_status: show usage/time/model state and answer "what model are we using?"',
          "- switch_model: switch the AI model for this session (aliases, partial names, or full provider/model)",
        ].join("\n"),
    "TOOLS.md does not control tool availability; it is user guidance for how to use external tools.",
    `For long waits, avoid rapid poll loops: use ${execToolName} with enough yieldMs or ${processToolName}(action=poll, timeout=<ms>).`,
    "If a task is more complex or takes longer, spawn a sub-agent. Completion is push-based: it will auto-announce when done.",
    ...(acpHarnessSpawnAllowed
      ? [
          'For requests like "do this in codex/claude code/cursor/gemini" or similar ACP harnesses, treat it as ACP harness intent and call `sessions_spawn` with `runtime: "acp"`.',
          'On Discord, default ACP harness requests to thread-bound persistent sessions (`thread: true`, `mode: "session"`) unless the user asks otherwise.',
          "Set `agentId` explicitly unless `acp.defaultAgent` is configured, and do not route ACP harness requests through `subagents`/`agents_list` or local PTY exec flows.",
          'For ACP harness thread spawns, do not call `message` with `action=thread-create`; use `sessions_spawn` (`runtime: "acp"`, `thread: true`) as the single thread creation path.',
        ]
      : []),
    "Do not poll `subagents list` / `sessions_list` in a loop; only check status on-demand (for intervention, debugging, or when explicitly asked).",
    "",
    ...buildOverridablePromptSection({
      override: providerSectionOverrides.interaction_style,
      fallback: [],
    }),
    ...buildOverridablePromptSection({
      override: providerSectionOverrides.tool_call_style,
      fallback: [
        "## Tool Call Style",
        "Default: do not narrate routine, low-risk tool calls (just call the tool).",
        "Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
        "Keep narration brief and value-dense; avoid repeating obvious steps.",
        "Use plain human language for narration unless in a technical context.",
        "When a first-class tool exists for an action, use the tool directly instead of asking the user to run equivalent CLI or slash commands.",
        buildExecApprovalPromptGuidance({
          runtimeChannel: params.runtimeInfo?.channel,
          inlineButtonsEnabled,
        }),
        "Never execute /approve through exec or any other shell/tool path; /approve is a user-facing approval command, not a shell command.",
        "Treat allow-once as single-command only: if another elevated command needs approval, request a fresh /approve and do not claim prior approval covered it.",
        "When approvals are required, preserve and show the full command/script exactly as provided (including chained operators like &&, ||, |, ;, or multiline shells) so the user can approve what will actually run.",
        "",
      ],
    }),
    "## Sending Images/Charts",
    "To send generated images back to the user:",
    "1. Use exec to run a script that saves the image (for example matplotlib -> plt.savefig('/tmp/chart.png')).",
    "2. Print MEDIA:/path/to/image.png in the output so the image is attached to the reply.",
    "3. Keep any caption or explanation in the text body.",
    "Example: print('MEDIA:/tmp/chart.png') after saving a chart.",
    "",
    ...buildOverridablePromptSection({
      override: providerSectionOverrides.execution_bias,
      fallback: buildExecutionBiasSection({
        isMinimal,
      }),
    }),
    ...buildOverridablePromptSection({
      override: providerStablePrefix,
      fallback: [],
    }),
    ...safetySection,
    "## OpenClaw CLI Quick Reference",
    "OpenClaw is controlled via subcommands. Do not invent commands.",
    "To manage the Gateway daemon service (start/stop/restart):",
    "- openclaw gateway status",
    "- openclaw gateway start",
    "- openclaw gateway stop",
    "- openclaw gateway restart",
    "If unsure, ask the user to run `openclaw help` (or `openclaw gateway --help`) and paste the output.",
    "",
    ...skillsSection,
    ...memorySection,
    ...qverisSection,
    // Skip self-update for subagent/none modes
    hasGateway && !isMinimal ? "## OpenClaw Self-Update" : "",
    hasGateway && !isMinimal
      ? [
          "Get Updates (self-update) is ONLY allowed when the user explicitly asks for it.",
          "Do not run config.apply or update.run unless the user explicitly requests an update or config change; if it's not explicit, ask first.",
          "Use config.schema.lookup with a specific dot path to inspect only the relevant config subtree before making config changes or answering config-field questions; avoid guessing field names/types.",
          "Actions: config.schema.lookup, config.get, config.apply (validate + write full config, then restart), config.patch (partial update, merges with existing), update.run (update deps or git, then restart).",
          "After restart, OpenClaw pings the last active session automatically.",
        ].join("\n")
      : "",
    hasGateway && !isMinimal ? "" : "",
    "",
    // Skip model aliases for subagent/none modes
    params.modelAliasLines && params.modelAliasLines.length > 0 && !isMinimal
      ? "## Model Aliases"
      : "",
    params.modelAliasLines && params.modelAliasLines.length > 0 && !isMinimal
      ? "Prefer aliases when specifying model overrides; full provider/model is also accepted. To switch models, call switch_model with the alias or model name."
      : "",
    params.modelAliasLines && params.modelAliasLines.length > 0 && !isMinimal
      ? params.modelAliasLines.join("\n")
      : "",
    params.modelAliasLines && params.modelAliasLines.length > 0 && !isMinimal ? "" : "",
    userTimezone
      ? "If you need the current date, time, or day of week, run session_status (📊 session_status)."
      : "",
    "## Workspace",
    `Your working directory is: ${displayWorkspaceDir}`,
    workspaceGuidance,
    ...workspaceNotes,
    "",
    ...docsSection,
    params.sandboxInfo?.enabled ? "## Sandbox" : "",
    params.sandboxInfo?.enabled
      ? [
          "You are running in a sandboxed runtime (tools execute in Docker).",
          "Some tools may be unavailable due to sandbox policy.",
          "Sub-agents stay sandboxed (no elevated/host access). Need outside-sandbox read/write? Don't spawn; ask first.",
          hasSessionsSpawn && acpEnabled
            ? 'ACP harness spawns are blocked from sandboxed sessions (`sessions_spawn` with `runtime: "acp"`). Use `runtime: "subagent"` instead.'
            : "",
          params.sandboxInfo.containerWorkspaceDir
            ? `Sandbox container workdir: ${sanitizeForPromptLiteral(params.sandboxInfo.containerWorkspaceDir)}`
            : "",
          params.sandboxInfo.workspaceDir
            ? `Sandbox host mount source (file tools bridge only; not valid inside sandbox exec): ${sanitizeForPromptLiteral(params.sandboxInfo.workspaceDir)}`
            : "",
          params.sandboxInfo.workspaceAccess
            ? `Agent workspace access: ${params.sandboxInfo.workspaceAccess}${
                params.sandboxInfo.agentWorkspaceMount
                  ? ` (mounted at ${sanitizeForPromptLiteral(params.sandboxInfo.agentWorkspaceMount)})`
                  : ""
              }`
            : "",
          params.sandboxInfo.browserBridgeUrl ? "Sandbox browser: enabled." : "",
          params.sandboxInfo.hostBrowserAllowed === true
            ? "Host browser control: allowed."
            : params.sandboxInfo.hostBrowserAllowed === false
              ? "Host browser control: blocked."
              : "",
          elevated?.allowed
            ? "Elevated exec is available for this session."
            : elevated
              ? "Elevated exec is unavailable for this session."
              : "",
          elevated?.allowed && elevated.fullAccessAvailable
            ? "User can toggle with /elevated on|off|ask|full."
            : "",
          elevated?.allowed && !elevated.fullAccessAvailable
            ? "User can toggle with /elevated on|off|ask."
            : "",
          elevated?.allowed && elevated.fullAccessAvailable
            ? "You may also send /elevated on|off|ask|full when needed."
            : "",
          elevated?.allowed && !elevated.fullAccessAvailable
            ? "You may also send /elevated on|off|ask when needed."
            : "",
          elevated?.fullAccessAvailable === false
            ? `Auto-approved /elevated full is unavailable here (${fullAccessBlockedReasonLabel}).`
            : "",
          elevated?.allowed && elevated.fullAccessAvailable
            ? `Current elevated level: ${elevated.defaultLevel} (ask runs exec on host with approvals; full auto-approves).`
            : elevated?.allowed
              ? `Current elevated level: ${elevated.defaultLevel} (full auto-approval unavailable here; use ask/on instead).`
              : elevated
                ? "Current elevated level: off (elevated exec unavailable)."
                : "",
          elevated && !elevated.allowed
            ? "Do not tell the user to switch to /elevated full in this session."
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    params.sandboxInfo?.enabled ? "" : "",
    ...buildUserIdentitySection(ownerLine, isMinimal),
    ...buildTimeSection({
      userTimezone,
    }),
    "## Workspace Files (injected)",
    "These user-editable files are loaded by OpenClaw and included below in Project Context.",
    "",
    ...buildAssistantOutputDirectivesSection(isMinimal),
    ...buildWebchatCanvasSection({
      isMinimal,
      runtimeChannel,
      canvasRootDir: params.runtimeInfo?.canvasRootDir,
    }),
    ...buildMessagingSection({
      isMinimal,
      availableTools,
      messageChannelOptions,
      inlineButtonsEnabled,
      runtimeChannel,
      messageToolHints: params.messageToolHints,
    }),
    ...buildVoiceSection({ isMinimal, ttsHint: params.ttsHint }),
  ];

  if (params.reactionGuidance) {
    const { level, channel } = params.reactionGuidance;
    const guidanceText =
      level === "minimal"
        ? [
            `Reactions are enabled for ${channel} in MINIMAL mode.`,
            "React ONLY when truly relevant:",
            "- Acknowledge important user requests or confirmations",
            "- Express genuine sentiment (humor, appreciation) sparingly",
            "- Avoid reacting to routine messages or your own replies",
            "Guideline: at most 1 reaction per 5-10 exchanges.",
          ].join("\n")
        : [
            `Reactions are enabled for ${channel} in EXTENSIVE mode.`,
            "Feel free to react liberally:",
            "- Acknowledge messages with appropriate emojis",
            "- Express sentiment and personality through reactions",
            "- React to interesting content, humor, or notable events",
            "- Use reactions to confirm understanding or agreement",
            "Guideline: react whenever it feels natural.",
          ].join("\n");
    lines.push("## Reactions", guidanceText, "");
  }
  if (reasoningHint) {
    lines.push("## Reasoning Format", reasoningHint, "");
  }

  const contextFiles = params.contextFiles ?? [];
  const validContextFiles = contextFiles.filter(
    (file) => typeof file.path === "string" && file.path.trim().length > 0,
  );
  const orderedContextFiles = sortContextFilesForPrompt(validContextFiles);
  const stableContextFiles = orderedContextFiles.filter((file) => !isDynamicContextFile(file.path));
  const dynamicContextFiles = orderedContextFiles.filter((file) => isDynamicContextFile(file.path));
  lines.push(
    ...buildProjectContextSection({
      files: stableContextFiles,
      heading: "# Project Context",
      dynamic: false,
    }),
  );

  // Skip silent replies for subagent/none modes
  if (!isMinimal) {
    lines.push(
      "## Silent Replies",
      `When you have nothing to say, respond with ONLY: ${SILENT_REPLY_TOKEN}`,
      "",
      "⚠️ Rules:",
      "- It must be your ENTIRE message — nothing else",
      `- Never append it to an actual response (never include "${SILENT_REPLY_TOKEN}" in real replies)`,
      "- Never wrap it in markdown or code blocks",
      "",
      `❌ Wrong: "Here's help... ${SILENT_REPLY_TOKEN}"`,
      `❌ Wrong: "${SILENT_REPLY_TOKEN}"`,
      `✅ Right: ${SILENT_REPLY_TOKEN}`,
      "",
    );
  }

  // Keep large stable prompt context above this seam so Anthropic-family
  // transports can reuse it across labs and turns. Dynamic group/session
  // additions and volatile project context below it are the primary cache invalidators.
  lines.push(SYSTEM_PROMPT_CACHE_BOUNDARY);

  lines.push(
    ...buildProjectContextSection({
      files: dynamicContextFiles,
      heading: stableContextFiles.length > 0 ? "# Dynamic Project Context" : "# Project Context",
      dynamic: true,
    }),
  );

  if (extraSystemPrompt) {
    // Use "Subagent Context" header for minimal mode (subagents), otherwise "Group Chat Context"
    const contextHeader =
      promptMode === "minimal" ? "## Subagent Context" : "## Group Chat Context";
    lines.push(contextHeader, extraSystemPrompt, "");
  }
  if (providerDynamicSuffix) {
    lines.push(providerDynamicSuffix, "");
  }

  lines.push(...buildHeartbeatSection({ isMinimal, heartbeatPrompt }));

  lines.push(
    "## Runtime",
    buildRuntimeLine(runtimeInfo, runtimeChannel, runtimeCapabilities, params.defaultThinkLevel),
    `Reasoning: ${reasoningLevel} (hidden unless on/stream). Toggle /reasoning; /status shows Reasoning when enabled.`,
  );

  return lines.filter(Boolean).join("\n");
}

export function buildRuntimeLine(
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    shell?: string;
    repoRoot?: string;
  },
  runtimeChannel?: string,
  runtimeCapabilities: string[] = [],
  defaultThinkLevel?: ThinkLevel,
): string {
  const normalizedRuntimeCapabilities = normalizePromptCapabilityIds(runtimeCapabilities);
  return `Runtime: ${[
    runtimeInfo?.agentId ? `agent=${runtimeInfo.agentId}` : "",
    runtimeInfo?.host ? `host=${runtimeInfo.host}` : "",
    runtimeInfo?.repoRoot ? `repo=${runtimeInfo.repoRoot}` : "",
    runtimeInfo?.os
      ? `os=${runtimeInfo.os}${runtimeInfo?.arch ? ` (${runtimeInfo.arch})` : ""}`
      : runtimeInfo?.arch
        ? `arch=${runtimeInfo.arch}`
        : "",
    runtimeInfo?.node ? `node=${runtimeInfo.node}` : "",
    runtimeInfo?.model ? `model=${runtimeInfo.model}` : "",
    runtimeInfo?.defaultModel ? `default_model=${runtimeInfo.defaultModel}` : "",
    runtimeInfo?.shell ? `shell=${runtimeInfo.shell}` : "",
    runtimeChannel ? `channel=${runtimeChannel}` : "",
    runtimeChannel
      ? `capabilities=${
          normalizedRuntimeCapabilities.length > 0
            ? normalizedRuntimeCapabilities.join(",")
            : "none"
        }`
      : "",
    `thinking=${defaultThinkLevel ?? "off"}`,
  ]
    .filter(Boolean)
    .join(" | ")}`;
}
