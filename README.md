# QVerisBot — OpenClaw with QVeris Universal Toolbox

<table>
  <tr>
    <td width="170" valign="top">
      <img src="docs/assets/qverisbot.png" alt="QVerisBot logo" width="150" />
    </td>
    <td valign="top">
      <strong>QVerisBot</strong><br/>
      Your professional AI assistant with QVeris Universal Toolbox.<br/>
      OpenClaw reliability + QVeris integrations for real-world workflows.<br/><br/>
      <a href="#quick-start-5-minutes">Quick Start</a> ·
      <a href="https://docs.openclaw.ai">Docs</a> ·
      <a href="https://qveris.ai/integrations">500+ Integrations</a> ·
      <a href="https://deepwiki.com/QVerisAI/QVerisBot">DeepWiki</a> ·
      <a href="https://discord.gg/clawd">Discord</a><br/><br/>
      <a href="https://github.com/QVerisAI/QVerisBot/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/QVerisAI/QVerisBot/ci.yml?branch=main&style=flat-square" alt="CI status"></a>
      <a href="https://github.com/QVerisAI/QVerisBot/releases"><img src="https://img.shields.io/github/v/release/QVerisAI/QVerisBot?include_prereleases&style=flat-square" alt="GitHub release"></a>
      <a href="https://deepwiki.com/QVerisAI/QVerisBot"><img src="https://img.shields.io/badge/DeepWiki-QVerisBot-blue?style=flat-square" alt="DeepWiki"></a>
      <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=flat-square" alt="Discord"></a>
      <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
    </td>
  </tr>
</table>

**QVerisBot** is a production-focused distribution built by the **[QVeris AI](https://qveris.ai)** team on top of [OpenClaw](https://github.com/openclaw/openclaw). It keeps OpenClaw's local-first architecture and adds a QVeris-first product layer for professional workflows.

It answers you on the channels you already use (WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, WebChat), plus extension channels like X, BlueBubbles, Matrix, Zalo, and Zalo Personal. It can speak and listen on macOS/iOS/Android, and render a live Canvas you control.

## Why QVerisBot

- **Built on OpenClaw, optimized for real deployment**: keeps stable gateway/runtime architecture while improving defaults and onboarding.
- **QVeris-first tool experience**: integrate with 500+ providers and 10,000+ APIs via a single tool-search + tool-execute workflow.
- **China-friendly channel strategy**: stronger Feishu and regional ecosystem readiness without sacrificing global channel coverage.
- **Faster first-run onboarding**: CLI/macOS/web wizard now includes QVeris API setup and X channel credentials in guided flow.

### OpenClaw vs QVerisBot (quick comparison)

| Area                 | OpenClaw (base platform)                          | QVerisBot (this repo)                                                                                             |
| :------------------- | :------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| Positioning          | Local-first agent gateway + multi-channel runtime | OpenClaw-based distribution focused on professional tool use and faster production onboarding                     |
| Tool ecosystem       | Built-in tools + extension mechanism              | QVeris Universal Toolbox integration (search + execute), plus QVeris-first defaults                               |
| Web search default   | Commonly configured with Brave/other providers    | During onboarding, defaults `web_search` to QVeris Smart Search when QVeris is enabled                            |
| Channel focus        | Broad global channels and plugin model            | Adds stronger China-facing defaults/integration (especially Feishu), while keeping full OpenClaw channel coverage |
| First-run onboarding | Wizard-driven baseline setup                      | Enhanced wizard flow: QVeris API key setup + X channel credential setup integrated into onboarding                |

## Quick Start (5 minutes)

**System requirements:** Node.js 22.12+, pnpm 10.x, Python 3.12+ (for skills)

```bash
git clone https://github.com/QVerisAI/QVerisBot.git
cd QVerisBot
pnpm install
pnpm ui:build   # first run only
pnpm build
pnpm openclaw onboard --install-daemon
```

The onboarding wizard guides you through: model/auth, **QVeris API key**, `web_search` (defaults to QVeris Smart Search), **X (Twitter) credentials**, channels, and skills. For Feishu/飞书, see [QVerisBot Source Guide](docs/qverisbot-from-source.md).

**Verify:** Start the gateway and chat:

```bash
pnpm openclaw gateway --port 18789 --verbose
pnpm openclaw agent --message "Hello QVerisBot" --thinking high
```

## QVeris Universal Toolbox — The Core of QVerisBot

<p align="center">
  <strong>🚀 Why QVerisBot?</strong><br/>
  <em>Stop writing API wrappers.</em>
</p>

<p align="center">
  <a href="https://qveris.ai"><img src="https://img.shields.io/badge/Data_Providers-500+-00C853?style=for-the-badge&logo=database&logoColor=white" height="32"/></a>
  &nbsp;&nbsp;
  <a href="https://qveris.ai"><img src="https://img.shields.io/badge/APIs_&_Tools-10,000+-2196F3?style=for-the-badge&logo=api&logoColor=white" height="32"/></a>
</p>

<p align="center">
  <strong><a href="https://qveris.ai">QVeris</a></strong> connects your AI assistant to the world's data and services<br/>
  <em>Think of it as an "App Store for AI tools"</em>
</p>

**Subscriptions (OAuth):** [Anthropic](https://www.anthropic.com/) (Claude Pro/Max) · [OpenAI](https://openai.com/) (ChatGPT/Codex)

<details>
<summary><strong>📦 500+ integrations — Finance · Search · Research · Business · Blockchain · AI · Productivity · News · Weather · Travel · Geospatial · Government</strong></summary>

<p align="center">
  <img src="https://img.shields.io/badge/Binance-Exchange-F0B90B?logo=binance&logoColor=black" height="20"/> <img src="https://img.shields.io/badge/Bloomberg-Terminal-000000" height="20"/> <img src="https://img.shields.io/badge/CoinGecko-Crypto-8DC351?logo=coingecko&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/Brave_Search-AI-FB542B?logo=brave&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/Firecrawl-Scraping-FF6B35" height="20"/> <img src="https://img.shields.io/badge/PubMed-Medical-326599" height="20"/> <img src="https://img.shields.io/badge/arXiv-Papers-B31B1B" height="20"/> <img src="https://img.shields.io/badge/Crunchbase-Startups-0288D1" height="20"/> <img src="https://img.shields.io/badge/LinkedIn-Pro-0A66C2?logo=linkedin&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/Etherscan-Ethereum-3C3C3D?logo=ethereum&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/OpenAI-GPT-412991?logo=openai&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/Notion-Workspace-000000?logo=notion&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/Stripe-Payments-008CDD?logo=stripe&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/NewsAPI-News-FF5733" height="20"/> <img src="https://img.shields.io/badge/OpenWeather-Weather-EB6E4B" height="20"/> <img src="https://img.shields.io/badge/Amadeus-Flights-005EB8" height="20"/> <img src="https://img.shields.io/badge/Google_Maps-Maps-4285F4?logo=googlemaps&logoColor=white" height="20"/> <img src="https://img.shields.io/badge/World_Bank-Data-002244" height="20"/>
</p>

<p align="center"><a href="https://qveris.ai/integrations"><strong>Explore all 500+ integrations →</strong></a></p>

</details>

### What can you build with QVeris?

| Scenario                    | Tools Used                                    | Workflow                                                                  |
| :-------------------------- | :-------------------------------------------- | :------------------------------------------------------------------------ |
| **Market Research Analyst** | Google Search + Firecrawl + DeepSeek + Notion | Search competitors -> Scrape pricing pages -> Summarize -> Save to Notion |
| **Crypto Price Monitor**    | Binance + AlphaVantage + Finnhub              | Query real-time BTC/ETH prices, analyze market sentiment                  |
| **Image Search Assistant**  | Brave Search + SerpApi + Shutterstock         | Find images, reverse image search, access stock photos                    |

### How to use QVeris (2 steps)

```python
# Step 1: Search for tools
qveris_search(query="bitcoin price")
# Returns: tool_id, name, description, params, stats

# Step 2: Execute the tool
qveris_execute(
    tool_id="binance.ticker.price.list.v3.8675eca0",
    search_id="...",
    params_to_tool='{"symbol": "BTCUSDT"}'
)
# Returns: {"symbol": "BTCUSDT", "price": "102345.67"}
```

### Get your QVeris API key

1. **Create account:** [qveris.ai](https://qveris.ai) → Sign Up
2. **Get API key:** Dashboard → API Keys → Create New Key
3. **Use it:** Run `pnpm openclaw onboard` — the wizard will prompt for your key and configure QVeris + `web_search` automatically.

> [!NOTE]
> QVeris offers a free tier. For production use, purchase credits at [qveris.ai/dashboard](https://qveris.ai/dashboard).

---

## What Else Makes QVerisBot Special

- **OpenClaw + QVeris optimization layer** — keeps OpenClaw's core reliability while adding QVeris-first defaults for practical business/research workflows
- **[Feishu (飞书) Native Support](docs/qverisbot-from-source.md#3-飞书账号准备)** — WebSocket-based deep integration, ideal for Chinese enterprise users
- **Improved onboarding across CLI/macOS/web wizard flows** — guided QVeris API key setup, auto-default `web_search` to QVeris Xiaosu Smart Search, and built-in X (Twitter) channel credential onboarding
- **Multi-channel inbox** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, **Feishu**, Microsoft Teams, Matrix, Zalo, WebChat
- **Voice Wake + Talk Mode** — always-on speech for macOS/iOS/Android
- **Live Canvas** — agent-driven visual workspace
- **LLM Proxy Support** — HTTP proxy for API calls in network-restricted environments

[QVeris AI](https://qveris.ai) · [Docs](https://docs.openclaw.ai) · [DeepWiki](https://deepwiki.com/QVerisAI/QVerisBot) · [Source Guide](docs/qverisbot-from-source.md) · [Discord](https://discord.gg/clawd)

---

## Reference

### System requirements

| Component | Minimum | Recommended        |
| :-------- | :------ | :----------------- |
| Node.js   | 22.12.0 | 22.x LTS           |
| pnpm      | 10.x    | 10.23.0+           |
| Python    | 3.12    | 3.12+ (for skills) |

### Default behavior on channels

On Telegram, WhatsApp, Signal, iMessage, Microsoft Teams, Discord, Google Chat, Slack:

- **DM pairing** (`dmPolicy="pairing"` / `channels.discord.dm.policy="pairing"` / `channels.slack.dm.policy="pairing"`): unknown senders receive a short pairing code and the bot does not process their message.
- Approve with: `openclaw pairing approve <channel> <code>` (then the sender is added to a local allowlist store).
- Public inbound DMs require an explicit opt-in: set `dmPolicy="open"` and include `"*"` in the channel allowlist (`allowFrom` / `channels.discord.dm.allowFrom` / `channels.slack.dm.allowFrom`).

---

## Platform capabilities at a glance

- **[Local-first Gateway](https://docs.openclaw.ai/gateway)** — single control plane for sessions, channels, tools, and events.
- **[Multi-channel inbox](https://docs.openclaw.ai/channels)** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, BlueBubbles (iMessage), iMessage (legacy), Microsoft Teams, Matrix, Zalo, Zalo Personal, WebChat, macOS, iOS/Android.
- **[Multi-agent routing](https://docs.openclaw.ai/gateway/configuration)** — route inbound channels/accounts/peers to isolated agents (workspaces + per-agent sessions).
- **[Voice Wake](https://docs.openclaw.ai/nodes/voicewake) + [Talk Mode](https://docs.openclaw.ai/nodes/talk)** — always-on speech for macOS/iOS/Android with ElevenLabs.
- **[Live Canvas](https://docs.openclaw.ai/platforms/mac/canvas)** — agent-driven visual workspace with [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui).
- **[First-class tools](https://docs.openclaw.ai/tools)** — browser, canvas, nodes, cron, sessions, and Discord/Slack actions.
- **[Companion apps](https://docs.openclaw.ai/platforms/macos)** — macOS menu bar app + iOS/Android [nodes](https://docs.openclaw.ai/nodes).
- **[Onboarding](https://docs.openclaw.ai/start/wizard) + [skills](https://docs.openclaw.ai/tools/skills)** — wizard-driven setup with bundled/managed/workspace skills.

## Everything we built so far

### Core platform

- [Gateway WS control plane](https://docs.openclaw.ai/gateway) with sessions, presence, config, cron, webhooks, [Control UI](https://docs.openclaw.ai/web), and [Canvas host](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui).
- [CLI surface](https://docs.openclaw.ai/tools/agent-send): gateway, agent, send, [wizard](https://docs.openclaw.ai/start/wizard), and [doctor](https://docs.openclaw.ai/gateway/doctor).
- [Pi agent runtime](https://docs.openclaw.ai/concepts/agent) in RPC mode with tool streaming and block streaming.
- [Session model](https://docs.openclaw.ai/concepts/session): `main` for direct chats, group isolation, activation modes, queue modes, reply-back. Group rules: [Groups](https://docs.openclaw.ai/concepts/groups).
- [Media pipeline](https://docs.openclaw.ai/nodes/images): images/audio/video, transcription hooks, size caps, temp file lifecycle. Audio details: [Audio](https://docs.openclaw.ai/nodes/audio).

### Channels

- [Channels](https://docs.openclaw.ai/channels): [WhatsApp](https://docs.openclaw.ai/channels/whatsapp) (Baileys), [Telegram](https://docs.openclaw.ai/channels/telegram) (grammY), [Slack](https://docs.openclaw.ai/channels/slack) (Bolt), [Discord](https://docs.openclaw.ai/channels/discord) (discord.js), [Google Chat](https://docs.openclaw.ai/channels/googlechat) (Chat API), [Signal](https://docs.openclaw.ai/channels/signal) (signal-cli), [BlueBubbles](https://docs.openclaw.ai/channels/bluebubbles) (iMessage, recommended), [iMessage](https://docs.openclaw.ai/channels/imessage) (legacy imsg), [Microsoft Teams](https://docs.openclaw.ai/channels/msteams) (extension), [Matrix](https://docs.openclaw.ai/channels/matrix) (extension), [Zalo](https://docs.openclaw.ai/channels/zalo) (extension), [Zalo Personal](https://docs.openclaw.ai/channels/zalouser) (extension), [WebChat](https://docs.openclaw.ai/web/webchat).
- [Group routing](https://docs.openclaw.ai/concepts/group-messages): mention gating, reply tags, per-channel chunking and routing. Channel rules: [Channels](https://docs.openclaw.ai/channels).

### Apps + nodes

- [macOS app](https://docs.openclaw.ai/platforms/macos): menu bar control plane, [Voice Wake](https://docs.openclaw.ai/nodes/voicewake)/PTT, [Talk Mode](https://docs.openclaw.ai/nodes/talk) overlay, [WebChat](https://docs.openclaw.ai/web/webchat), debug tools, [remote gateway](https://docs.openclaw.ai/gateway/remote) control.
- [iOS node](https://docs.openclaw.ai/platforms/ios): [Canvas](https://docs.openclaw.ai/platforms/mac/canvas), [Voice Wake](https://docs.openclaw.ai/nodes/voicewake), [Talk Mode](https://docs.openclaw.ai/nodes/talk), camera, screen recording, Bonjour pairing.
- [Android node](https://docs.openclaw.ai/platforms/android): [Canvas](https://docs.openclaw.ai/platforms/mac/canvas), [Talk Mode](https://docs.openclaw.ai/nodes/talk), camera, screen recording, optional SMS.
- [macOS node mode](https://docs.openclaw.ai/nodes): system.run/notify + canvas/camera exposure.

### Tools + automation

- [Browser control](https://docs.openclaw.ai/tools/browser): dedicated openclaw Chrome/Chromium, snapshots, actions, uploads, profiles.
- [Canvas](https://docs.openclaw.ai/platforms/mac/canvas): [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui) push/reset, eval, snapshot.
- [Nodes](https://docs.openclaw.ai/nodes): camera snap/clip, screen record, [location.get](https://docs.openclaw.ai/nodes/location-command), notifications.
- [Cron + wakeups](https://docs.openclaw.ai/automation/cron-jobs); [webhooks](https://docs.openclaw.ai/automation/webhook); [Gmail Pub/Sub](https://docs.openclaw.ai/automation/gmail-pubsub).
- [Skills platform](https://docs.openclaw.ai/tools/skills): bundled, managed, and workspace skills with install gating + UI.

### Runtime + safety

- [Channel routing](https://docs.openclaw.ai/concepts/channel-routing), [retry policy](https://docs.openclaw.ai/concepts/retry), and [streaming/chunking](https://docs.openclaw.ai/concepts/streaming).
- [Presence](https://docs.openclaw.ai/concepts/presence), [typing indicators](https://docs.openclaw.ai/concepts/typing-indicators), and [usage tracking](https://docs.openclaw.ai/concepts/usage-tracking).
- [Models](https://docs.openclaw.ai/concepts/models), [model failover](https://docs.openclaw.ai/concepts/model-failover), and [session pruning](https://docs.openclaw.ai/concepts/session-pruning).
- [Security](https://docs.openclaw.ai/gateway/security) and [troubleshooting](https://docs.openclaw.ai/channels/troubleshooting).

### Ops + packaging

- [Control UI](https://docs.openclaw.ai/web) + [WebChat](https://docs.openclaw.ai/web/webchat) served directly from the Gateway.
- [Tailscale Serve/Funnel](https://docs.openclaw.ai/gateway/tailscale) or [SSH tunnels](https://docs.openclaw.ai/gateway/remote) with token/password auth.
- [Nix mode](https://docs.openclaw.ai/install/nix) for declarative config; [Docker](https://docs.openclaw.ai/install/docker)-based installs.
- [Doctor](https://docs.openclaw.ai/gateway/doctor) migrations, [logging](https://docs.openclaw.ai/logging).

## How it works (short)

```

WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat / Feishu
│
▼
┌───────────────────────────────┐
│ Gateway │
│ (control plane) │
│ ws://127.0.0.1:18789 │
└──────────────┬────────────────┘
│
├─ Pi agent (RPC)
├─ CLI (openclaw …)
├─ WebChat UI
├─ macOS app
└─ iOS / Android nodes

```

## Key subsystems

- **[Gateway WebSocket network](https://docs.openclaw.ai/concepts/architecture)** — single WS control plane for clients, tools, and events (plus ops: [Gateway runbook](https://docs.openclaw.ai/gateway)).
- **[Tailscale exposure](https://docs.openclaw.ai/gateway/tailscale)** — Serve/Funnel for the Gateway dashboard + WS (remote access: [Remote](https://docs.openclaw.ai/gateway/remote)).
- **[Browser control](https://docs.openclaw.ai/tools/browser)** — openclaw‑managed Chrome/Chromium with CDP control.
- **[Canvas + A2UI](https://docs.openclaw.ai/platforms/mac/canvas)** — agent‑driven visual workspace (A2UI host: [Canvas/A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)).
- **[Voice Wake](https://docs.openclaw.ai/nodes/voicewake) + [Talk Mode](https://docs.openclaw.ai/nodes/talk)** — always‑on speech and continuous conversation.
- **[Nodes](https://docs.openclaw.ai/nodes)** — Canvas, camera snap/clip, screen record, `location.get`, notifications, plus macOS‑only `system.run`/`system.notify`.

## Tailscale access (Gateway dashboard)

OpenClaw can auto-configure Tailscale **Serve** (tailnet-only) or **Funnel** (public) while the Gateway stays bound to loopback. Configure `gateway.tailscale.mode`:

- `off`: no Tailscale automation (default).
- `serve`: tailnet-only HTTPS via `tailscale serve` (uses Tailscale identity headers by default).
- `funnel`: public HTTPS via `tailscale funnel` (requires shared password auth).

Notes:

- `gateway.bind` must stay `loopback` when Serve/Funnel is enabled (OpenClaw enforces this).
- Serve can be forced to require a password by setting `gateway.auth.mode: "password"` or `gateway.auth.allowTailscale: false`.
- Funnel refuses to start unless `gateway.auth.mode: "password"` is set.
- Optional: `gateway.tailscale.resetOnExit` to undo Serve/Funnel on shutdown.

Details: [Tailscale guide](https://docs.openclaw.ai/gateway/tailscale) · [Web surfaces](https://docs.openclaw.ai/web)

## Remote Gateway (Linux is great)

It's perfectly fine to run the Gateway on a small Linux instance. Clients (macOS app, CLI, WebChat) can connect over **Tailscale Serve/Funnel** or **SSH tunnels**, and you can still pair device nodes (macOS/iOS/Android) to execute device‑local actions when needed.

- **Gateway host** runs the exec tool and channel connections by default.
- **Device nodes** run device‑local actions (`system.run`, camera, screen recording, notifications) via `node.invoke`.
  In short: exec runs where the Gateway lives; device actions run where the device lives.

Details: [Remote access](https://docs.openclaw.ai/gateway/remote) · [Nodes](https://docs.openclaw.ai/nodes) · [Security](https://docs.openclaw.ai/gateway/security)

## macOS permissions via the Gateway protocol

The macOS app can run in **node mode** and advertises its capabilities + permission map over the Gateway WebSocket (`node.list` / `node.describe`). Clients can then execute local actions via `node.invoke`:

- `system.run` runs a local command and returns stdout/stderr/exit code; set `needsScreenRecording: true` to require screen-recording permission (otherwise you'll get `PERMISSION_MISSING`).
- `system.notify` posts a user notification and fails if notifications are denied.
- `canvas.*`, `camera.*`, `screen.record`, and `location.get` are also routed via `node.invoke` and follow TCC permission status.

Elevated bash (host permissions) is separate from macOS TCC:

- Use `/elevated on|off` to toggle per‑session elevated access when enabled + allowlisted.
- Gateway persists the per‑session toggle via `sessions.patch` (WS method) alongside `thinkingLevel`, `verboseLevel`, `model`, `sendPolicy`, and `groupActivation`.

Details: [Nodes](https://docs.openclaw.ai/nodes) · [macOS app](https://docs.openclaw.ai/platforms/macos) · [Gateway protocol](https://docs.openclaw.ai/concepts/architecture)

## Agent to Agent (sessions\_\* tools)

- Use these to coordinate work across sessions without jumping between chat surfaces.
- `sessions_list` — discover active sessions (agents) and their metadata.
- `sessions_history` — fetch transcript logs for a session.
- `sessions_send` — message another session; optional reply‑back ping‑pong + announce step (`REPLY_SKIP`, `ANNOUNCE_SKIP`).

Details: [Session tools](https://docs.openclaw.ai/concepts/session-tool)

## Skills registry (ClawHub)

ClawHub is a minimal skill registry. With ClawHub enabled, the agent can search for skills automatically and pull in new ones as needed.

[ClawHub](https://clawhub.com)

## Chat commands

Send these in WhatsApp/Telegram/Slack/Google Chat/Microsoft Teams/WebChat/Feishu (group commands are owner-only):

- `/status` — compact session status (model + tokens, cost when available)
- `/new` or `/reset` — reset the session
- `/compact` — compact session context (summary)
- `/think <level>` — off|minimal|low|medium|high|xhigh (GPT-5.2 + Codex models only)
- `/verbose on|off`
- `/usage off|tokens|full` — per-response usage footer
- `/restart` — restart the gateway (owner-only in groups)
- `/activation mention|always` — group activation toggle (groups only)

## Apps (optional)

The Gateway alone delivers a great experience. All apps are optional and add extra features.

If you plan to build/run companion apps, follow the platform runbooks below.

### macOS (OpenClaw.app) (optional)

- Menu bar control for the Gateway and health.
- Voice Wake + push-to-talk overlay.
- WebChat + debug tools.
- Remote gateway control over SSH.

Note: signed builds required for macOS permissions to stick across rebuilds (see `docs/mac/permissions.md`).

### iOS node (optional)

- Pairs as a node via the Bridge.
- Voice trigger forwarding + Canvas surface.
- Controlled via `openclaw nodes …`.

Runbook: [iOS connect](https://docs.openclaw.ai/platforms/ios).

### Android node (optional)

- Pairs via the same Bridge + pairing flow as iOS.
- Exposes Canvas, Camera, and Screen capture commands.
- Runbook: [Android connect](https://docs.openclaw.ai/platforms/android).

## Agent workspace + skills

- Workspace root: `~/.openclaw/workspace` (configurable via `agents.defaults.workspace`).
- Injected prompt files: `AGENTS.md`, `SOUL.md`, `TOOLS.md`.
- Skills: `~/.openclaw/workspace/skills/<skill>/SKILL.md`.

## Minimal configuration example

Minimal `~/.openclaw/openclaw.json` (model + defaults):

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-opus-4-6",
      },
    },
  },
}
```

[Full configuration reference (all keys + examples).](https://docs.openclaw.ai/gateway/configuration)

## Security model (important)

- **Default:** tools run on the host for the **main** session, so the agent has full access when it's just you.
- **Group/channel safety:** set `agents.defaults.sandbox.mode: "non-main"` to run **non‑main sessions** (groups/channels) inside per‑session Docker sandboxes; bash then runs in Docker for those sessions.
- **Sandbox defaults:** allowlist `bash`, `process`, `read`, `write`, `edit`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`; denylist `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway`.

Details: [Security guide](https://docs.openclaw.ai/gateway/security) · [Docker + sandboxing](https://docs.openclaw.ai/install/docker) · [Sandbox config](https://docs.openclaw.ai/gateway/configuration)

### [WhatsApp](https://docs.openclaw.ai/channels/whatsapp)

- Link the device: `pnpm openclaw channels login` (stores creds in `~/.openclaw/credentials`).
- Allowlist who can talk to the assistant via `channels.whatsapp.allowFrom`.
- If `channels.whatsapp.groups` is set, it becomes a group allowlist; include `"*"` to allow all.

### [Telegram](https://docs.openclaw.ai/channels/telegram)

- Set `TELEGRAM_BOT_TOKEN` or `channels.telegram.botToken` (env wins).
- Optional: set `channels.telegram.groups` (with `channels.telegram.groups."*".requireMention`); when set, it is a group allowlist (include `"*"` to allow all). Also `channels.telegram.allowFrom` or `channels.telegram.webhookUrl` + `channels.telegram.webhookSecret` as needed.

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABCDEF",
    },
  },
}
```

### [Slack](https://docs.openclaw.ai/channels/slack)

- Set `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (or `channels.slack.botToken` + `channels.slack.appToken`).

### [Discord](https://docs.openclaw.ai/channels/discord)

- Set `DISCORD_BOT_TOKEN` or `channels.discord.token` (env wins).
- Optional: set `commands.native`, `commands.text`, or `commands.useAccessGroups`, plus `channels.discord.dm.allowFrom`, `channels.discord.guilds`, or `channels.discord.mediaMaxMb` as needed.

```json5
{
  channels: {
    discord: {
      token: "1234abcd",
    },
  },
}
```

### [Signal](https://docs.openclaw.ai/channels/signal)

- Requires `signal-cli` and a `channels.signal` config section.

### [BlueBubbles (iMessage)](https://docs.openclaw.ai/channels/bluebubbles)

- **Recommended** iMessage integration.
- Configure `channels.bluebubbles.serverUrl` + `channels.bluebubbles.password` and a webhook (`channels.bluebubbles.webhookPath`).
- The BlueBubbles server runs on macOS; the Gateway can run on macOS or elsewhere.

### [iMessage (legacy)](https://docs.openclaw.ai/channels/imessage)

- Legacy macOS-only integration via `imsg` (Messages must be signed in).
- If `channels.imessage.groups` is set, it becomes a group allowlist; include `"*"` to allow all.

### [Microsoft Teams](https://docs.openclaw.ai/channels/msteams)

- Configure a Teams app + Bot Framework, then add a `msteams` config section.
- Allowlist who can talk via `msteams.allowFrom`; group access via `msteams.groupAllowFrom` or `msteams.groupPolicy: "open"`.

### [WebChat](https://docs.openclaw.ai/web/webchat)

- Uses the Gateway WebSocket; no separate WebChat port/config.

Browser control (optional):

```json5
{
  browser: {
    enabled: true,
    color: "#FF4500",
  },
}
```

## Docs

Use these when you’re past the onboarding flow and want the deeper reference.

- [Start with the docs index for navigation and “what’s where.”](https://docs.openclaw.ai)
- [Read the architecture overview for the gateway + protocol model.](https://docs.openclaw.ai/concepts/architecture)
- [Use the full configuration reference when you need every key and example.](https://docs.openclaw.ai/gateway/configuration)
- [Run the Gateway by the book with the operational runbook.](https://docs.openclaw.ai/gateway)
- [Learn how the Control UI/Web surfaces work and how to expose them safely.](https://docs.openclaw.ai/web)
- [Understand remote access over SSH tunnels or tailnets.](https://docs.openclaw.ai/gateway/remote)
- [Follow the onboarding wizard flow for a guided setup.](https://docs.openclaw.ai/start/wizard)
- [Wire external triggers via the webhook surface.](https://docs.openclaw.ai/automation/webhook)
- [Set up Gmail Pub/Sub triggers.](https://docs.openclaw.ai/automation/gmail-pubsub)
- [Learn the macOS menu bar companion details.](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [Platform guides: Windows (WSL2)](https://docs.openclaw.ai/platforms/windows), [Linux](https://docs.openclaw.ai/platforms/linux), [macOS](https://docs.openclaw.ai/platforms/macos), [iOS](https://docs.openclaw.ai/platforms/ios), [Android](https://docs.openclaw.ai/platforms/android)
- [Debug common failures with the troubleshooting guide.](https://docs.openclaw.ai/channels/troubleshooting)
- [Review security guidance before exposing anything.](https://docs.openclaw.ai/gateway/security)

## Advanced docs (discovery + control)

- [Discovery + transports](https://docs.openclaw.ai/gateway/discovery)
- [Bonjour/mDNS](https://docs.openclaw.ai/gateway/bonjour)
- [Gateway pairing](https://docs.openclaw.ai/gateway/pairing)
- [Remote gateway README](https://docs.openclaw.ai/gateway/remote-gateway-readme)
- [Control UI](https://docs.openclaw.ai/web/control-ui)
- [Dashboard](https://docs.openclaw.ai/web/dashboard)

## Operations & troubleshooting

- [Health checks](https://docs.openclaw.ai/gateway/health)
- [Gateway lock](https://docs.openclaw.ai/gateway/gateway-lock)
- [Background process](https://docs.openclaw.ai/gateway/background-process)
- [Browser troubleshooting (Linux)](https://docs.openclaw.ai/tools/browser-linux-troubleshooting)
- [Logging](https://docs.openclaw.ai/logging)

## Deep dives

- [Agent loop](https://docs.openclaw.ai/concepts/agent-loop)
- [Presence](https://docs.openclaw.ai/concepts/presence)
- [TypeBox schemas](https://docs.openclaw.ai/concepts/typebox)
- [RPC adapters](https://docs.openclaw.ai/reference/rpc)
- [Queue](https://docs.openclaw.ai/concepts/queue)

## Workspace & skills

- [Skills config](https://docs.openclaw.ai/tools/skills-config)
- [Default AGENTS](https://docs.openclaw.ai/reference/AGENTS.default)
- [Templates: AGENTS](https://docs.openclaw.ai/reference/templates/AGENTS)
- [Templates: BOOTSTRAP](https://docs.openclaw.ai/reference/templates/BOOTSTRAP)
- [Templates: IDENTITY](https://docs.openclaw.ai/reference/templates/IDENTITY)
- [Templates: SOUL](https://docs.openclaw.ai/reference/templates/SOUL)
- [Templates: TOOLS](https://docs.openclaw.ai/reference/templates/TOOLS)
- [Templates: USER](https://docs.openclaw.ai/reference/templates/USER)

## Platform internals

- [macOS dev setup](https://docs.openclaw.ai/platforms/mac/dev-setup)
- [macOS menu bar](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [macOS voice wake](https://docs.openclaw.ai/platforms/mac/voicewake)
- [iOS node](https://docs.openclaw.ai/platforms/ios)
- [Android node](https://docs.openclaw.ai/platforms/android)
- [Windows (WSL2)](https://docs.openclaw.ai/platforms/windows)
- [Linux app](https://docs.openclaw.ai/platforms/linux)

## Email hooks (Gmail)

- [docs.openclaw.ai/gmail-pubsub](https://docs.openclaw.ai/automation/gmail-pubsub)

## About QVerisBot

**QVerisBot** is developed by the **[QVeris AI](https://qveris.ai)** team, based on the open-source [OpenClaw](https://github.com/openclaw/openclaw) project (formerly Clawdbot & Moltbot).

- [QVeris AI](https://qveris.ai) — QVeris Universal Toolbox
- [QVerisBot GitHub](https://github.com/QVerisAI/QVerisBot) — Source code
- [OpenClaw](https://github.com/openclaw/openclaw) — Base project
- [Documentation](https://docs.openclaw.ai) — Full documentation

## Star History

<p align="center">
  <a href="https://star-history.com/#QVerisAI/QVerisBot&Date">
    <img src="https://api.star-history.com/svg?repos=QVerisAI/QVerisBot&type=Date" alt="QVerisBot Star History Chart">
  </a>
</p>

## Community

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, maintainers, and how to submit PRs.
AI/vibe-coded PRs welcome!

Special thanks to [Mario Zechner](https://mariozechner.at/) for his support and for
[pi-mono](https://github.com/badlogic/pi-mono).
Special thanks to Adam Doppelt for lobster.bot.
