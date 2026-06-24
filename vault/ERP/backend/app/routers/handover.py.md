---
type: file-explanation
source_path: "backend/app/routers/handover.py"
importance: important
layer: backend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# handover.py — 인수인계서 API

## 이 파일은 뭐예요?

인수인계서(튜브→고압/진공 자재 이관)의 작성·제출·인수 대기함 조회·인수 확인 API를 제공합니다.

## 언제 보나요?

- 인수인계 화면이 어떤 API를 호출하는지 찾을 때
- "인수 확인" 버튼 흐름을 따라갈 때
- 인수인계 권한 관련 오류를 디버깅할 때

## 중요한 내용

**핵심 제약 — 받는 부서만 인수 가능**

```python
# 인수인계를 받는(인수 확인하는) 부서 — 이 부서 소속만 대기함을 보고 인수할 수 있다.
_RECEIVE_DEPTS = ("고압", "진공")
```

인수 확인은 현장 물리 인수 행위입니다. 따라서:
- 생산부 결재권자(이필욱·김건호)라도 고압/진공 소속이 아니면 인수 대기함을 볼 수 없습니다.
- 이는 의도된 설계입니다 (`can_receive(actor, to_department)` 조건 확인).

**인수 확인 시 재고 이동**

인수 확인을 누르는 순간 품목 수량만큼 튜브→인수부서로 실제 재고가 이동합니다(`TRANSFER_DEPT` 로그 동반).

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/handover.py]] — 실제 업무 로직 (인수 권한 확인·재고 이동)
- [[ERP/backend/app/models/handover.py]] — HandoverDoc·HandoverLine 모델

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/schemas/handover.py]] — 요청/응답 스키마
> - [[ERP/backend/app/services/notifications.py]] — 인수인계 도착 알림

## 조심할 점

인수 확인 API(`PUT /{id}/receive`)를 건드릴 때는 재고 이동(`transfer_between_departments`)과 거래 로그까지 함께 검증해야 합니다. 재고 정합성이 흔들릴 수 있습니다.
