---
name: continuing-with-handoff
description: Use when a long-running task needs a compact handoff and a new Codex task to continue work without carrying the full conversation context.
user-invocable: true
---

# Continuing With Handoff

Use this only when the user asks to create a handoff and continue in a new task. It reduces conversation context while preserving an explicit, verifiable record of the work state.

Do not use for a short follow-up, a simple question, or when the user only asks to write a handoff document.

## Workflow

1. Confirm the current working directory, current branch, `git status --short`, relevant recent diff/log, and any verification already run. Do not infer completed work from conversation alone.
2. Create one UTF-8 handoff document at `_attic/handoff/YYYY-MM-DD-HHmm-<topic>-handoff.md` using `apply_patch`. Use a short ASCII kebab-case topic. If the name already exists, choose a distinct topic suffix.
3. Write only facts verified in the current task. Include:
   - goal and current state
   - files changed or intentionally untouched
   - completed work and key decisions
   - verification run, results, and verification still needed
   - unresolved risks, blockers, or user decisions
   - the single next action, followed by any remaining steps
   - git state, including unrelated existing changes that must not be touched
4. Create a **new Codex task in the same project and local working directory**. First call `list_projects`, select the project that matches the current directory, then call `create_thread` with `environment: { type: "local" }`.
5. Give the new task a self-contained initial prompt that names the absolute handoff path and tells it to:
   - read `AGENTS.md` and the handoff document before acting;
   - verify the recorded working-tree state before changing files;
   - continue from the documented next action;
   - not create/switch branches, commit, or push unless the user explicitly asks.
6. Report the handoff path and whether task creation succeeded. If it succeeds, emit the required created-task directive. Do not archive, rename, or otherwise alter the original task unless the user explicitly asks.

## Guardrails

- This is a new task, not a thread fork: do not use `fork_thread`, because copying the full history defeats the context-reduction purpose.
- Do not create a worktree or branch. Use the same local directory so uncommitted changes remain visible.
- Do not commit, push, reset, stash, or modify unrelated changes as part of handoff.
- If project lookup or task creation fails, leave the handoff document in place, report the failure plainly, and give the user the handoff path. Never claim that a new task exists when it does not.
- The user may request only the document. In that case, stop after step 3 and do not create a task.
