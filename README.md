# Kayno — Multi-Provider AI Agent CLI (`mij`)

A **zero-dependency** (pure Node.js ≥ 18) terminal AI agent with a fast, lightweight TUI that talks to **60+ built-in providers / 200+ after catalog sync**, with Google OAuth (Gemini CLI-style + Antigravity), a skills system, and a plugin/extension architecture.

Built for real terminals — including Termux on Android: no heavy UI frameworks, incremental ANSI rendering, throttled redraws, ASCII fallbacks, `NO_COLOR` respected.

```bash
mij --help
```

## Highlights

- **Professional TUI**: streaming conversation view, status bar (`cwd │ provider │ model │ profile │ tools`), tool cards with live/exit states, command palette, model/provider/session selectors. Transcript stays in native scrollback; only the bottom chrome repaints (no flicker, no full-screen clears).
- **Raw keyboard input**: multiline editor (Ctrl+J newline), history navigation, Home/End/Delete, Ctrl+C cancels a running turn then quits, Ctrl+L clear, Ctrl+U/Ctrl+W line editing, Tab completion. Terminal state always restored via try/finally.
- **61 provider presets built in**: OpenAI, Anthropic, Google Gemini, DeepSeek (+web bridge), Qwen/DashScope (+web bridge), Antigravity, Google Code Assist, Vertex AI, OpenRouter, Groq, Mistral, xAI, Together, Fireworks, Perplexity, Cohere, Cerebras, SambaNova, Moonshot/Kimi, Zhipu GLM, MiniMax, SiliconFlow, Doubao, Qianfan, Ollama/LM Studio/vLLM/llama.cpp… plus one-command sync from [models.dev](https://models.dev) for **hundreds more**.
- **OAuth flows**: `mij auth login google` (Gemini CLI OAuth → Code Assist backend) and `mij auth login antigravity`, or import captured tokens. Automatic refresh.
- **Agent tools**: `read_file`, `write_file`, `list_dir`, `run_command`, `fetch_url` — structured confirmation cards in the TUI, multi-step tool loops across OpenAI/Anthropic/Gemini wire formats.
- **Skills system**: `SKILL.md` files auto-injected by trigger matching. 5 built-ins ship.
- **Plugins**: drop JS into `~/.nova/plugins/`; register `/commands` + hooks (`beforeRequest`, `afterResponse`, `onDelta`).
- **Sessions**: autosave, resume by id or interactive selector, relative timestamps.
- **Thinking safety**: provider reasoning is never displayed — only a generic `● Thinking…` state.

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
mij                                         # launches the TUI

# switch provider/model inside the TUI: /provider  /model
# Gemini API key
mij auth set-key google-gemini "$GEMINI_API_KEY"

# Gemini CLI-style OAuth (Code Assist backend)
mij auth login google

# Antigravity backend (or import tokens from the IDE)
mij auth login antigravity
mij auth import antigravity --access TOKEN --refresh TOKEN

# Local models
mij chat -p ollama -m llama3.2
```

### Termux notes

```bash
pkg install nodejs
sh install.sh          # or the curl one-liner above
```
Works over SSH and in split-screen; degrades to ASCII symbols when UTF-8 is unavailable and disables colors with `NO_COLOR`.

## Modes

| Command | Behavior |
|---|---|
| `mij` | interactive TUI (same as `mij chat`) |
| `KAYNO_TUI=0 mij chat` | classic line REPL (pipes, dumb terminals) |
| `mij ask "question"` | non-interactive; plain text out, zero ANSI escapes, stdin-pipe friendly |

```bash
cat server.js | mij ask -p deepseek -m deepseek-chat "review this"
```

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Enter` | send message |
| `Ctrl+J` (or Alt+Enter) | newline in the editor |
| `↑ / ↓` | history navigation / cursor lines |
| `← → Home End` | cursor movement |
| `Tab` | complete slash command |
| `/` | open command palette (type to filter, ↑↓ + Enter, Esc closes) |
| `Ctrl+C` | cancel running turn · quit when idle · answer "no" on confirmations |
| `Ctrl+D` | quit (empty input) |
| `Ctrl+L` | clear screen |
| `Ctrl+U` / `Ctrl+W` / `Ctrl+K` | clear line / word / to-end |

## Slash commands

`/help /new /clear /history /save <title> /sessions /session <id> /model [id] /provider [id] /system [q] /skills /reload /exit`
(aliases: `/q` `/m` `/p` `/sys` `/sess`)

`/model`, `/provider`, `/sessions` open interactive selectors with readiness badges (`ready`, `needs key`, `local`, `oauth`). Secrets are never displayed.

## Commands reference

| Command | Purpose |
|---|---|
| `mij chat [-p id] [-m model] [--yolo] [--no-tools] [--profile P] [-s "system"]` | interactive TUI |
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
