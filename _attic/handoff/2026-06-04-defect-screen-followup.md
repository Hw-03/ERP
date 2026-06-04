# 핸드오프 — 불량 처리 화면 개선 (D3)

> 결론: **불량 화면은 사실상 완성됐다.** 2026-06-04 코드 정밀 조사 결과, "남았다"고 알던 3건 중
> **2건은 이미 구현 완료**였고, **진짜 남은 건 "부서 간 격리 이동" 1건뿐** — 그마저 원래 설계에서
> "이번에는 보류"로 미뤄둔 선택 기능이다. 즉 **급한 잔여 작업 없음**.
>
> 설계 마스터: [defect-handling-redesign.md](../docs/defect-handling-redesign.md) (2026-05-21 그릴 합의, 본 핸드오프와 함께 읽을 것).

---

## 1. 이미 구현된 것 — **재구현 금지** (조사 근거 포함)

설계 문서의 거의 모든 Phase 가 이미 코드에 들어가 있다. 다음을 "안 됐다"고 다시 만들지 말 것.

| 기능 | 상태 | 코드 위치 |
|---|---|---|
| 불량 처리 허브(KPI 4 + 액션 3 + 부서별 목록) | ✅ | `frontend/app/legacy/_components/_defect_hub/DefectHubPanel.tsx` · `DefectKpiCards.tsx` · `DefectQuickActions.tsx` |
| 격리(새 불량 추가, 창고/부서 출처, 즉시) | ✅ | BE `services/inv_defective.py:mark_defective` (L78) · `routers/defects.py POST /quarantine` (L261) · FE `AddQuarantineModal.tsx` |
| 정상 복귀(즉시) | ✅ | BE `inv_defective.unmark_defective` (L195) · `POST /unquarantine` (L350) |
| R 폐기 / 공급처 반품(결재) | ✅ | BE `scrap_defective`·`return_to_supplier`·`scrap_normal`·`return_to_supplier_from_normal` · FE `RDefectActionModal.tsx` |
| **PA·PF 분해 + BOM 트리 펼침 + 자식별 정상입고/폐기** | ✅ | FE `DisassembleTree.tsx`(재귀·최대깊이10) · `PaPfDefectWizard.tsx` · BE `sr_execution._handle_defect_disassemble` (L212) · `dept_adjustment.submit_defective_disassemble` (L292). 살린 자식 = 분해 부서 PRODUCTION 입고(설계 준수) |
| **대시보드 위치별 재고에 불량(빨강) 표시 + 클릭 점프** | ✅ | FE `_inventory_sections/InventoryDetailLocations.tsx` (L70-86, `#ef4444`, 클릭→`?tab=defect&defect_dept=`) |
| 사유 입력(카테고리+메모) 전 액션 필수 | ✅ | `ReasonFormFields` / 각 모달. 격리·복귀·폐기·반품·분해 모두 |
| R/PA·PF 자동 분기 | ✅ | `DefectHubPanel.tsx`의 `has_bom` 플래그(`GET /defects/locations` 응답) |

**부서 결재 라우팅**: 설계 §2~3 의 "같은-부서 하드 스코프 버그"는 **이미 해소됨**(`548cdc2d`, `services/dept_hierarchy.py:can_approve_department` — 생산부 정/부가 6라인 모두 결재). 설계 문서가 아직 "버그"로 서술하지만 **현행 코드는 정상**. 재작업 불필요.

**e2e**: `frontend/tests/e2e/io-defect.spec.ts` 가 격리→정상복귀를 자동 검사(그린). 분해 시나리오는 미커버(아래 §3 참고).

---

## 2. 진짜 남은 것 — **D3-2 부서 간 격리 이동** (선택, 원래 "보류")

격리된 불량 재고를 **다른 부서로 옮겨서** 처리하는 시나리오. 현재 격리 처리는 4가지(정상복귀/폐기/반품/분해)뿐이고 **부서 이동은 없다**. 설계 문서 §12-7 에서 명시적으로 "이번에는 보류".

- **미구현 근거**: `inv_defective.py` 에 격리 부서간 이동 함수 없음(정상 재고용 `transfer-between-depts` 만 존재).
- **필요한지부터 확인**: 실제 운영에서 격리품을 부서 넘겨 처리하는 일이 잦은가? 드물면 안 만들어도 됨. → **사용자 확인 선행**.

**구현한다면 출발점**:
- BE: `services/inv_defective.py` 에 `transfer_defective_between_depts(db, item_id, from_dept, to_dept, qty, reason)` 추가 — DEFECTIVE 버킷을 부서 A→B 이동(총량 불변, `_sync_total`). `routers/defects.py` 에 `POST /api/defects/transfer-dept`.
- FE: `_defect_hub/DefectHubPanel.tsx` 격리 항목에 "부서 이동" 액션 + 모달(대상 부서 선택 + 사유). 타입 `lib/api/...defects` 에 요청 스키마.
- **결재 여부**: 부서 이동을 즉시로 볼지 결재로 볼지 결정 필요(설계 미정). 단순 위치 이동이면 즉시가 자연스러움.
- 가드: OpenAPI 스키마 변경 시 baseline 재생성([project_openapi_ci_gate]). e2e `io-defect.spec.ts` 에 이동 시나리오 추가.

---

## 3. (선택) 분해 e2e 커버리지 보강

`io-defect.spec.ts` 는 격리/복귀만 검사한다. PA·PF 분해 BOM 트리(가장 복잡한 흐름)는 e2e 미커버 —
회귀 위험이 있으면 분해 시나리오 spec 추가 고려. 시드에 BOM 부모(완제품/조립품) 격리 상태 필요.

---

## 4. 미결 디테일 (설계 §12 — 구현 시 정할 것)
사유 카테고리 최종 목록 / 정상복귀 트랜잭션 타입(UNMARK 신설 여부) / 공급처 반품 대상 공급처 선택 방식 /
결재 거절 흐름 — 모두 설계 문서 §12 에 정리돼 있음. 부서 이동(D3-2) 들어갈 때 같이 결정.
