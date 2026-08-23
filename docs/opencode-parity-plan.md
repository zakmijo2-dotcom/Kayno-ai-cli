# MIJ → OpenCode-Parity Upgrade Plan

Reference: anomalyco/opencode (architecture ideas only — no code copied).
Rule: one commit per phase (`feat(mij): phase N - <name>`), green gates between phases,
zero new npm dependencies for the entire plan.

## 0. Baseline (audited)

| Area | Status |
|---|---|
| Tests | 7 suites, ~120 checks, all green |
| Entry | `bin/mij.js` → `src/cli.js` (`chat` TUI / `ask` headless) |
| Tools (11) | read_file, write_file, edit_file, patch_file, grep, glob, list_dir, run_command, fetch_url, git_status, git_diff |
| Permissions | allow/ask/deny × read/write/shell/network/git (`src/permissions.js`) |
| Sandbox | `src/workspace.js` (`EPATHSANDBOX`) |
| Sessions | JSON at `$KAYNO_HOME/sessions`, resume/fork/delete/search (`src/session.js`) |
| Providers | registry/capabilities/models/adapters (`src/providers/*`) |
| Usage tracking | partial: `usage` events exist (`src/context.js: usageTotals`), **not** persisted per-turn |

### ⚠ Uncommitted WIP (from fullscreen-TUI task, must be resolved first)

Working tree contains staged-but-uncommitted primitives:
`src/tui/markdown.js`, `src/tui/screen.js`, `src/tui/modals.js`, `ansi.js(+dim)`.
`app.js` does NOT yet consume them. All suites pass with this WIP.

**Decision needed at gate:** land these as `feat(mij): phase 0 - fullscreen tui primitives`
(recommended — they are prerequisites for Phases 1/6 UI work) or revert them.

## 1. Phase → File Map

### PHASE 1 — Token Accounting + `/compact`
- `src/context.js`: add `turnUsage(session)` accumulator; persist per-turn usage in
  session state (`session.usage[]`), survive save/load.
- `src/session.js`: schema stays backward-compatible (new optional `usage` field).
- `src/engine.js`: aggregate `usage` events per turn → store `{in,out,cached}` on session;
  emit `turn_complete.tokens` (already exists) extended with cached tokens.
- Pricing: `src/providers/models.js` records gain `cost` (input/output $/Mtok) from
  models.dev when present; `estimateCost(providerId, modelId, usage)` helper.
- TUI header (`src/tui/app.js`): `in:X out:Y cached:Z est:$N`.
- `/compact`: `src/commands/compact.js` — builds preservation set (last N diffs, last
  tool outputs marked important, project/architecture facts), summarizes older turns via
  `completeOnce`, replaces history slice with single summary message; integrates with
  `context.pruneConversation` budget math.
- Auto-trigger: engine checks `conversationTokens > 75% contextLimit` post-turn → emits
  `status` suggestion; TUI offers one-key accept.
- Tests: `tests/compaction.test.mjs` (token counters; compaction keeps pinned artifacts;
  mock provider summarizer).

### PHASE 2 — Undo/Redo Checkpointing
- New `src/checkpoints.js`: diff-based snapshots (reverse unified patch + full content
  only for created/deleted files). One checkpoint per agent *turn* (multi-tool calls
  collapse into a single undoable unit).
- Storage `.mij/checkpoints/<ts>-<id>.json`; added to a repo `.gitignore` snippet +
  auto-write if git repo.
- Hooks: wrap `executeTool` for write_file/edit_file/patch_file/run_command in
  `engine.runTurn` — capture before-state, register on success.
- `/undo` `/redo` slash commands + TUI keybinding (Ctrl+Z / Ctrl+R); conversation
  untouched by design.
- Edge cases tested: undo-after-compact, externally-deleted files restored from snapshot.
- Tests: `tests/checkpoints.test.mjs`.

### PHASE 3 — Diagnostics Self-Healing Loop
- Tool `run_diagnostics` in `src/tools.js` (+schema): dispatch by extension/project:
  `node --check` (js), `tsc --noEmit` (ts, only if typescript dep present), `eslint`
  (if configured), `python -m py_compile`, `go vet`, `cargo check` — detected via
  existing `project.detectProject()`.
- Engine loop: after any file-mutating tool, auto-run diagnostics; on errors feed them
  back as a tool result (max 3 repair iterations, then honest report).
- `mij doctor` gains a "linters available" section (`src/diagnostics.js`).
- Tests: `tests/diagnostics.test.mjs` (broken syntax planted → detected; repair loop
  bounded; honest failure reporting).

### PHASE 4 — MCP Client (stdio first, SSE later)
- New `src/mcp/client.js` (JSON-RPC 2.0 over stdio lines via `child_process.spawn`,
  newline-delimited framing) + `src/mcp/sse.js` reusing the existing SSE iterator in
  `http.js` (zero-dep already proven).
- Config `~/.config/mij/mcp.json`: `{ servers: { name: { command, args?, url? } } }`
  (also read from `$KAYNO_HOME/mcp.json`). Example committed as `docs/mcp.example.json`.
- Registry bridge: MCP tools registered into `TOOL_SCHEMAS` dynamically as
  `mcp__<server>__<tool>`, executed through the same permission gate — **new permission
  category `mcp` defaulting to `ask`**; any tool whose server declares shell-like
  behavior requires explicit confirmation (never auto-run).
- Robustness: malformed JSON-RPC skipped with warning; server crash → tools disabled
  until `/reload`; startup timeouts (3s connect, configurable).
- Tests: `tests/mcp.test.mjs` with an in-repo mock stdio server (node script) covering
  initialize/list/call + malformed-frame tolerance.

### PHASE 5 — Project Rules Auto-Discovery
- `src/rules.js`: priority scan `AGENT.md` → `SKILL.md` → `.mij/skills/*.md` →
  `.github/copilot-instructions.md`; char-budget aware truncation that shares the
  Phase-1 token budget (rules never evicted by compaction).
- Wired into `buildSystemPrompt({ rules })` (`src/prompts/system.js`) + engine call site.
- Tests: `tests/rules.test.mjs` (priority order, missing files, oversized-file truncate).

### PHASE 6 — Palette UX + Multimodal (consumes fullscreen primitives)
- Finish fullscreen app integration of staged `screen/markdown/modals`
  (header: provider│model│tokens%│session; scroll viewport; footer hints).
- Slash commands: `/compact` `/undo` `/redo` `/diff` `/tokens` `/cost` `/export <file>`
  `/share` (writes markdown export; no network).
- `@image.png` attachments: sandbox-checked path → base64 vision payload; blocked with
  clear message when `capabilities.vision === false`.
- Collapsible Thinking blocks with elapsed time (`Thought: 12s`) — reasoning text kept
  memory-only, never persisted.
- Confirmation dialogs become centered modals with preview diffs (uses Phase-2 preview
  data + `tools.buildToolPreview`).
- Tests: parsing/validation units + E2E additions in `tests/tui-e2e.mjs`.

### PHASE 7 — Full Regression + Docs + Ship
- All suites green ×2 consecutive runs; README.md/README.ar.md updated; final push.

## 2. Dependencies

None added at any phase. MCP = built-in `child_process` + existing hand-rolled SSE.
Everything stays Node ≥ 18 / Termux-safe (no pty, no native modules).

## 3. Security Invariants (all phases)

- Sandbox (`workspace.js`) applies to any new path-touching feature (@attachments,
  exports, checkpoints inside project root only unless absolute opt-out).
- MCP tools inherit the permission gate; category `mcp` defaults to `ask`; deny wins.
- Secrets redaction (`util.redact`) applied to every new log surface.

## 4. Gates

Each phase ends with: focused suite green → full `npm test` green → separate commit
→ short report (files, behavior change, evidence). Phase exits require explicit "PHASE N: DONE".
