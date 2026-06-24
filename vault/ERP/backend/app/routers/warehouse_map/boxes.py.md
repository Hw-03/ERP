# boxes.py

## 이 파일은 뭐예요?

창고 지도의 **박스** CRUD·이동·재고 차감 API입니다.  
박스 추적 켜기/끄기(`PUT /box-tracking`)는 admin PIN, 박스 생성·수정·이동·삭제는 창고 관리자 PIN이 필요합니다.  
자리 용량(높이 3) 검증이 포함돼 있습니다.

## 엔드포인트 (주요)

| 메서드 | 경로 | 역할 |
|--------|------|------|
| PUT | `/api/warehouse-map/box-tracking` | 박스 추적 켜기/끄기 (admin PIN) |
| POST | `/api/warehouse-map/boxes` | 박스 생성 (창고 관리자 PIN) |
| PUT | `/api/warehouse-map/boxes/{id}` | 박스 수정 (창고 관리자 PIN) |
| DELETE | `/api/warehouse-map/boxes/{id}` | 박스 삭제 (창고 관리자 PIN) |
| PATCH | `/api/warehouse-map/boxes/{id}/move` | 박스 앵글 이동 (창고 관리자 PIN) |
| PATCH | `/api/warehouse-map/boxes/restack` | 박스 순서 재정렬 (창고 관리자 PIN) |

## 언제 보나요?

- 박스 배치·이동이 안 될 때
- 박스별 재고 차감(box depletion) 기능을 수정할 때

## 건드릴 때 조심할 점

- 박스 추적이 활성화된 상태에서 출고 시 `inv_transfer.py`가 박스를 먼저 차감합니다. 순서 변경 금지

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py]] — 지도 서비스
- [[ERP/backend/app/services/inv_transfer.py]] — 박스 차감 로직
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/📁__warehouse_map_sections]] — 편집 UI
