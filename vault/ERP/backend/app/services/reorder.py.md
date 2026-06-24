# reorder.py

## 이 파일은 뭐예요?

여러 마스터 엔티티(부서, 제품기호 등)에서 공통으로 쓰이는 **정렬 순서(display_order) 일괄 갱신** 서비스입니다.

이전에는 부서·모델 각각 중복 구현됐던 reorder 패턴을 한 곳으로 통합했습니다.

## 중요한 내용

```python
reorder_by_display_order(
    db, model_class, key_field, items,
    *, order_field="display_order"
)
```

- `key_field`: 식별자 컬럼 이름 (예: `"id"`, `"slot"`, `"item_id"`)
- `items`: `(key, order)` 시퀀스
- 반환: 갱신된 레코드 수

## 언제 보나요?

- 관리자 화면에서 드래그 정렬이 저장 안 될 때
- 새 마스터 엔티티에 정렬 기능을 추가할 때

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/angles.py.md]] — 앵글 정렬 사용
- [[ERP/backend/app/routers/departments.py.md]] — 부서 정렬 사용
