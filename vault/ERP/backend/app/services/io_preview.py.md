# io_preview.py

## 이 파일은 뭐예요?

입출고 **미리보기** 전담 서비스입니다. 실재고 반영·영속화는 하지 않습니다.

- 라우팅 규칙: 어떤 sub_type이 창고 결재를 타는지 결정
- BOM 묶음(IoBundle) 전개: 상위 품목 선택 → 하위 BOM 자동 나열
- 라인(IoLine) 생성: 수량·상태·라우팅 정보 포함

`io_persist`·`io_dispatch`가 이 파일의 헬퍼(`_enum_value`, `_new_id`, `_get_item`, `APPROVAL_SUB_TYPES`)를 재사용합니다.

## 언제 보나요?

- 미리보기 화면에서 BOM이 이상하게 전개될 때
- 라우팅 분기(즉시/결재)가 예상과 다를 때

## 중요한 내용

- `preview(db, payload, employee_id)` — 미리보기 결과 생성
- `APPROVAL_SUB_TYPES` — 결재가 필요한 sub_type 집합 (프론트 `ioWorkType.ts`와 동기화)
- BOM 전개: 상위 품목의 BOM 트리를 자동으로 펼쳐 라인 생성

## 위험도

🟡 중간

`APPROVAL_SUB_TYPES`가 `approval_rules.py`·프론트 `ioWorkType.ts`와 불일치하면 결재 누락 또는 불필요한 결재 요청이 발생합니다.  
`tests/test_approval_rules_drift.py` 가 자동 검사합니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/approval_rules.py.md]] — 결재 규칙 원천
- [[ERP/backend/app/services/io_persist.py.md]] — 이 파일의 헬퍼 재사용
- [[ERP/backend/app/routers/io.py.md]] — 미리보기 API 진입점

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/bom.py.md]] — BOM 트리 조회
> - [[ERP/backend/app/services/inventory.py.md]]
