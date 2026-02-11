---
name: smart-memory
description: "Automatically identify and persist important conversations"
homepage: https://docs.openclaw.ai/hooks#smart-memory
metadata:
  {
    "openclaw":
      {
        "emoji": "🧠",
        "events": ["command:new"],
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

# Smart Memory Hook

Automatically identifies important conversations (research, papers, multi-step projects, decisions) and persists them as durable memory files that are never automatically deleted.

## What It Does

When `/new` is issued:

1. **Reads the current session** transcript
2. **Classifies the conversation** using keyword heuristics (no LLM call required)
3. **Extracts key information** for important conversations
4. **Saves to memory/important/** as a permanent Markdown file

## Classification Categories

| Category   | Keywords / Patterns |
| ---------- | ------------------- |
| research   | paper, experiment, data, methodology, hypothesis, literature review |
| paper      | manuscript, draft, revision, reviewer, figure, abstract |
| project    | milestone, step N, progress, next step, TODO, deadline |
| decision   | decision, choose, compare, trade-off, architecture |
| remember   | remember, do not forget, important, save this |
| routine    | (everything else) - skipped |

## Output Format

Files are saved as `memory/important/YYYY-MM-DD-<slug>.md`:

```
# Important: research - RAG source analysis
Date: 2026-02-11
Category: research
Tags: RAG, source-code, Auto-Coder

## Summary
Discussed Auto-Coder RAG implementation details...

## Key Points
- Point 1
- Point 2

## Action Items
- [ ] Follow up on X
```

## Configuration

| Option     | Type   | Default | Description                                    |
| ---------- | ------ | ------- | ---------------------------------------------- |
| `messages` | number | 30      | Number of messages to analyse from the session |

## Requirements

- **Config**: `workspace.dir` must be set

## Disabling

```bash
openclaw hooks disable smart-memory
```
