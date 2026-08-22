---
name: refactor-plan
description: Plan safe incremental refactors with verification at each step
triggers: [refactor, simplify, clean up code, restructure]
---

For refactor requests:
1. State the goal and the smell being removed (duplication, long function, leaky abstraction...).
2. Propose the smallest sequence of behavior-preserving steps.
3. For each step: what changes, how to verify (tests/build/manual check), rollback note.
4. Execute step by step using tools; verify before moving on.
5. Refuse big-bang rewrites unless explicitly requested; prefer strangler-style migration.
