---
type: file-explanation
source_path: "backend/app/services/handover.py"
importance: important
layer: backend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# handover.py — 인수인계 서비스

## 이 파일은 뭐예요?

인수인계서 작성·제출·인수 확인의 업무 로직을 담당합니다. 라우터(`routers/handover.py`)가 이 서비스를 호출합니다.

## 언제 보나요?

- 인수 확인 시 재고 이동이 왜·어떻게 일어나는지 이해할 때
- 인수 권한 조건(`can_receive`)을 확인할 때
- 인수인계 도착 알림 흐름을 따라갈 때

## 중요한 내용

**인수 권한 조건**

```python
def can_receive(actor: Employee, to_department: str) -> bool:
    """인수 확인 권한 — 받는 부서 소속만(고압/진공). 결재권자는 제외."""
    return (actor.department or "").strip() == (to_department or "").strip()
```

결재권자(이필욱·김건호)라도 고압/진공 소속이 아니면 인수 확인 불가 — 의도된 설계.

**인수 확인 시 흐름**

`receive_handover()` → PIN 검증 → `can_receive()` 확인 → `transfer_between_departments()` (재고 이동) → `TRANSFER_DEPT` TransactionLog → status=received

발신 부서는 항상 `_FROM_DEPARTMENT = "튜브"`.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/handover.py]] — API 입구
- [[ERP/backend/app/services/inventory.py]] — `transfer_between_departments` 호출 대상

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/models/handover.py]] — HandoverDoc·HandoverLine 모델
> - [[ERP/backend/app/services/pin_auth.py]] — PIN 검증

## 조심할 점

`receive_handover()`는 재고 이동을 포함하는 트랜잭션입니다. 수정 시 `transfer_between_departments`와 TransactionLog 동반 생성을 함께 확인해야 합니다.
