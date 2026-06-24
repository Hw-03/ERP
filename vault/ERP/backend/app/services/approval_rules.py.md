# approval_rules.py

## 이 파일은 뭐예요?

입출고 배치가 ① 창고 결재 ② 부서 결재 ③ 즉시 반영 중 무엇을 타는지 결정하는 **규칙 상수 단일 원천**입니다.

이전에는 같은 집합이 `io_preview`·`sr_validation` 두 곳에 중복돼 있었고, ADR-0005에서 한 곳으로 통합했습니다.

## 중요한 내용

```python
WAREHOUSE_APPROVAL_SUB_TYPES  # 창고 승인 필요: {"warehouse_to_dept", "dept_to_warehouse"}
APPROVAL_SUB_TYPES            # 전체 승인 필요: 위 + {"defect_quarantine"}
```

**프론트엔드 동기화 대상**: `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts`  
**자동 검사**: `tests/test_approval_rules_drift.py`

## 위험도

🔴 높음

이 상수가 프론트와 불일치하면 창고 결재가 생략되거나 불필요한 결재가 발생합니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/io_preview.py]] — 이 상수 재사용
- [[ERP/backend/app/services/io_dispatch.py]] — 이 상수 기반 분기
- `_attic/docs/adr/ADR-0005-approval-rules-single-source.md` — 통합 결정 배경
