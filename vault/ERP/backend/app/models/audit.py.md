---
type: file-explanation
source_path: "backend/app/models/audit.py"
importance: normal
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# audit.py — 관리자 액션 감사 로그 표

## 이 파일은 무엇을 책임지나

관리자(admin)가 한 마스터/설정 변경을 기록하는 감사 로그(AdminAuditLog) 를 정의합니다.

## 업무 흐름에서의 의미

재고 변동(입출고/이동/불량 등)은 거래 로그가 이미 그 자체로 감사 기록입니다. 이 표는 그 외의 변경 — 품목·직원·BOM·설정·코드 같은 마스터 데이터 수정 — 을 "누가 언제 무엇을 바꿨나" 로 남깁니다.

## 언제 보면 좋나

- 관리자 변경 이력을 추적할 때
- 사번 audit(누가 admin PIN 으로 무슨 액션을 했나)을 확인할 때

## 중요한 내용

- `AdminAuditLog` — `actor_employee_code`(PIN 검증 후 박힌 사번, NULL 이면 사번 없이 admin PIN 만으로 실행)·`action`·`target_type`·`target_id`·`payload_summary`·`request_id`·`created_at`.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/transaction.py]] — 재고 변동 감사는 이쪽(거래 로그)이 담당.
- [[ERP/backend/app/models/employee.py]] — actor_employee_code 가 가리키는 직원 사번.

## 핵심 발췌

```python
actor_employee_code = Column(String(16), nullable=True, index=True)  # 사번
action = Column(String(64), nullable=False, index=True)
target_type = Column(String(64), nullable=False, index=True)
```
