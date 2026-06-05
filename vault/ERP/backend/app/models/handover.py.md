---
type: file-explanation
source_path: "backend/app/models/handover.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# handover.py — 튜브→고압/진공 인수인계서 표

## 이 파일은 무엇을 책임지나

튜브 공정에서 다음 공정(고압/진공)으로 물량을 넘길 때 작성하는 "인수인계서" 의 표를 정의합니다. 문서 1건(HandoverDoc)과 그 안의 품목 줄(HandoverLine)로 나뉩니다.

## 업무 흐름에서의 의미

튜브 담당자가 앱에서 인수인계서를 작성·제출하면, 받는 부서(고압/진공) 담당자가 PIN 으로 "인수 확인" 을 합니다. 인수 확인을 누르는 순간 품목 수량만큼 튜브 → 인수부서 생산(PRODUCTION) 재고로 이동합니다. 즉 종이 인수인계를 앱으로 옮긴 것이며, 확인 버튼이 실제 재고 이동의 방아쇠입니다.

## 언제 보면 좋나

- 인수인계 상태(작성중/제출됨/인수완료)가 어떻게 관리되는지 확인할 때
- 인수 확인이 어떤 재고 이동을 일으키는지 이해할 때
- 분석내용(시리얼 목록)이 왜 자유 텍스트인지 볼 때

## 중요한 내용

- `HandoverStatusEnum` — `draft`(작성 중/임시저장) / `submitted`(제출·인수 대기) / `received`(인수 완료·재고 이동됨).
- `HandoverDoc` — 인수인계서 머리. 작성자(author)·보내는 부서(기본 "튜브")·받는 부서(to_department), 양식 칸(제목·공정 내용·제품명·작성일·분석 내용·비고), 인수 확인 정보(받은 사람·시각)를 담습니다.
- `HandoverLine` — 넘기는 품목+수량 줄. `item_name_snapshot`·`mes_code_snapshot` 으로 당시 품목 정보를 박제하며, 수량은 > 0 만 허용.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/item.py]] — 인계 줄이 가리키는 품목 마스터.
- [[ERP/backend/app/models/inventory.py]] — 인수 확인 시 이동되는 재고.
- [[ERP/backend/app/models/notification.py]] — 인수인계 도착 알림(handover_arrived).

## 조심할 점

시리얼 추적이 없으므로 "분석 내용"(시리얼 목록)은 문서용 자유 텍스트일 뿐, 실제 재고 이동은 품목+수량 줄(HandoverLine)로만 처리됩니다. 시리얼 목록을 재고 단위로 오해하면 안 됩니다.

## 핵심 발췌

```python
class HandoverStatusEnum(str, enum.Enum):
    DRAFT = "draft"          # 작성 중(임시저장)
    SUBMITTED = "submitted"  # 제출됨 — 인수 부서 확인 대기
    RECEIVED = "received"    # 인수 확인 완료 — 재고 이동됨
```
