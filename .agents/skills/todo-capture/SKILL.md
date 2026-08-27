---
name: todo-capture
description: Use when the user starts TODO collection with prompts like "투두리스트 작성하자", "투두 작성", "TODO에 적어둬", "나중에 구현", "한번에 구현하게 정리해", or points at UI/product problems that should be accumulated before implementation.
---

# TODO Capture

Use this skill to run TODO collection mode. The goal is to turn the user's pointed problems into an implementation-ready handoff TODO document without changing product code.

## Core Rule

Once TODO collection starts, do not implement product changes until the user later requests a Plan Mode implementation plan and then explicitly asks to execute it.

Allowed during TODO collection:
- Inspect the current screen, code, or existing TODO files to understand the issue.
- Create or update the TODO document.
- Ask focused clarification questions only when the TODO cannot be written accurately.
- Summarize captured items and missing policy decisions.

Not allowed during TODO collection:
- Edit product code.
- Run migrations, codegen, formatters, or implementation commands.
- Restart servers as part of fixing the issue.
- Commit or push as part of the TODO item.
- Convert the TODO list directly into implementation without a Plan Mode plan.

## Default Behavior

Write TODOs in handoff-ready form from the beginning, not as rough notes. The TODO file should be useful to another session without needing the original chat.

For every issue the user points out, write:

```markdown
### N. Short issue title
- 화면/영역:
- 증상:
- 사용자 불편:
- 확정 정책:
- 구현 방향:
- 수용 기준:
- 브라우저 확인 시나리오:
- 우선순위: 높음 / 중간 / 낮음
```

If a policy is not decided yet, do not leave it vague. Add:

```markdown
- 정책 확인 필요:
```

Then replace it with `확정 정책` once the user decides.

## Destination Rules

1. If the user names a file, use that file.
2. In DEXCOWIN MES, write only under `_attic/handoff/active/`.
3. Create a dated topic file named `YYYY-MM-DD-<topic>-todo.md` for each new workstream; never select `_attic/handoff/archive/` or `_attic/handoff/deferred/` as a write destination.
4. Continue an existing file only when it is under `active/` and the tab/domain is the same workstream.
5. If the user moves across tabs, keep one active document but group items by section such as `공통`, `입출고내역`, `입출고`, `출하`, `불량`, `대시보드`.
6. Documents marked `정리 완료` are historical references even when they are outside `archive/`; do not append to them.
7. In other repos, inspect local handoff/docs/TODO conventions before choosing a path.

## Document Shape

At the top of the TODO document, keep an operating summary dashboard. For DEXCOWIN MES follow-up TODO documents, prefer this shape over a minimal count-only summary:

```markdown
# <Topic> TODO 핸드오프

## 전체 현황
- 구현 완료된 기준 TODO: N개
- 구현해야 할 후속 TODO: N개
- 총 관리 TODO: N개
- 확정 후속 TODO: N개
- 자율 점검 추가 TODO: N개
- 사용자 추가 TODO: N개
- 공통: N개
- <탭/영역>: N개
- 우선순위: 높음 N개 / 중간 N개 / 낮음 N개
- 구현 전 정책 확인 필요: N개
- 문서 목적: <this TODO document's handoff purpose>

## 참고한 기준과 근거
- 기존 완료 문서: `<path>`
- 다른 세션 TODO 기준: `<path>`
- 브라우저 확인: <screens and states checked>
- 코드 확인: <files or UI strings checked>

## 자율 점검 기준
- 같은 정보는 같은 모양이어야 한다.
- 선택된 것은 빈 검색 결과처럼 보이지 않아야 한다.
- 사용자가 고르지 않아도 되는 판단은 시스템이 해야 한다.
- 핵심 입력은 보조 필드처럼 숨기지 않는다.
- 요약은 펼쳤을 때 검산 가능해야 한다.
- 형제 화면의 선택 문법을 맞춘다.
- 빈 큰 영역, 중복 카드, 막힌 이유 없는 비활성 버튼을 줄인다.
- 부족, 제외, 경고, 상태는 목록 안에서도 보여야 한다.
- 수정 동선은 한 군데로 정한다.
- 작업 화면과 내역 화면은 같은 거래를 같은 말로 설명해야 한다.

## 확정 결정 요약
- ...
```

Then group items by tab or domain:

```markdown
## 공통
### 1. ...

## 입출고내역
### 2. ...
```

Use business-facing section names that match the latest decided product structure. If a menu is renamed during TODO capture, update the section heading and the count label together. Example: if `출하 요청` and `출하 준비 중` are decided to merge, use `출하 관리` as the section/count label while preserving old screen names inside `화면/영역` when they describe the current UI.

Update all dashboard counts whenever meaningful:
- `구현 완료된 기준 TODO`: completed baseline items referenced by this document, usually from a previous handoff.
- `구현해야 할 후속 TODO`: open items in the current document.
- `총 관리 TODO`: completed baseline + open follow-up.
- `확정 후속 TODO`: user-approved seed items carried into the document.
- `자율 점검 추가 TODO`: items the agent found by inspecting the flow.
- `사용자 추가 TODO`: items added from the user's later comments/screenshots.
- Section counts: count actual TODO headings under each section.
- Priority counts: count `우선순위` values across open items.
- `구현 전 정책 확인 필요`: count items that still have `정책 확인 필요`.

If the user is rapidly pointing at many issues, it is acceptable to update counts after a short batch, but do not let counts drift by the end of the turn. Before reporting a count, verify it against the document headings and priority/policy markers.

## Writing Guidelines

- Translate casual complaints into implementation units.
- Preserve the user's intent, but do not copy vague wording as-is.
- Prefer behavior-level TODOs over file-by-file instructions unless a file path is necessary.
- Combine repeated comments that describe the same underlying issue.
- Keep screenshot/browser evidence in plain language: screen state, selected region, and expected behavior.
- Do not over-plan into a full implementation plan. The TODO must say what to fix, the agreed policy, and how to verify it.
- Mark uncertainty explicitly under `정책 확인 필요`.

## When the User Asks Questions During TODO Mode

If the user asks "이건 어떻게 생각해?" or "이 방향 맞아?", answer briefly, then write the resulting decision into the TODO document.

If the user asks "몇 개 쌓였어?", report the current count by section.

If the user asks "계획 세워" while not in Plan Mode, do not write the official implementation plan. Tell the user to switch to Plan Mode first.

If the user asks "구현해" while TODO collection is active or just ended, block execution and say the TODO list must first become a Plan Mode implementation plan.

## Ending TODO Collection

When the user says TODO collection is done:

- Report the total count and count by section.
- Name the TODO file path.
- Check that each item has `증상`, `사용자 불편`, `확정 정책` or `정책 확인 필요`, `구현 방향`, `수용 기준`, `브라우저 확인 시나리오`, and `우선순위`.
- Do not start implementation in the same step.

## Implementation Completion Contract

When an active TODO is later implemented, the implementing agent must update the same active TODO document before committing:

1. Mark each implemented heading as `[완료]` and add the implementation date, verification command/result, and commit hash when available.
2. Recalculate every affected dashboard count, including completed, open follow-up, total, priority, and policy-confirmation counts.
3. Verify the headings and summary agree. Do not leave an implemented item open because the work session is ending or the change is small.

`active/` TODOs are the only documents that receive these lifecycle updates. Archived and deferred documents remain read-only unless the user explicitly reopens an item into a new active TODO.
