# defects.py

## 이 파일은 뭐예요?

불량 재고 격리/해제·KPI 조회 API 라우터. `/defects` 접두사로 4개 엔드포인트를 제공한다.

## 언제 보나요?

- 불량 격리 버튼을 눌렀을 때 어떤 API가 호출되는지 확인할 때
- KPI 카드(검역 수량, 1년 이상 방치, 승인 대기, 오늘 처리)의 계산 로직을 볼 때
- 격리/복귀 요청에 어떤 필드가 필요한지 확인할 때

## 주요 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/defects/locations` | 부서·아이템별 DEFECTIVE 재고 목록. `department` 쿼리 파라미터로 필터 가능 |
| `GET` | `/api/defects/kpi` | KPI 카드 4개 (격리 중 / 1년 이상 방치 / 결재 대기 / 오늘 처리) |
| `POST` | `/api/defects/quarantine` | 즉시 격리. 결재 없음. `mark_defective` 래퍼 |
| `POST` | `/api/defects/unquarantine` | 즉시 정상 복귀. 결재 없음. `unmark_defective` 래퍼 |

### KPI 계산 기준

- `quarantined` — `LocationStatusEnum.DEFECTIVE` + `quantity > 0` 위치 수
- `over_one_year` — `defective_at <= now - 365일`
- `pending_approval` — `requires_department_approval=True` + 상태 `SUBMITTED|RESERVED` + 유형 `DEFECT_SCRAP|DEFECT_RETURN|DEFECT_DISASSEMBLE`
- `processed_today` — 오늘 생성된 `UNMARK_DEFECTIVE`, `DEFECT_SCRAP`, `SUPPLIER_RETURN` 트랜잭션 수

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/models.py]] — InventoryLocation, LocationStatusEnum
- [[ERP/backend/app/services/inventory.py]] — mark_defective, unmark_defective 구현체
- [[ERP/frontend/lib/api/defects.ts]] — 프론트엔드 API 클라이언트

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/📁_routers]]
> - [[ERP/backend/app/services/stock_requests.py]]
> - [[ERP/backend/app/routers/_errors.py]] — ErrorCode, http_error

## 핵심 발췌

```python
@router.post("/quarantine", response_model=DefectActionResult)
def quarantine(payload: QuarantineRequest, db: Session = Depends(get_db)):
    """격리 (즉시, 결재 없음). mark_defective 래퍼 + defective_at 채움."""
    inventory_svc.mark_defective(
        db,
        payload.item_id,
        payload.qty,
        source=payload.source,
        target_dept=target_dept,
        source_dept=source_dept,
    )
    # defective_at 채우기 (sa_update 사용)
    db.add(TransactionLog(
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        reason_category=payload.reason_category,
        reason_memo=payload.reason_memo or None,
        ...
    ))
    db.commit()
```
