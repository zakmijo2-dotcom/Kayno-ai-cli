<div align="center">

# ⚡ Kayno

**A zero-dependency AI coding agent for your terminal.**

Built for speed, built for Termux — 200+ models, one binary, no bloat.

![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-0-success)
![Tests](https://img.shields.io/badge/tests-100%2B_checks-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

[Install](#-install) · [Quickstart](#-quickstart) · [Tools](#-tool-system) · [Permissions](#-permission-engine) · [Docs](#-configuration) · [العربية](README.ar.md)

</div>

---

Kayno (command: **`mij`**) is a professional coding agent that lives in your terminal — streaming TUI, agentic tool loops, workspace sandboxing, and a permission engine — while staying a **single pure-Node.js project with zero npm dependencies**.

No React. No Electron. No bundler. Startup in milliseconds, runs on Android phones via Termux.

```text
Kayno v0.1.0 │ OpenRouter / anthropic/claude-sonnet-4.5
/help commands · Ctrl+C cancel · Ctrl+D quit

You
› fix the failing test in auth.test.js

● Thinking

◆ Edit file  src/auth.test.js
  ✓ near line 42 · 0.31s
◆ Run command  npm test -- auth
  ✓ exit 0 · 2.14s

The test was asserting on the wrong token field...
──────────────────────────────────────────────
~/myapp (main) │ OpenRouter │ sonnet-4.5 │ coder │ tools:on │ 1.2k/340 tok
──────────────────────────────────────────────
› _
```

## ✨ Highlights

| | |
|---|---|
| **Zero dependencies** | Pure Node.js ≥ 18. Nothing to `npm install`. ~3k lines total. |
| **200+ providers** | 61 curated presets + one-command sync from [models.dev](https://models.dev): OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Groq, Kimi, GLM, Ollama, vLLM… |
| **OAuth built in** | Google sign-in like Gemini CLI (`cloudcode-pa`), **Antigravity** backend login/import, Vertex AI via gcloud. Auto token refresh. |
| **Real agent tools** | read/write/edit/patch files, grep, glob, shell, fetch, git — all sandboxed to your workspace. |
| **Permission engine** | Independent allow / ask / deny policies for reads, writes, shell, network and git. |
| **Context manager** | Per-model context limits, token estimation, history pruning that keeps tool-call integrity. |
| **Resilient transport** | Retries with exponential backoff, `Retry-After` honoring, abort-aware — Ctrl+C always wins. |
| **Skills & plugins** | Drop-in `SKILL.md` auto-activation and JS plugins with slash commands + hooks. |

## 📦 Install

One-liner (curl):

```bash
curl -fsSL https://raw.githubusercontent.com/zakmijo2-dotcom/Kayno-ai-cli/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

From source:

```bash
git clone https://github.com/zakmijo2-dotcom/Kayno-ai-cli.git
cd Kayno-ai-cli && npm link
```

<details>
<summary><b>Termux (Android)</b></summary>

```bash
pkg install nodejs
curl -fsSL https://raw.githubusercontent.com/zakmijo2-dotcom/Kayno-ai-cli/main/install.sh | sh
```
Designed for weak devices: incremental ANSI rendering (no full-screen clears), ASCII symbol fallbacks, `NO_COLOR` respected, works over SSH.
</details>

## 🚀 Quickstart

```bash
mij auth set-key openrouter sk-or-...   # or export OPENROUTER_API_KEY
mij                                      # launch the TUI
```

Inside the TUI:

```text
/provider     pick from the catalog with readiness badges
/model        interactive model selector
/git          branch, diff, log without leaving chat
/sessions     browse & resume saved conversations
```

Other providers:

```bash
mij auth login google                    # Gemini CLI-style OAuth → Code Assist
mij chat -p google-code-assist -m gemini-2.5-pro

mij auth login antigravity               # Antigravity IDE backend
mij chat -p antigravity -m gemini-3-pro-preview
# captured tokens instead of browser flow:
mij auth import antigravity --access TOKEN --refresh TOKEN

mij chat -p ollama -m llama3.2           # fully local
```

### Three modes

| Command | Behavior |
|---|---|
| `mij` | Interactive TUI (same as `mij chat`) |
| `KAYNO_TUI=0 mij chat` | Classic line REPL for dumb terminals / pipes |
| `mij ask "question"` | One-shot, plain-text output — **zero ANSI escapes**, stdin-pipe friendly |

```bash
cat server.js | mij ask -p deepseek -m deepseek-chat "review this"
```

## 🛠 Tool System

Every file tool passes through the **workspace sandbox** — paths resolving outside the project root are rejected with `EPATHSANDBOX`.

| Tool | Permission | Notes |
|---|---|---|
| `read_file` | read | Line windowing (`offset`/`limit`), binary detection, 2MB guard |
| `write_file` | write | Creates parent dirs |
| `edit_file` | write | Exact-match replace; uniqueness enforced unless `expected_count` given |
| `patch_file` | write | Unified diff hunks with ±25-line fuzzy context matching |
| `grep` | read | Recursive regex; skips `node_modules`/`.git`/binaries; capped output |
| `glob` | read | `**/*.js` style patterns |
| `list_dir` | read | Sizes + types |
| `run_command` | shell | bash -lc in workspace root, timeout clamped 5–600s |
| `fetch_url` | network | http(s) only, 30s timeout, output cap |
| `git_status` / `git_diff` | git | Branch awareness for the agent |

## 🔐 Permission Engine

Independent per-category policies — fail closed in scripts, interactive cards in the TUI:

```jsonc
// ~/.kayno/config.json
{
  "permissions": {
    "read":    "allow",
    "write":   "ask",      // confirmation card in TUI
    "shell":   "ask",
    "network": "allow",
    "git":     "allow"
  },
  "workspace": {
    "root": "~/projects/myapp",   // default: cwd
    "extraRoots": []
  }
}
```

Non-interactive mode never hangs: an unapproved action fails loudly with the exact command to fix it.

## 🧠 Context & Reliability

- **Per-model limits** from the catalog (context window, tool/reasoning/vision flags) drive automatic conversation pruning — old turns compress away while tool-call pairing stays valid.
- **Transport retries**: exponential backoff on 429/5xx/network errors, honors `Retry-After`, fully abort-aware.
- **Usage tracking**: prompt/completion tokens surfaced live in the status bar.

## ⌨️ Keyboard

| Key | Action |
|---|---|
| `Enter` | send · `Ctrl+J` newline |
| `↑ ↓` | message history / cursor lines |
| `/` | command palette (type to filter, Tab completes) |
| `Ctrl+C` | cancel running turn → press again to quit |
| `Ctrl+L` `Ctrl+U` `Ctrl+W` | clear screen / line / word |
| `Esc` | close any selector |

**Slash commands:** `/help /new /clear /history /save /sessions /session /model /provider /system /skills /git /reload /exit` — aliases `/q /m /p /sys /sess`

## 🧩 Skills & Plugins

Drop `SKILL.md` anywhere under `~/.kayno/skills/` or `<project>/.nova/skills/`:

```markdown
---
name: code-review
description: Review code for bugs and security issues
triggers: [review, audit]
priority: 5
---
Instructions injected when the user's message matches…
```

Plugins are plain JS modules in `~/.kayno/plugins/`:

```js
export const name = 'my-plugin';
export function setup() {
  return {
    commands: { hello: () => console.log('hi') },   // → /hello
    async beforeRequest(ctx) { /* observe/edit */ },
    async afterResponse(ctx) { /* log, metrics */ },
  };
}
```

## 🩺 Diagnostics

```bash
$ mij doctor
 ok   node >= 18 — v22.22.1
 ok   config readable — ~/.kayno/config.json
 warn default provider auth — openrouter — no key yet
 ok   stored credentials — 1 entry
 ok   models.dev catalog — 3d old
 ok   project detected — javascript · npm
```

## ⚙️ Configuration

Full reference at [`config.json`](#-permission-engine) keys:

`provider` · `model` · `temperature` · `profile` (coder/assistant/raw) · `tools` · `yolo` · `maxTurns` · `stream` · `contextBudgetPct` · `systemOverride` · `permissions.*` · `workspace.*` · `providers.<id>.{baseUrl,model,apiKey}`

Config home resolution: `$KAYNO_HOME` → `$NOVA_HOME` → existing `~/.nova` (legacy) → `~/.kayno`.

## 🏗 Architecture

```text
bin/mij.js            entry
src/
├─ cli.js             commands, flags, REPL fallback
├─ tui/               renderer · input/keymap · components · selectors · app
├─ engine.js          event-driven agent loop (tool cycles, abort, usage)
├─ context.js         token estimation, pruning, model capabilities
├─ permissions.js     allow/ask/deny policy engine
├─ workspace.js       path sandboxing
├─ tools.js           11 sandboxed tools
├─ providers/         61 presets + models.dev sync + unified client (OpenAI/Anthropic/Gemini/CodeAssist/Vertex)
├─ auth/              OAuth (Google), token store, gcloud, antigravity import
├─ session.js         persistent sessions
├─ skills/ plugins/   extensibility
└─ git.js project.js diagnostics.js logger.js
tests/                6 suites, 100+ checks incl. E2E child-process tests
```

## 🧪 Testing

```bash
npm test
```

Six suites: core smoke, TUI units (editor, key decoder, palette, renderer), E2E child-process tests against mock SSE servers (streaming, Ctrl+C cancel, tool confirmations, ANSI-free piped output), context/pruning/caps, sessions, skills.

## 🔒 Security notes

- Secrets are redacted from all logs (`sk-…`, `ghp_…`, Bearer, tokens).
- OAuth tokens live only in `~/.kayno/auth.json` (chmod-restricted home).
- The sandbox defaults to your current project; widen deliberately via `workspace.extraRoots`.

## 📄 License

[MIT](LICENSE) © zakmijo2-dotcom

Credits: provider catalog by [models.dev](https://models.dev) · Google OAuth desktop pattern from the open-source [Gemini CLI](https://github.com/google-gemini/gemini-cli) · web bridges: [deepseek-free-api](https://github.com/VincentZyc/deepseek-free-api), [qwen-free-api](https://github.com/LLM-Red-Team/qwen-free-api)
