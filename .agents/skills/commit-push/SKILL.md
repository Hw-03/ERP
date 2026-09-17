---
name: commit-push
description: Stage, commit, and push the current task changes when the user asks to "커밋푸시", "커밋 푸시", "commit push", "commit and push", or otherwise explicitly requests committing and pushing. Use this to select only changes attributable to the current task/session, exclude unrelated user changes, verify appropriately, commit, and push to the current branch origin.
---

# Commit Push

When the user asks to commit and push, treat that as explicit approval to complete the full local commit and remote push workflow for the current task. Do not stop to ask whether to exclude unrelated files when attribution is clear; exclude them, mention them, and keep moving.

## Fast Path

Use this path by default when the user asks for "this session", "your work", "only what you touched", or the worktree contains obvious unrelated changes.

1. Inspect `git status --short --branch` and the relevant diffs.
2. Build an explicit allowlist of files attributable to the current task/session.
3. Stage only that allowlist with pathspecs. Leave unrelated files unstaged.
4. Confirm the staged list with `git diff --cached --name-only`.
5. Run a quick staged sanity check such as `git diff --cached --check`.
6. Reuse already-run relevant verification when it is fresh and still applies.
7. If full-suite verification fails only in clearly unrelated unstaged areas, record that fact and continue unless the repository instructions absolutely forbid it.
8. Commit with the repository-required message format.
9. Verify the commit subject with `git log -1 --format=%s`.
10. Push to the current branch origin.

## Verification Strategy

- Prefer verification proportional to the staged change, especially when the user is asking for a quick checkpoint commit.
- Do not rerun a long full verification just to rediscover an unrelated failure that has already been isolated.
- If a relevant targeted test fails, fix or report before committing.
- If unrelated unstaged files fail tests, do not block the selected commit solely for that reason. Mention the failing file/test in the final response.
- If verification has not been run at all for risky staged backend/frontend behavior, run the most relevant targeted tests before committing.

## Workflow

1. Inspect `git status` and the relevant diffs before staging.
2. Stage only changes attributable to the current task or session.
3. Leave unrelated user changes unstaged and mention them briefly.
4. Run the most relevant verification command available for the touched area when practical.
5. Commit with a concise message that matches the repository existing style.
6. Push to the current branch origin.
7. If `git push` requires approval because it writes to a remote or needs network access, request that approval immediately and continue after approval.

## Guardrails

- Do not stage unrelated work just to get a clean tree.
- Do not rewrite history, force-push, reset, or discard changes unless the user explicitly asks.
- Do not ask the user whether to exclude unrelated files when the correct action is obvious; exclude them and proceed.
- If the current branch has no upstream, push with an upstream branch only when the branch name is clearly appropriate.
- If relevant verification fails, report the failure and do not push unless the user explicitly tells you to push anyway.
- If only unrelated verification fails and the staged set is already verified enough for a checkpoint commit, continue and disclose the residual failure.
- If push is blocked by authentication, branch protection, or remote policy, report the exact blocker and the commit hash if a commit was already created.

## Speed Discipline

- Optimize for a clean, scoped checkpoint commit, not for proving the entire dirty worktree is healthy.
- Avoid repeated status/diff/test loops after the staged allowlist has been confirmed.
- Use `git diff --cached --name-only` as the source of truth for what will be committed.
- If Git auto-maintenance or hooks take time, report that separately from agent-side delay.
