---
type: code-note
project: ERP
layer: docs
source_path: docs/README.md
status: active
updated: 2026-04-27
source_sha: 5af8178d3a70
tags:
  - erp
  - docs
  - documentation
  - md
---

# README.md

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/README.md`
- Layer: `docs`
- Kind: `documentation`
- Size: `925` bytes

## 연결

- Parent hub: [[docs/docs|docs]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

````markdown
# ERP 문서 목차

이 폴더에는 현재 개발과 운영 판단에 필요한 문서만 둔다.

## 현재 기준 문서

| 문서 | 용도 |
|---|---|
| `ITEM_CODE_RULES.md` | 품목코드와 공정코드의 최종 기준. `AF` 기준과 `AF` 사용 금지를 명시한다. |
| `AI_HANDOVER.md` | Claude/Codex가 이어받을 때 보는 최신 인수인계 문서. |
| `CODEX_PROGRESS.md` | 큰 기능 단위의 진행 이력과 최근 변경 요약. |

## 참고 자료

| 경로 | 용도 |
|---|---|
| `design/` | 레거시/데스크톱 UI 디자인 참고 자료, 스크린샷, 발표 자료. 현재 업무 규칙의 기준 문서는 아니다. |

## 정리 기준

- 현재 규칙과 충돌하거나 인코딩이 깨진 초기 산출물은 삭제한다.
- 과거 내용이 필요하면 git 히스토리에서 확인한다.
- 품목코드 기준은 항상 `ITEM_CODE_RULES.md`를 우선한다.
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
