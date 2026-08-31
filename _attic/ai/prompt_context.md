# DEXCOWIN MES AI 공통 컨텍스트 진입점

이 문서는 Claude Code와 Codex가 저장소 작업을 시작할 때 함께 사용하는 공통 색인이다. 세부 규칙과 작업 상태를 중복 기록하지 않고, 실제 기준 문서의 위치와 읽는 순서만 안내한다.

## 시작 시 읽기 순서

1. 현재 도구의 프로젝트 지침을 먼저 따른다.
   - Codex: [AGENTS.md](../../AGENTS.md)
   - Claude Code: [CLAUDE.md](../../CLAUDE.md)
   - 두 파일은 같은 프로젝트 정책을 설명하므로, 한쪽을 바꾸면 다른 쪽도 같은 의미로 갱신한다.
2. 활성 TODO·새 작업 수집이 필요할 때는 `_attic/handoff/active/`만 확인한다. 보관 이력은 `_attic/handoff/archive/`, 보류 검토는 `_attic/handoff/deferred/`에서 읽기 전용으로 확인한다.
3. 작업에 필요한 도메인 기준만 `_attic/docs/`에서 읽는다.
   - 저장소 구조: [REPO_LAYOUT.md](../docs/REPO_LAYOUT.md)
   - 업무 맥락: [CONTEXT.md](../docs/CONTEXT.md)
   - 용어: [GLOSSARY.md](../docs/GLOSSARY.md)
   - 품목 코드: [ITEM_CODE_RULES.md](../docs/ITEM_CODE_RULES.md)
   - 구조와 운영: [ARCHITECTURE.md](../docs/ARCHITECTURE.md), [OPERATIONS.md](../docs/OPERATIONS.md)
   - 보관 정책: [ATTIC_POLICY.md](../docs/ATTIC_POLICY.md)
4. 문서와 실제 코드가 다르면 live code를 기준으로 확인하고, 판단을 보고하기 전에 해당 파일과 줄을 직접 검증한다.

## 활성 자료와 역사 자료

- `_attic/handoff/active/`는 새 TODO와 활성 작업 인수인계의 유일한 쓰기 위치다. 파일은 `YYYY-MM-DD-<주제>-todo.md`로 만든다.
- `_attic/handoff/archive/`는 완료·정리된 TODO의 역사 보관 위치이며 수정·추가 대상이 아니다. `_attic/handoff/deferred/`는 보류 검토 전용이다.
- 이 문서는 공통 읽기 순서와 기준 경로만 관리한다. 개별 작업 상태나 완료 이력은 중복해서 기록하지 않는다.
- [AI_HANDOVER.md](AI_HANDOVER.md)는 과거 작업의 역사 보관 자료다. 현재 컨텍스트나 시작 문서로 사용하지 않는다.
- 교차 세션·교차 도구에서 공유해야 하는 활성 컨텍스트는 저장소의 이 문서와 `_attic/handoff/active/`를 기준으로 한다. 도구별 비공개 메모리는 보조 자료일 뿐, 저장소 기준을 대체하지 않는다.
