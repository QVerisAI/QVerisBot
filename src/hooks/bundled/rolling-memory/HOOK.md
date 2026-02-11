---
name: rolling-memory
description: "Maintain a rolling 7-day conversation summary in memory"
homepage: https://docs.openclaw.ai/hooks#rolling-memory
metadata:
  {
    "openclaw":
      {
        "emoji": "📅",
        "events": ["command:new", "session:end"],
        "requires": { "config": ["workspace.dir"] },
        "install":
          [
            {
              "id": "bundled",
              "kind": "bundled",
              "label": "Bundled with OpenClaw",
            },
          ],
      },
  }
---

# Rolling Memory Hook

Maintains a rolling 7-day conversation summary that is automatically indexed by memory search.

## What It Does

When triggered (on `/new` command or session end):

1. **Collects recent sessions** - Scans `sessions.json` for all sessions updated in the last 7 days
2. **Reads transcripts** - Extracts user/assistant messages from each session transcript
3. **Groups by date** - Organizes messages by calendar date
4. **Generates summaries** - Uses LLM to create categorized daily summaries
5. **Writes rolling file** - Overwrites `memory/rolling-7d.md` with the latest 7-day summary

## Output Format

The rolling file is a Markdown document grouped by date with tagged summaries.

## Configuration

| Option | Type   | Default | Description                               |
| ------ | ------ | ------- | ----------------------------------------- |
| `days` | number | 7       | Number of days to retain in rolling file  |

Example configuration:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "rolling-memory": {
          "enabled": true,
          "days": 14
        }
      }
    }
  }
}
```

## Requirements

- **Config**: `workspace.dir` must be set
- **Sessions**: Session transcripts must be stored on disk (default behavior)

## Disabling

```bash
openclaw hooks disable rolling-memory
```
