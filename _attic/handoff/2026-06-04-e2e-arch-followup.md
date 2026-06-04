# 핸드오프 — 2026-06-04 e2e 확장 + 결재규칙 deepening + export 동기화

> 잔여·신규 이슈 전면 해소 세션. A·B·C·D1 완료·푸시. D3·D4(대형)는 본 문서로 스코핑(후속 brainstorming 세션 전제).

## 브랜치 / 머지 상태

- 작업 브랜치: `cleanup/code-review-fixes` (origin 푸시 완료, HEAD `4e29ad3c`)
- **머지 정책(사용자 결정): §10 orphan만 `refactor/data-foundation` 반영(PR #19). main 미반영(현재 main은 30+커밋 뒤짐 — 의도적).**
- ⚠️ **B/C/D1 커밋은 `cleanup/code-review-fixes`에만 있고 `refactor/data-foundation`에 미머지.** 원하면 PR `cleanup → refactor/data-foundation` 1건으로 일괄 반영 가능(충돌 0 예상). 사용자 지시 대기.

## 이번 세션 완료 (커밋)

| 트랙 | 내용 | 커밋 |
|---|---|---|
| A | §10 orphan(6627bef3) → refactor/data-foundation (PR #19) | merge |
| B | e2e 확장: io-defect 부활·결재 2-세션 PIN 풀사이클·produce 자식잠김·CI e2e job·teardown 크로스플랫폼·README | `d81ed4d6` |
| C | 결재 규칙 단일 원천(`approval_rules.py`) + FE↔BE drift 테스트 + ADR-0005 | `4e29ad3c`(C) |
| D1 | 내역 export(csv/xlsx) 요청자/승인자명 동기화 + 검색 + 테스트 3 | `4e29ad3c`(D1) |

검증: `verify_local -IncludeE2E` 전 게이트 그린(pytest·lint·tsc·coverage·build·bundle·OpenAPI + e2e 10), 실 mes.db 불변.

메모리 정정: `project_dept_approval_routing_bug` → **해소됨**(548cdc2d, `dept_hierarchy.can_approve_department`). 재플래그 금지.

## D3 — 불량 처리 redesign 잔여 〔후속, brainstorming 선행〕

기준 문서: [defect-handling-redesign.md](../docs/defect-handling-redesign.md)(2026-05-21 합의). 백엔드 다수 준비됨, 프론트 미완 3건:
1. **PA·PF 격리 항목 BOM 트리 펼침** — 격리 화면에서 완제품/조립품의 하위 자재 트리 표시.
2. **부서 간 격리 이동 + 처리** — 격리 재고를 다른 부서로 이동(현재 같은 부서 내만).
3. **대시보드 위치별 재고에 불량(빨강) 표시** — `InventoryLocation` DEFECTIVE 를 대시보드 위치 카드에 시각화.

코드 출발점: 불량 화면 `frontend/app/legacy/_components/`(불량 탭), 백엔드 `app/services/inv_defective.py`·`app/routers/defects.py`. e2e 는 `io-defect.spec.ts`(격리/해제)까지 커버 — 위 3건 구현 시 spec 확장 대상.
**열린 질문**: BOM 트리 펼침 UX(깊이·기본 펼침?), 부서간 이동의 결재 필요 여부, 대시보드 표시 위치/색 규칙. → brainstorming 필요.

## D4 — 창고 앵글맵 시각화 〔후속, brainstorming 선행〕

기준: [이필욱.md](../docs/feedback/이필욱.md) 피드백. 1차 HTML 프로토타입만 존재(루트 `warehouse-map-*.png`·`_attic/docs/warehouse-map-prototype.html`), **백엔드 미접촉**.
- 요구: 창고 9개 앵글(철제 선반) 위치·수량 시각화, 4단계 드릴다운(평면도→정면도→줄→칸).
- 필요 작업: 앵글·위치(줄/칸) 데이터 모델 신설 + 품목↔위치 매핑 API + 프론트 맵 컴포넌트.
**열린 질문**: 위치 모델 스키마(앵글/줄/칸 계층), 기존 `InventoryLocation`(부서×상태)과의 관계(창고 내 물리 위치는 별개 축), 품목당 다중 위치 허용?, 입력 UI. → brainstorming 필요.

## 리포 위생 메모

- 루트에 `warehouse-map-*.png`·`wm-*.png` 등 **untracked 프로토타입 이미지 다수**가 흩어져 있음(D4 프로토타입 산출물). `.gitignore` 추가하거나 `_attic/docs/`로 이동 권장 — 본 세션에서 미처리(타 작업 산출물).
