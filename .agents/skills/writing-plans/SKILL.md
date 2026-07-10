---
name: writing-plans
description: Use when writing any implementation plan — in plan mode or on request. Automatically analyzes whether a team of agents is more efficient than solo execution, selects the appropriate model AND Effort level (low/medium/high/xhigh/max, constrained to what the chosen model supports) based on task complexity, and embeds all three recommendations into the plan header and each task. Always use this skill in plan mode before writing the final plan.
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill at execution time.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## GOAL Integration

Every plan MUST include a single `**GOAL:**` line in the plan header. Write it as a concrete objective suitable for Codex `create_goal.objective`: outcome-focused, specific, and short enough to track until completion.

Do not create a Codex goal while only drafting the plan. When the user approves the plan for execution (for example: "approve", "execute", "go", "do it", or choosing an execution option), create a Codex goal with the exact `GOAL` text before starting implementation if the environment supports goal tools. If goal tools are not available, explicitly carry the `GOAL` text into the execution handoff and progress updates.

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Execution Analysis: Team & Model Selection

Before writing the final plan, analyze whether team-based execution is appropriate and select the recommended model:

### Team Efficiency Assessment

Recommend team execution if ANY of these apply:
- **2+ independent parallel tasks**: Tasks that can run simultaneously without shared state or sequential dependencies (e.g., modifying file A + modifying file B without either blocking the other)
- **Different expertise domains needed simultaneously**: Frontend work + backend work at the same time
- **Too much work for one context**: Plan length >15 tasks or scope too large for solo execution

Otherwise, recommend solo execution.

### Model Complexity Assessment

Based on task content, select one Codex model for the entire plan:
- **GPT-5.6 Luna** — Variable renames, file searches, text edits, simple documentation changes, and small mechanical cleanup
- **GPT-5.6 Terra** — Bug fixes, router additions, API integrations, backend+frontend feature work, moderate refactors, and most DEXCOWIN MES development plans
- **GPT-5.6 Sol** — State machine redesigns, security-critical auth changes, structural changes spanning many files, complex architectural decisions, and high-risk data-flow changes

### Effort Level Assessment

Effort is the reasoning-depth setting. It is **model-dependent** — only recommend a level the chosen model actually supports:

| Recommended model | Selectable Effort levels |
|---|---|
| **GPT-5.6 Luna** | `낮음` · `중간` |
| **GPT-5.6 Terra** | `낮음` · `중간` · `높음` |
| **GPT-5.6 Sol** | `중간` · `높음` · `매우 높음` |

Pick the level by how much reasoning the work genuinely needs:
- **낮음 / 중간** — short, well-scoped, repetitive, or latency-sensitive work
- **높음** — standard DEXCOWIN MES development with meaningful regression risk; the safe baseline for Terra
- **매우 높음** — deep reasoning: tricky logic, architecture judgment, high-risk cross-file changes, and security/state-machine work (**Sol only**)

If you recommend a level the model can't reach (e.g. `매우 높음` on Terra), the UI may fall back or reject it — keep recommendations inside the table to avoid surprise.

Keep model strength, reasoning depth, and team/subagent execution separate: model = capability, reasoning = depth, team configuration = parallelism.

Write the assessment into the plan header (see below).

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** [Concrete Codex goal objective to create when the user approves execution]

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---

## Execution Strategy

**추천 모델: [GPT-5.6 Luna|GPT-5.6 Terra|GPT-5.6 Sol]** — [One-line reason: complexity, file types affected, judgment required]

**추천 추론 수준: [낮음|중간|높음|매우 높음]** — [One-line reason. Must stay within the recommended model's supported range — see the Effort table above.]

**팀 구성: [필요|불필요]** — [Reason: e.g., "3 independent tasks can run in parallel" OR "sequential dependencies throughout, solo is efficient"]

---
```

## Task Structure

Each task includes a model tag and parallel-work indicator:

````markdown
### Task N: [Component Name] `[GPT-5.6 Luna|GPT-5.6 Terra|GPT-5.6 Sol] [병렬 가능|순차]`

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If the user approves execution:**
- Create a Codex goal first with the exact `GOAL` header text when goal tools are available.
- Keep the goal active through implementation and verification.
- Mark the goal complete only after the plan is implemented, verified, and no required work remains.

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
