# ⚡ NOVA — Multi-Provider AI Agent CLI

A **zero-dependency** (pure Node.js ≥ 18) terminal AI agent that talks to **60+ built-in providers / 200+ after catalog sync**, with Google OAuth (Gemini CLI-style + Antigravity), a skills system, and a plugin/extension architecture.

```bash
node bin/nova.js help
```

## Highlights

- **61 provider presets built in**: OpenAI, Anthropic, Google Gemini, DeepSeek (+web bridge), Qwen/DashScope (+web bridge), Antigravity, Google Code Assist, Vertex AI, OpenRouter, Groq, Mistral, xAI, Together, Fireworks, Perplexity, Cohere, Cerebras, SambaNova, Moonshot/Kimi, Zhipu GLM, MiniMax, SiliconFlow, Doubao, Qianfan, Ollama/LM Studio/vLLM/llama.cpp… plus one-command sync from [models.dev](https://models.dev) for **hundreds more**.
- **OAuth flows**: `mij auth login google` (Gemini CLI OAuth → Code Assist backend) and `mij auth login antigravity` (same flow against the Antigravity backend, or import tokens captured from the IDE). Automatic token refresh.
- **Agent tools**: `read_file`, `write_file`, `list_dir`, `run_command`, `fetch_url` — with per-action confirmation prompts (`--yolo` to skip) and multi-step tool-calling loops across OpenAI, Anthropic and Gemini wire formats.
- **Skills system**: drop `SKILL.md` files (YAML frontmatter: `name`, `description`, `triggers`) in `~/.nova/skills/` or `.nova/skills/`. Relevant skills auto-inject into the system prompt based on your message. 5 built-in skills ship with the CLI.
- **Plugins / extensions**: drop JS modules into `~/.nova/plugins/` or `.nova/plugins/`. Plugins can register slash commands and hooks (`beforeRequest`, `afterResponse`, `onDelta`) and extra tools.
- **Strong system prompt** with profiles (`coder`, `assistant`, `raw`), project context via `NOVA.md`/`AGENTS.md`, environment awareness.
- **Sessions** persist to `~/.nova/sessions/`. Streaming SSE everywhere.

## Install

No dependencies. Node 18+ required.

One-liner (curl):

```bash
curl -fsSL https://raw.githubusercontent.com/zakmijo2-dotcom/Kayno-ai-cli/main/install.sh | sh
```

Then (only if `~/.local/bin` is not on your PATH):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Or from a clone:

```bash
git clone https://github.com/zakmijo2-dotcom/Kayno-ai-cli.git && cd Kayno-ai-cli
npm link          # puts `mij` on your PATH
# or just: node bin/mij.js …
```

Env knobs for the installer: `MIJ_HOME` (default `~/.mij`), `MIJ_BIN_DIR` (default `~/.local/bin`), `MIJ_BRANCH`.

## Quickstart

```bash
export OPENROUTER_API_KEY=sk-or-...        # or any provider's key
mij chat -p openrouter -m anthropic/claude-sonnet-4.5

# Gemini API key
mij auth set-key google-gemini "$GEMINI_API_KEY"
mij chat -p google-gemini -m gemini-2.5-pro

# Gemini CLI-style OAuth (Code Assist backend)
mij auth login google
mij chat -p google-code-assist -m gemini-2.5-pro

# Antigravity backend
mij auth login antigravity
mij chat -p antigravity -m gemini-3-pro-preview
# ...or import tokens you captured from the Antigravity app:
mij auth import antigravity --access TOKEN --refresh TOKEN

# One-shot + pipes
cat server.js | mij ask -p deepseek -m deepseek-chat "review this file"

# Local models
mij chat -p ollama -m llama3.2
```

## Commands

| Command | Purpose |
|---|---|
| `mij chat [-p id] [-m model] [--yolo] [--no-tools] [--profile P] [-s "system"]` | interactive REPL |
| `mij ask "question"` | one-shot (reads stdin when piped) |
| `mij providers list\|--all\|search q\|info id\|sync` | catalog management |
| `mij models [search]` | default model hints |
| `mij auth login google\|antigravity` | browser OAuth |
| `mij auth import antigravity --access T --refresh T` | manual token import |
| `mij auth set-key <provider> <key>` / `auth status` / `auth logout <id>` | key management |
| `mij skills [list\|show name]` | skill discovery |
| `mij plugins` | plugin inventory |
| `mij config [get\|set k v\|path]` | configuration |
| `mij sessions` | saved conversations |

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

Keys resolve in order: env var (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, …) → `~/.nova/auth.json` (via `mij auth set-key`) → config override.

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
- Google OAuth desktop credentials: fetched at login time from [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) (Apache-2.0) and cached locally — override anytime via `mij config set auth.google.clientId/...` or env `GEMINI_CLI_CLIENT_ID` / `GEMINI_CLI_CLIENT_SECRET`
- Web bridges: deepseek-free-api, qwen-free-api (community projects)

## License

MIT
