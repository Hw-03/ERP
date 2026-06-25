---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents. The quality of its work will be significantly higher if run on a platform with subagent support (such as Claude Code or Codex). If subagents are available, use superpowers:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: Create TodoWrite and proceed

### Step 2: Apply Plan Metadata

1. Read the plan header's **"추천 모델"**, **"추천 Effort"**, and **"팀 구성"** fields
2. **Effort:** If the header recommends an Effort level (anything other than "해당 없음") and the current session is not already at it, tell the user once — e.g. *"이 플랜은 Effort `xhigh`를 추천합니다 — `/effort xhigh`로 맞추면 좋습니다."* You cannot change your own Effort; only the user can via `/effort`. Don't block on it — proceed either way.
3. If team execution is recommended: Prepare to dispatch multiple agents (one per independent task group) using the model specified in each task
4. If solo execution: All tasks run with the recommended model from the header

### Step 3: Execute Tasks

For each task:
1. Mark as in_progress
2. Note the task's model tag `[Haiku|Sonnet|Opus]` and parallel indicator `[병렬 가능|순차]`
3. If marked `[병렬 가능]` and team is active: Dispatch this task as an independent agent with the specified model
4. If marked `[순차]`: Execute immediately in sequence
5. Follow each step exactly (plan has bite-sized steps)
6. Run verifications as specified
7. Mark as completed

### Step 4: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **superpowers:using-git-worktrees** - Ensures isolated workspace (creates one or verifies existing)
- **superpowers:writing-plans** - Creates the plan this skill executes
- **superpowers:finishing-a-development-branch** - Complete development after all tasks
