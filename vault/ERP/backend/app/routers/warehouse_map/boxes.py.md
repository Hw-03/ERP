# boxes.py

## 이 파일은 뭐예요?

창고 지도의 **박스** CRUD·이동·재고 차감 API입니다.  
박스 생성/삭제는 admin PIN, 이동·차감은 창고 관리자 PIN이 필요합니다.  
자리 용량(높이 3) 검증이 포함돼 있습니다.

## 엔드포인트 (주요)

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/api/warehouse-map/boxes` | 박스 목록 |
| POST | `/api/warehouse-map/boxes` | 박스 생성 (admin PIN) |
| PUT | `/api/warehouse-map/boxes/{id}` | 박스 수정 |
| DELETE | `/api/warehouse-map/boxes/{id}` | 박스 삭제 |
| PUT | `/api/warehouse-map/boxes/{id}/move` | 박스 앵글 이동 |
| POST | `/api/warehouse-map/boxes/{id}/items` | 박스에 품목 넣기 |
| DELETE | `/api/warehouse-map/boxes/{id}/items/{item_id}` | 박스에서 품목 빼기 |

## 언제 보나요?

- 박스 배치·이동이 안 될 때
- 박스별 재고 차감(box depletion) 기능을 수정할 때

## 건드릴 때 조심할 점

- 박스 추적이 활성화된 상태에서 출고 시 `inv_transfer.py`가 박스를 먼저 차감합니다. 순서 변경 금지

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py.md]] — 지도 서비스
- [[ERP/backend/app/services/inv_transfer.py.md]] — 박스 차감 로직
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/📁__warehouse_map_sections.md]] — 편집 UI
