# inv_effect.py

## 이 파일은 뭐예요?

거래가 재고에 준 영향(증감)을 **스냅샷 차이**로 캡처하고, 취소 시 부호를 반전해 원복하는 모듈입니다.

거래 유형을 몰라도 정확히 역산되며, 새 거래 유형이 생겨도 자동으로 대응합니다.  
캡처된 효과는 `TransactionLog.inventory_effect(JSON)`에 기록됩니다.

## 언제 보나요?

- 거래 취소 후 재고가 정확히 원복되지 않을 때
- TransactionLog의 `inventory_effect` 필드 의미를 파악할 때

## 중요한 내용

효과 항목 형식:
```json
{"scope": "warehouse", "delta": -100}
{"scope": "location", "department": "조립", "status": "DEFECTIVE", "delta": 100}
```
`delta`는 정방향에서 그 셀이 변한 양. 취소는 `-delta`를 적용합니다.

- `capture_before(db, item_id)` — 변경 전 스냅샷 기록
- `capture_effect(before, db, item_id)` — 변경 후 차이 계산·반환
- `replay_reversed(db, item_id, effect)` — 취소 시 역재생

## 위험도

🔴 높음

이 로직이 틀리면 취소 후 재고가 잘못됩니다. 취소 흐름 테스트를 반드시 확인.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/sr_execution.py.md]] — inv_effect를 호출하는 실행 서비스
- [[ERP/backend/app/models/transaction.py.md]] — TransactionLog.inventory_effect 필드

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/inv_base.py.md]]
