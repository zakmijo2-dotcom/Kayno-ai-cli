---
name: code-review
description: Review code for bugs, security issues, and design smells before merging
triggers: [review, code review, audit, check my code, look at this code]
---

When reviewing code:
1. Read the actual files first — never review from memory or assumption.
2. Prioritize findings: security > correctness > performance > style.
3. For each finding give: file:line, why it matters, and a concrete minimal fix.
4. Check specifically: injection risks, auth/authz gaps, race conditions, error swallowing, resource leaks, N+1 queries, missing input validation.
5. End with a verdict: SHIP / FIX-FIRST / BLOCK with the blocking items listed.
