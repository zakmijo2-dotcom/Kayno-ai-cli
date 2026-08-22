---
name: commit-message
description: Write clean conventional-commit messages from staged changes or described work
triggers: [commit message, commit msg, conventional commit, write a commit]
---

Generate commit messages in Conventional Commits format:
- `type(scope): imperative subject` — types: feat, fix, refactor, perf, test, docs, chore, ci.
- Subject ≤ 72 chars, lowercase, no period, describes WHAT changed not how.
- Body (when needed): bullet the key changes and the WHY. Mention breaking changes with `BREAKING CHANGE:`.
- Never include AI mentions, marketing adjectives ("robust", "comprehensive"), or filler.
- If given `git diff` output, derive the message from actual changes only.
