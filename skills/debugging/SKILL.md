---
name: debugging
description: Systematic root-cause debugging for errors, crashes, and failing tests
triggers: [bug, error, crash, exception, stack trace, not working, fails, broken]
---

Debug protocol:
1. Reproduce: run the failing command/test via run_command and capture exact output.
2. Locate: read the stack trace; open the exact files/lines involved with read_file.
3. Form hypothesis: state the suspected cause in one sentence BEFORE editing anything.
4. Verify hypothesis with the smallest possible probe (log, minimal repro, git bisect).
5. Fix at the root, not the symptom. Then re-run the original repro to prove it.
6. Report: root cause → fix → verification evidence.
Never claim "fixed" without re-running the failing case.
