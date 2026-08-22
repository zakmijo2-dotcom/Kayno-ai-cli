# ⚡ NOVA — Multi-Provider AI Agent CLI

A **zero-dependency** (pure Node.js ≥ 18) terminal AI agent that talks to **60+ built-in providers / 200+ after catalog sync**, with Google OAuth (Gemini CLI-style + Antigravity), a skills system, and a plugin/extension architecture.

```bash
node bin/nova.js help
```

## Highlights

- **61 provider presets built in**: OpenAI, Anthropic, Google Gemini, DeepSeek (+web bridge), Qwen/DashScope (+web bridge), Antigravity, Google Code Assist, Vertex AI, OpenRouter, Groq, Mistral, xAI, Together, Fireworks, Perplexity, Cohere, Cerebras, SambaNova, Moonshot/Kimi, Zhipu GLM, MiniMax, SiliconFlow, Doubao, Qianfan, Ollama/LM Studio/vLLM/llama.cpp… plus one-command sync from [models.dev](https://models.dev) for **hundreds more**.
- **OAuth flows**: `nova auth login google` (Gemini CLI OAuth → Code Assist backend) and `nova auth login antigravity` (same flow against the Antigravity backend, or import tokens captured from the IDE). Automatic token refresh.
- **Agent tools**: `read_file`, `write_file`, `list_dir`, `run_command`, `fetch_url` — with per-action confirmation prompts (`--yolo` to skip) and multi-step tool-calling loops across OpenAI, Anthropic and Gemini wire formats.
- **Skills system**: drop `SKILL.md` files (YAML frontmatter: `name`, `description`, `triggers`) in `~/.nova/skills/` or `.nova/skills/`. Relevant skills auto-inject into the system prompt based on your message. 5 built-in skills ship with the CLI.
- **Plugins / extensions**: drop JS modules into `~/.nova/plugins/` or `.nova/plugins/`. Plugins can register slash commands and hooks (`beforeRequest`, `afterResponse`, `onDelta`) and extra tools.
- **Strong system prompt** with profiles (`coder`, `assistant`, `raw`), project context via `NOVA.md`/`AGENTS.md`, environment awareness.
- **Sessions** persist to `~/.nova/sessions/`. Streaming SSE everywhere.

## Install

No dependencies. Node 18+ required.

```bash
git clone <this-repo> nova && cd nova
npm link          # puts `nova` on your PATH
# or just: node bin/nova.js …
```

## Quickstart

```bash
export OPENROUTER_API_KEY=sk-or-...        # or any provider's key
nova chat -p openrouter -m anthropic/claude-sonnet-4.5

# Gemini API key
nova auth set-key google-gemini "$GEMINI_API_KEY"
nova chat -p google-gemini -m gemini-2.5-pro

# Gemini CLI-style OAuth (Code Assist backend)
nova auth login google
nova chat -p google-code-assist -m gemini-2.5-pro

# Antigravity backend
nova auth login antigravity
nova chat -p antigravity -m gemini-3-pro-preview
# ...or import tokens you captured from the Antigravity app:
nova auth import antigravity --access TOKEN --refresh TOKEN

# One-shot + pipes
cat server.js | nova ask -p deepseek -m deepseek-chat "review this file"

# Local models
nova chat -p ollama -m llama3.2
```

## Commands

| Command | Purpose |
|---|---|
| `nova chat [-p id] [-m model] [--yolo] [--no-tools] [--profile P] [-s "system"]` | interactive REPL |
| `nova ask "question"` | one-shot (reads stdin when piped) |
| `nova providers list\|--all\|search q\|info id\|sync` | catalog management |
| `nova models [search]` | default model hints |
| `nova auth login google\|antigravity` | browser OAuth |
| `nova auth import antigravity --access T --refresh T` | manual token import |
| `nova auth set-key <provider> <key>` / `auth status` / `auth logout <id>` | key management |
| `nova skills [list\|show name]` | skill discovery |
| `nova plugins` | plugin inventory |
| `nova config [get\|set k v\|path]` | configuration |
| `nova sessions` | saved conversations |

REPL slash commands: `/help /new /clear /history /save <title> /model <m> /provider <id> /system <q> /skills /reload /exit`

## Configuration

`~/.nova/config.json`

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4.5",
  "temperature": 0.7,
  "yolo": false,
  "profile": "coder",
  "providers": {
    "azure-openai": { "baseUrl": "https://YOUR.openai.azure.com/openai/deployments/gpt4o" },
    "vertex-ai": { "project": "my-gcp-project", "location": "us-central1" },
    "antigravity": { "baseUrl": "https://daily-cloudcode-pa.googleapis.com" }
  }
}
```

Keys resolve in order: env var (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, …) → `~/.nova/auth.json` (via `nova auth set-key`) → config override.

## Skills format

```
~/.nova/skills/my-skill/SKILL.md
---
name: my-skill
description: What it does (used for auto-matching)
triggers: [refactor, performance]
---
Instructions injected into the system prompt when the user's message matches…
```

## Plugin format

```js
// ~/.nova/plugins/my-plugin/index.js   (or single .js/.mjs file)
export const name = 'my-plugin';
export function setup() {
  return {
    commands: { hello: () => console.log('hi') },        // usable as /hello
    async beforeRequest(ctx) { return { meta: { tag: 'x' } }; },
    async afterResponse(ctx) {},
  };
}
```

## Notes on web-based DeepSeek / Qwen

The `deepseek-web` and `qwen-web` presets speak OpenAI-compatible protocol to self-hosted bridges:
- DeepSeek: [`VincentZyc/deepseek-free-api`](https://github.com/VincentZyc/deepseek-free-api) (default `http://127.0.0.1:8000/v1`, token = web session token)
- Qwen: [`LLM-Red-Team/qwen-free-api`](https://github.com/LLM-Red-Team/qwen-free-api) (default `http://127.0.0.1:8001/v1`)
For production use prefer the official APIs (`deepseek`, `qwen-dashscope-intl/cn` presets).

## Credits & open source used

- Provider catalog sync: [models.dev](https://models.dev) by sst
- Google OAuth desktop credentials: fetched at login time from [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) (Apache-2.0) and cached locally — override anytime via `nova config set auth.google.clientId/...` or env `GEMINI_CLI_CLIENT_ID` / `GEMINI_CLI_CLIENT_SECRET`
- Web bridges: deepseek-free-api, qwen-free-api (community projects)

## License

MIT
