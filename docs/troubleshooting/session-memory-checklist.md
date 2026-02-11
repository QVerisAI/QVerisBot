# Session Memory Loss Troubleshooting Checklist

When the bot claims "no conversation yesterday" or appears to have lost memory,
run through **all** categories below before concluding.

---

## A. Session was reset (new sessionId, old transcript no longer loaded)

| # | Check | How to verify |
|---|-------|---------------|
| A1 | **Reset trigger word** (`/new`, `/reset`) sent by user or system | Search gateway log / chat history for `/new` or `/reset`. Check `session.resetTriggers` in config. |
| A2 | **Daily reset** (`session.reset.mode === "daily"`) | Print `loadConfig().session.reset` on the running gateway. Confirm `mode` is NOT `"daily"`. Check gateway host timezone vs `atHour` (default 4). |
| A3 | **Idle timeout** (`idleMinutes` exceeded) | Compare `sessions.json` entry `updatedAt` with current time. Gap must be < `idleMinutes` (in minutes). |
| A4 | **resetByType override** (e.g. `resetByType.group` is daily) | Print `loadConfig().session.resetByType`. For Feishu groups the resetType is `"group"`. |
| A5 | **resetByChannel override** (e.g. `resetByChannel.feishu` is daily) | Print `loadConfig().session.resetByChannel`. Channel key is `"feishu"` (lowercase). |
| A6 | **Cron isolated session** | If the "yesterday" conversation was triggered by a cron job in `isolated` mode, it has its own sessionId and is separate from regular chat sessions. |

## B. Config / environment mismatch

| # | Check | How to verify |
|---|-------|---------------|
| B1 | **Config path changed after gateway restart** | Compare `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, `CLAWDBOT_*` env vars in the gateway process with the values you expect. Confirm the startup script / systemd unit sets them consistently. |
| B2 | **Wrong config file loaded** (multiple candidates exist) | List all candidate paths: `~/.openclaw/openclaw.json`, `~/.openclaw/clawdbot.json`, `~/.clawdbot/clawdbot.json`, etc. The gateway picks the **first existing** file. Delete or rename stale copies. |
| B3 | **Session store path mismatch** | Confirm `session.store` (if set) and the resolved `agentId`. Run `resolveStorePath(session.store, { agentId })` mentally or via debug log. Compare with the actual `sessions.json` on disk. |
| B4 | **Multiple gateway processes** | Run `ps aux | grep openclaw` (or equivalent). If more than one gateway is running, each has its own in-memory state and may write to different stores. |

## C. Transcript exists but bot did not "see" it

| # | Check | How to verify |
|---|-------|---------------|
| C1 | **Different sessionKey** (asked in different group / DM) | Compare the group chat ID or DM context of the "yesterday" conversation with the "today" question. Each Feishu group has a unique sessionKey like `agent:main:feishu:group:oc_xxx`. DMs collapse to `agent:main:main`. |
| C2 | **Context window / compaction** | Check `compactionCount` in `sessions.json` for the session entry. If > 0, older messages may have been summarized. Check transcript line count. |
| C3 | **Model did not look back** | Try rephrasing the question or switching models. Check system prompt for "always search memory before answering" guidance. |
| C4 | **memorySearch not enabled** | Confirm `agents.defaults.memorySearch.enabled` is `true` in config. Confirm `memory_search` appears in the agent's tool list during a run. |

## D. Transcript was deleted or archived

| # | Check | How to verify |
|---|-------|---------------|
| D1 | **Gateway `sessions.delete` called** | Search gateway logs for `sessions.delete` or `sessions.reset` RPC calls. Check disk for `.jsonl.deleted.*` archived files. |
| D2 | **Role conflict recovery** | Search logs for "role ordering" or "consecutive user turns" errors near the time of the lost conversation. `agent-runner.ts` may `unlinkSync` the transcript. |
| D3 | **Corrupted Gemini session recovery** | Search logs for "corrupted session" or Gemini-related errors. `agent-runner-execution.ts` may delete the transcript. |
| D4 | **Subagent cleanup** | If subagents were involved, check if `subagent-registry` or `subagent-announce` deleted the target session. |

## E. Gateway restart

| # | Check | How to verify |
|---|-------|---------------|
| E1 | **Restart preserves disk** | After restart, confirm `sessions.json` and `*.jsonl` files still exist under the expected state directory. |
| E2 | **Restart uses different env** | Confirm the gateway process environment (env vars, working directory) is identical before and after restart. A different `OPENCLAW_STATE_DIR` or missing `OPENCLAW_CONFIG_PATH` can cause the gateway to read a different config or store. |

---

## Recommended verification order

1. Confirm running gateway config path and `session.*` settings (eliminates A2–A5, B1–B2).
2. Confirm the sessionKey for both conversations matches (eliminates C1).
3. Check `sessions.json` for the sessionKey: was `sessionId` the same or changed? (eliminates A1–A6).
4. Check transcript file existence on disk (eliminates D1–D4).
5. Check `compactionCount` and `memorySearch` enablement (eliminates C2, C4).
6. If all above pass, consider model behavior (C3) or edge cases.
